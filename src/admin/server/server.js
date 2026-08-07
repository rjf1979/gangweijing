import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createPgStore } from './db.js';

const app = express();
const root = path.resolve('.');
const webDist = path.join(root, 'dist');
const store = createPgStore();
await store.init();

// ===== 基础工具 =====
const hashPassword = password => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
};
const verifyPassword = (password, stored) => {
  if (!stored || !stored.includes(':')) return false;
  const [salt, expected] = stored.split(':');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(expected, 'hex'));
};
const publicAdmin = admin => ({ id: admin.id, email: admin.email, createdAt: admin.created_at?.toISOString?.() || admin.created_at, lastLoginAt: admin.last_login_at?.toISOString?.() || admin.last_login_at || null });

// 登录限流：每邮箱 10 次 / 15 分钟
const loginAttempts = new Map();
function checkLoginLimit(email) {
  const now = Date.now();
  const record = loginAttempts.get(email);
  if (!record || now > record.resetAt) {
    loginAttempts.set(email, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return { allowed: true };
  }
  record.count += 1;
  return { allowed: record.count <= 10, retryAfter: Math.ceil((record.resetAt - now) / 1000) };
}
function clearLoginLimit(email) { loginAttempts.delete(email); }

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

async function requireAdmin(req, res, next) {
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: '未登录或登录已过期。' });
  const session = await store.findSession(token);
  if (!session) return res.status(401).json({ error: '未登录或登录已过期。' });
  if (new Date(session.expires_at) <= new Date()) {
    await store.deleteSession(token);
    return res.status(401).json({ error: '登录已过期，请重新登录。' });
  }
  req.admin = { id: session.admin_id, email: session.email, createdAt: session.created_at };
  req.sessionToken = token;
  next();
}

const parsePage = value => {
  const page = Math.max(1, parseInt(value, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(process.env.ADMIN_PAGE_SIZE, 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
};
const iso = value => value && new Date(value).toISOString();

// ===== 认证 =====
app.post('/api/admin/login', express.json(), async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) return res.status(400).json({ error: '请输入邮箱和密码。' });
  const limit = checkLoginLimit(email);
  if (!limit.allowed) return res.status(429).json({ error: `尝试过于频繁，请在 ${limit.retryAfter} 秒后重试。` });
  const admin = await store.findAdminByEmail(email);
  if (!admin || !verifyPassword(password, admin.password_hash)) {
    return res.status(401).json({ error: '邮箱或密码不正确。' });
  }
  clearLoginLimit(email);
  const token = crypto.randomBytes(32).toString('hex');
  await store.createSession({ token, adminId: admin.id, expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString() });
  await store.updateAdminLastLogin(admin.id);
  res.json({ token, admin: publicAdmin({ ...admin, last_login_at: new Date().toISOString() }) });
});

app.post('/api/admin/logout', express.json(), async (req, res) => {
  const token = bearerToken(req);
  if (token) await store.deleteSession(token);
  res.json({ ok: true });
});

app.get('/api/admin/me', requireAdmin, async (req, res) => {
  res.json({ admin: publicAdmin(req.admin) });
});

// ===== 统计概览 =====
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayIso = startOfToday.toISOString();
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);
  const weekIso = startOfWeek.toISOString();

  const [totalUsers, todayUsers, weekUsers, verifiedUsers, usersWithResume,
    totalReports, todayReports, weekReports, statusBreakdown, emailStatusBreakdown,
    trend, recentUsers, recentReports] = await Promise.all([
    store.countUsers(), store.countUsersSince(todayIso), store.countUsersSince(weekIso),
    store.countVerifiedUsers(), store.countUsersWithResume(),
    store.countReports(), store.countReportsSince(todayIso), store.countReportsSince(weekIso),
    store.reportStatusBreakdown(), store.reportEmailStatusBreakdown(),
    store.trend(14), store.recentUsers(6), store.recentReports(6),
  ]);

  res.json({
    users: { total: totalUsers, today: todayUsers, week: weekUsers, verified: verifiedUsers, withResume: usersWithResume },
    reports: { total: totalReports, today: todayReports, week: weekReports },
    statusBreakdown,
    emailStatusBreakdown,
    trend,
    recentUsers,
    recentReports,
    generatedAt: new Date().toISOString(),
  });
});

// ===== 用户管理 =====
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const { page, pageSize, offset } = parsePage(req.query.page);
  const [rows, total] = await Promise.all([store.searchUsers(q, { limit: pageSize, offset }), store.countSearchUsers(q)]);
  res.json({ users: rows, total, page, pageSize });
});

app.get('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const user = await store.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在。' });
  const reports = await store.getUserReports(user.id);
  res.json({
    user: {
      id: user.id, email: user.email, emailVerifiedAt: iso(user.email_verified_at),
      createdAt: iso(user.created_at), resumeText: user.resume_text || '',
      resumeUpdatedAt: iso(user.resume_updated_at),
      verificationEmailStatus: user.verification_email_status || 'none',
    },
    reports: reports.map(r => ({
      id: r.id, companyShortName: r.company_short_name, jobTitle: r.job_title,
      reportName: r.report_name, status: r.status, emailStatus: r.email_status,
      createdAt: iso(r.created_at), accessToken: r.access_token,
    })),
  });
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const user = await store.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在。' });
  await store.deleteUser(user.id);
  res.json({ ok: true, deleted: user.id });
});

// ===== 报告管理 =====
app.get('/api/admin/reports', requireAdmin, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '').trim();
  const emailStatus = String(req.query.emailStatus || '').trim();
  const { page, pageSize, offset } = parsePage(req.query.page);
  const [rows, total] = await Promise.all([
    store.searchReports({ q, status, emailStatus, limit: pageSize, offset }),
    store.countSearchReports({ q, status, emailStatus }),
  ]);
  res.json({ reports: rows, total, page, pageSize });
});

app.get('/api/admin/reports/:id', requireAdmin, async (req, res) => {
  const report = await store.getReportById(req.params.id);
  if (!report) return res.status(404).json({ error: '报告不存在。' });
  res.json({
    report: {
      id: report.id, accessToken: report.access_token, userId: report.user_id,
      email: report.email, companyShortName: report.company_short_name,
      jobTitle: report.job_title, reportName: report.report_name,
      status: report.status, emailStatus: report.email_status,
      createdAt: iso(report.created_at), updatedAt: iso(report.updated_at),
      data: report.report,
    },
  });
});

app.delete('/api/admin/reports/:id', requireAdmin, async (req, res) => {
  const report = await store.getReportById(req.params.id);
  if (!report) return res.status(404).json({ error: '报告不存在。' });
  await store.deleteReport(report.id);
  res.json({ ok: true, deleted: report.id });
});

// ===== 系统设置 =====
app.get('/api/admin/settings', requireAdmin, async (req, res) => {
  const [settings, admins] = await Promise.all([store.getSettings(), store.listAdmins()]);
  res.json({
    settings,
    admins: admins.map(publicAdmin),
    environment: {
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
      emailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
      model: process.env.OPENAI_MODEL || '未配置',
      baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    },
  });
});

app.put('/api/admin/settings', express.json(), requireAdmin, async (req, res) => {
  const siteName = String(req.body?.siteName || '').trim().slice(0, 60);
  const announcement = String(req.body?.announcement || '').trim().slice(0, 500);
  const freeQuota = Math.max(0, Math.min(999, parseInt(req.body?.freeQuota, 10) || 0));
  const registrationEnabled = Boolean(req.body?.registrationEnabled);
  if (!siteName) return res.status(400).json({ error: '站点名称不能为空。' });
  await store.updateSettings({ siteName, announcement, freeQuota, registrationEnabled });
  res.json({ ok: true, settings: { siteName, announcement, freeQuota, registrationEnabled } });
});

app.post('/api/admin/password', express.json(), requireAdmin, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) return res.status(400).json({ error: '请填写原密码和新密码。' });
  if (String(newPassword).length < 8) return res.status(400).json({ error: '新密码至少 8 位。' });
  const admin = await store.findAdminByEmail(req.admin.email);
  if (!admin || !verifyPassword(String(oldPassword), admin.password_hash)) {
    return res.status(400).json({ error: '原密码不正确。' });
  }
  await store.updateAdminPassword(admin.id, hashPassword(String(newPassword)));
  await store.deleteSessionsForAdmin(admin.id);
  res.json({ ok: true });
});

app.post('/api/admin/admins', express.json(), requireAdmin, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: '邮箱格式不正确。' });
  if (password.length < 8) return res.status(400).json({ error: '密码至少 8 位。' });
  if (await store.findAdminByEmail(email)) return res.status(409).json({ error: '该管理员邮箱已存在。' });
  await store.createAdmin({ id: crypto.randomUUID(), email, passwordHash: hashPassword(password) });
  res.json({ ok: true });
});

app.delete('/api/admin/admins/:id', requireAdmin, async (req, res) => {
  if (req.params.id === req.admin.id) return res.status(400).json({ error: '不能删除当前登录的管理员。' });
  const admins = await store.listAdmins();
  if (admins.length <= 1) return res.status(400).json({ error: '至少保留一个管理员账号。' });
  await store.deleteAdmin(req.params.id);
  res.json({ ok: true, deleted: req.params.id });
});

// ===== 404 处理 =====
app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在。' }));

// ===== 静态托管前端 =====
app.use(express.static(webDist, { index: false, maxAge: '1h' }));
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  const indexFile = path.join(webDist, 'index.html');
  if (!fs.existsSync(indexFile)) return res.status(503).json({ error: '前端尚未构建，请先运行 npm run build。' });
  res.sendFile(indexFile);
});

// ===== 启动 =====
async function bootstrap() {
  const email = String(process.env.ADMIN_INIT_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_INIT_PASSWORD || '';
  if (email && password) {
    const existing = await store.findAdminByEmail(email);
    if (!existing) {
      await store.createAdmin({ id: crypto.randomUUID(), email, passwordHash: hashPassword(password) });
      console.log(`已创建初始管理员：${email}`);
    }
  }
}
await bootstrap();

const port = Number(process.env.PORT || 3216);
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => console.log(`岗位镜管理后台运行在 http://${host}:${port}`));