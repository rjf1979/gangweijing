import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { createPgStore } from './db.js';

const app = express();
const root = path.resolve('.');
const dataDir = path.join(root, '.runtime');
const uploadDir = path.join(dataDir, 'uploads');
const resumeFilesDir = path.join(dataDir, 'resume-files');
const resumeStagingDir = path.join(resumeFilesDir, '.staging');
const dbPath = path.join(dataDir, 'db.json');
await fs.mkdir(uploadDir, { recursive: true });
await fs.mkdir(resumeFilesDir, { recursive: true });
await fs.mkdir(resumeStagingDir, { recursive: true });
try { await fs.access(dbPath); } catch { await fs.writeFile(dbPath, JSON.stringify({ users: [], reports: [] })); }
const dbStore = createPgStore();
await dbStore.init();
const readDb = () => dbStore.readDb();
const saveDb = db => dbStore.saveDb(db);
// 后台配置（admin_settings 数据库）：优先于环境变量兜底，保存后立即生效
const appConfig = { openaiApiKey: '', openaiBaseUrl: '', openaiModel: '', openaiVisionModel: '', resendApiKey: '', emailFrom: '' };
await refreshAppConfig();
async function refreshAppConfig() {
  try {
    const row = await dbStore.getAppSettings();
    if (row) {
      appConfig.openaiApiKey = row.openai_api_key || '';
      appConfig.openaiBaseUrl = (row.openai_base_url || '').replace(/\/+$/, '');
      appConfig.openaiModel = row.openai_model || '';
      appConfig.openaiVisionModel = row.openai_vision_model || '';
      appConfig.resendApiKey = row.resend_api_key || '';
      appConfig.emailFrom = row.email_from || '';
    }
  } catch (error) { console.error('读取后台 AI/邮件配置失败：', error.message); }
}
const sessionCookie = (token, maxAge = 60 * 60 * 24 * 30) => `jm_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
function currentSession(req, db) { const cookie = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('jm_session='))?.split('=')[1] || ''; const token = (req.headers['x-session-token'] || cookie); return db.sessions?.find(x => x.token === token && new Date(x.expiresAt) > new Date()); }
function currentUser(req, db) { const session = currentSession(req, db); return session && db.users.find(user => user.id === session.userId); }
const hash = value => crypto.scryptSync(value, 'job-mirror', 64).toString('hex');
const upload = multer({ dest: uploadDir, limits: { fileSize: 10 * 1024 * 1024 } });
// multer/busboy 默认按 latin1 解码 multipart 文件名，中文文件名会变乱码，这里尝试还原为 UTF-8
const normalizeResumeFileName = name => {
  if (typeof name !== 'string' || !name) return name || '';
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  if (decoded !== name && !decoded.includes('\uFFFD') && /[\u4e00-\u9fff]/.test(decoded)) return decoded;
  return name;
};
const aiBaseUrl = () => (appConfig.openaiBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const outputText = payload => payload.output_text || payload.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text || '';
async function callResponses(body) { await refreshAppConfig(); const response = await fetch(`${aiBaseUrl()}/responses`, { method: 'POST', headers: { Authorization: `Bearer ${appConfig.openaiApiKey || process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!response.ok) throw new Error(`GPT 接口返回 ${response.status}`); return response.json(); }
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const cleanReportPart = (value, fallback) => String(value || fallback).trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-').slice(0, 40) || fallback;
function reportName(createdAt, companyShortName, jobTitle) {
  const date = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(createdAt)).replace(/\//g, '-');
  return `${date}_${cleanReportPart(companyShortName, '未知公司')}_${cleanReportPart(jobTitle, '未命名岗位')}`;
}
const verificationHash = token => crypto.createHash('sha256').update(token).digest('hex');
const publicAppUrl = () => {
  const mode = (process.env.APP_URL_MODE || (process.env.NODE_ENV === 'production' ? 'server' : 'local')).toLowerCase();
  const configuredUrl = mode === 'server' ? process.env.SERVER_APP_URL : process.env.LOCAL_APP_URL;
  return (configuredUrl || process.env.APP_URL || `http://localhost:${process.env.PORT || 3215}`).replace(/\/$/, '');
};
function issueVerification(user) {
  const token = crypto.randomBytes(32).toString('base64url');
  user.emailVerificationTokenHash = verificationHash(token);
  user.emailVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  user.verificationSentAt = new Date().toISOString();
  return token;
}
async function sendEmail(message) {
  await refreshAppConfig();
  const resendKey = appConfig.resendApiKey || process.env.RESEND_API_KEY;
  const from = appConfig.emailFrom || process.env.EMAIL_FROM;
  if (!resendKey || !from) throw new Error('邮件服务尚未配置。');
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, ...message }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || `邮件发送失败：${response.status}`);
  return result.id || null;
}
async function sendVerificationEmail(email, token) {
  const verificationUrl = `${publicAppUrl()}/verify-email/${token}`;
  return sendEmail({ to: [email], subject: '验证你的岗位镜邮箱', html: `<h1>验证邮箱</h1><p>请点击下面的链接完成岗位镜邮箱验证：</p><p><a href="${escapeHtml(verificationUrl)}">验证邮箱并继续</a></p><p>链接在 24 小时内有效。如果不是你发起的注册，可以忽略此邮件。</p>` });
}
async function sendReportEmail(email, reportUrl, report) {
  if (!email) return;
  return sendEmail({ to: [email], subject: '你的岗位镜分析报告已完成', html: `<h1>岗位分析已完成</h1><p>${escapeHtml(report.summary || '已生成岗位与简历的分维度分析。')}</p><p><a href="${escapeHtml(reportUrl)}">查看完整分析报告</a></p><p>请保存好此地址。持有链接的人可以查看报告，请勿公开分享。</p>` });
}
app.use(express.json());
// 前端构建产物随发行包一起部署，避免依赖服务器工作目录外的文件。
const h5Dir = path.join(root, 'public', 'h5');
const pcDir = path.join(root, 'public', 'pc');
const sendH5 = (req, res) => res.sendFile(path.join(h5Dir, 'index.html'));
const sendPc = (req, res) => res.sendFile(path.join(pcDir, 'index.html'));
const isMobileUA = ua => /Mobile|Android|iPhone|iPad|iPod|Windows Phone|IEMobile|webOS|BlackBerry|MicroMessenger/i.test(ua || '');
const h5 = (hashPath) => (req, res) => res.redirect('/#' + hashPath);
const pageByUA = (hashPath) => (req, res) => isMobileUA(req.headers['user-agent']) ? res.redirect('/#' + hashPath) : sendPc(req, res);
app.use('/pc', express.static(pcDir));
// PC 浏览器访问首页直接进入 PC 版（Vue3 复刻第一版流程），移动端保持原有 H5 逻辑
app.use((req, res, next) => {
  if (req.path === '/' && !isMobileUA(req.headers['user-agent'])) return sendPc(req, res);
  return next();
});
app.use(express.static(h5Dir));
app.get('/', sendH5);
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || (password || '').length < 8) return res.status(400).json({ error: '请输入有效邮箱和至少 8 位密码。' });
  const db = await readDb(); db.sessions ||= []; if (db.users.some(user => user.email === normalizedEmail)) return res.status(409).json({ error: '该邮箱已注册，请直接登录。' });
  const user = { id: crypto.randomUUID(), email: normalizedEmail, passwordHash: hash(password), emailVerifiedAt: null, createdAt: new Date().toISOString() };
  const verificationToken = issueVerification(user); db.users.push(user); const token = crypto.randomBytes(32).toString('hex'); db.sessions.push({ token, userId: user.id, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() }); await saveDb(db);
  let verificationEmailSent = false; try { user.verificationMessageId = await sendVerificationEmail(user.email, verificationToken); user.verificationEmailStatus = 'sent'; verificationEmailSent = true; } catch (error) { user.verificationEmailStatus = 'failed'; user.verificationEmailError = error.message; } await saveDb(db);
  res.setHeader('Set-Cookie', sessionCookie(token)); res.json({ user: { id: user.id, email: user.email, emailVerified: false }, verificationEmailSent });
});
app.post('/api/login', async (req, res) => { const { email, password } = req.body; const db = await readDb(); db.sessions ||= []; const user = db.users.find(x => x.email === String(email || '').trim().toLowerCase() && x.passwordHash === hash(password || '')); if (!user) return res.status(401).json({ error: '邮箱或密码不正确。' }); const token = crypto.randomBytes(32).toString('hex'); db.sessions.push({ token, userId: user.id, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() }); await saveDb(db); res.setHeader('Set-Cookie', sessionCookie(token)); res.json({ user: { id: user.id, email: user.email, emailVerified: Boolean(user.emailVerifiedAt) } }); });
app.get('/api/session', async (req, res) => { const db = await readDb(); const session = currentSession(req, db); const user = session && db.users.find(x => x.id === session.userId); res.json({ authenticated: Boolean(user), user: user ? { id: user.id, email: user.email, emailVerified: Boolean(user.emailVerifiedAt) } : null }); });
app.post('/api/verification-email', async (req, res) => { const db = await readDb(); const user = currentUser(req, db); if (!user) return res.status(401).json({ error: '请先登录。' }); if (user.emailVerifiedAt) return res.json({ verified: true }); const elapsed = Date.now() - new Date(user.verificationSentAt || 0).getTime(); if (elapsed < 60000) return res.status(429).json({ error: `请在 ${Math.ceil((60000 - elapsed) / 1000)} 秒后重试。` }); const token = issueVerification(user); await saveDb(db); try { user.verificationMessageId = await sendVerificationEmail(user.email, token); user.verificationEmailStatus = 'sent'; delete user.verificationEmailError; await saveDb(db); res.json({ sent: true }); } catch (error) { user.verificationEmailStatus = 'failed'; user.verificationEmailError = error.message; await saveDb(db); res.status(502).json({ error: `验证邮件发送失败：${error.message}` }); } });
app.post('/api/verify-email', async (req, res) => { const token = String(req.body?.token || ''); if (!token) return res.status(400).json({ error: '验证链接无效。' }); const db = await readDb(); const tokenHash = verificationHash(token); const user = db.users.find(item => item.emailVerificationTokenHash === tokenHash); if (!user || !user.emailVerificationExpiresAt || new Date(user.emailVerificationExpiresAt) <= new Date()) return res.status(400).json({ error: '验证链接无效或已过期，请重新发送。' }); user.emailVerifiedAt = new Date().toISOString(); delete user.emailVerificationTokenHash; delete user.emailVerificationExpiresAt; delete user.verificationEmailError; user.verificationEmailStatus = 'verified'; await saveDb(db); res.json({ verified: true, email: user.email }); });
app.get('/api/resume', async (req, res) => { const db = await readDb(); const user = currentUser(req, db); if (!user) return res.status(401).json({ error: '请先登录。' }); res.json({ hasResume: Boolean(user.resumeText), text: user.resumeText || '', updatedAt: user.resumeUpdatedAt || user.createdAt, resumeFile: user.resumeFilePath ? { name: user.resumeFileName || '简历文件', mime: user.resumeFileMime || 'application/octet-stream', size: user.resumeFileSize || 0, uploadedAt: user.resumeFileUploadedAt || null } : null }); });
const FILE_REF_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isSafeFileRef = value => typeof value === 'string' && FILE_REF_RE.test(value);
async function readStagingMeta(fileRef) {
  try {
    const meta = JSON.parse(await fs.readFile(path.join(resumeStagingDir, fileRef + '.meta.json'), 'utf8'));
    return { name: String(meta.name || 'resume').slice(0, 255), mime: String(meta.mime || 'application/octet-stream').slice(0, 200), size: Number(meta.size) || 0 };
  } catch { return null; }
}
app.put('/api/resume', async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: '简历内容不能为空。' });
  const fileRef = String(req.body?.fileRef || '');
  const db = await readDb();
  const user = currentUser(req, db);
  if (!user) return res.status(401).json({ error: '请先登录。' });
  user.resumeText = text;
  user.resumeUpdatedAt = new Date().toISOString();
  if (fileRef) {
    if (!isSafeFileRef(fileRef)) return res.status(400).json({ error: '简历文件标识无效，请重新上传。' });
    const stagingPath = path.join(resumeStagingDir, fileRef);
    let stat;
    try { stat = await fs.stat(stagingPath); } catch { return res.status(400).json({ error: '简历文件已失效，请重新上传。' }); }
    if (!stat.isFile()) return res.status(400).json({ error: '简历文件已失效，请重新上传。' });
    const meta = await readStagingMeta(fileRef);
    const userDir = path.join(resumeFilesDir, user.id);
    await fs.mkdir(userDir, { recursive: true });
    const target = path.join(userDir, fileRef);
    const oldPath = user.resumeFilePath ? path.join(dataDir, user.resumeFilePath) : null;
    await fs.rename(stagingPath, target).catch(async () => { await fs.copyFile(stagingPath, target); await fs.unlink(stagingPath).catch(() => {}); });
    await fs.unlink(path.join(resumeStagingDir, fileRef + '.meta.json')).catch(() => {});
    user.resumeFileName = meta?.name || 'resume.pdf';
    user.resumeFileMime = meta?.mime || 'application/octet-stream';
    user.resumeFileSize = meta?.size || stat.size || 0;
    user.resumeFilePath = 'resume-files/' + user.id + '/' + fileRef;
    user.resumeFileUploadedAt = new Date().toISOString();
    if (oldPath && oldPath !== target) await fs.rm(oldPath, { force: true }).catch(() => {});
  }
  await saveDb(db);
  res.json({ saved: true, hasResumeFile: Boolean(user.resumeFilePath) });
});
async function extractResume(file) {
  if (file.mimetype === 'application/pdf') { const parser = new PDFParse({ data: await fs.readFile(file.path) }); const result = await parser.getText(); await parser.destroy(); return result.text; }
  if (file.mimetype.includes('wordprocessingml')) return (await mammoth.extractRawText({ path: file.path })).value;
  throw new Error('仅支持 PDF 或 DOCX 简历。');
}
app.post('/api/extract/resume', upload.single('resume'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: '请选择要上传的简历文件。' });
  try {
    const text = await extractResume(file);
    const fileRef = crypto.randomUUID();
    // 保留原始文件到暂存区，等保存简历时归档到用户目录（原始文件名仅存库，磁盘用 UUID 命名）
    await fs.rename(file.path, path.join(resumeStagingDir, fileRef)).catch(async () => { await fs.copyFile(file.path, path.join(resumeStagingDir, fileRef)); await fs.unlink(file.path).catch(() => {}); });
    await fs.writeFile(path.join(resumeStagingDir, fileRef + '.meta.json'), JSON.stringify({ name: normalizeResumeFileName(file.originalname) || 'resume', mime: file.mimetype || 'application/octet-stream', size: file.size || 0 }));
    res.json({ text, fileRef });
  } catch (error) {
    await fs.unlink(file.path).catch(() => {});
    res.status(400).json({ error: error.message });
  }
});
app.post('/api/extract/screenshot', upload.single('screenshot'), async (req, res) => { try { if (!req.file?.mimetype.startsWith('image/')) return res.status(400).json({ error: '请上传有效的岗位截图。' }); await refreshAppConfig(); if (!(appConfig.openaiApiKey || process.env.OPENAI_API_KEY)) return res.status(503).json({ error: '尚未配置 AI 接口。' }); const image = `data:${req.file.mimetype};base64,${(await fs.readFile(req.file.path)).toString('base64')}`; const prompt = '识别这张招聘岗位截图。完整保留职责、要求、薪资、地点、公司和岗位名称，不要补充图片中不存在的信息。输出严格 JSON：{"company_short_name":"","job_title":"","text":"","warnings":[]}。公司简称应去掉有限公司等工商后缀；无法确认的内容留空并放入 warnings。'; const payload = await callResponses({ model: appConfig.openaiVisionModel || process.env.OPENAI_VISION_MODEL || appConfig.openaiModel || process.env.OPENAI_MODEL, input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }, { type: 'input_image', image_url: image }] }], text: { format: { type: 'json_object' } } }); const result = JSON.parse(outputText(payload) || '{}'); res.json({ text: result.text || '', companyShortName: result.company_short_name || '', jobTitle: result.job_title || '', warnings: result.warnings || [] }); } catch (error) { res.status(502).json({ error: `AI 截图识别失败：${error.message}` }); } finally { if (req.file?.path) await fs.unlink(req.file.path).catch(() => {}); } });
app.post('/api/analyze', async (req, res) => {
  await refreshAppConfig(); if (!(appConfig.openaiApiKey || process.env.OPENAI_API_KEY)) return res.status(503).json({ error: '尚未配置 OPENAI_API_KEY，不能生成真实 AI 报告。' });
  const db = await readDb(); const user = currentUser(req, db); if (!user) return res.status(401).json({ error: '请先登录后生成报告。' });
  if (!user.emailVerifiedAt) return res.status(403).json({ error: '请先验证注册邮箱，再生成分析报告。', code: 'EMAIL_NOT_VERIFIED' });
  const { resumeText, jobText, jobTitle, companyShortName } = req.body; const email = user.email;
  if (!resumeText || !jobText) return res.status(400).json({ error: '请先提供简历文本和岗位内容。' });
  const prompt = `你是严谨的中文职业顾问。只依据给出的简历与岗位内容分析，不能承诺 offer 或虚构经历。输出严格 JSON：{company_short_name,job_title,summary, qualification:{status,evidence,risks}, dimensions:[{name,score_0_to_5,evidence,gap}], verify:[string], resume_rewrite:[{section,original_issue,rewrite_direction,example}], actions:[string]}。company_short_name 去掉有限公司等工商后缀。公司简称：${companyShortName || '请从岗位正文识别'}\n岗位名称：${jobTitle || '请从岗位正文识别'}\n岗位内容：${jobText}\n简历：${resumeText}`;
  try {
    const payload = await callResponses({ model: appConfig.openaiModel || process.env.OPENAI_MODEL, input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }], temperature: 0.2, text: { format: { type: 'json_object' } } });
    const report = JSON.parse(outputText(payload) || '{}');
    const createdAt = new Date().toISOString(); const finalCompany = companyShortName || report.company_short_name || ''; const finalJobTitle = jobTitle || report.job_title || ''; const accessToken = crypto.randomBytes(24).toString('base64url'); const record = { id: crypto.randomUUID(), accessToken, userId: user.id, email, companyShortName: finalCompany, jobTitle: finalJobTitle, reportName: reportName(createdAt, finalCompany, finalJobTitle), status: 'completed', emailStatus: 'pending', report, createdAt, updatedAt: createdAt }; db.reports.push(record); await saveDb(db);
    const reportUrl = `${publicAppUrl()}/report/${accessToken}`;
    let emailSent = false; try { await sendReportEmail(email, reportUrl, report); emailSent = Boolean(email && (appConfig.resendApiKey || process.env.RESEND_API_KEY) && (appConfig.emailFrom || process.env.EMAIL_FROM)); record.emailStatus = emailSent ? 'sent' : 'not_configured'; } catch (emailError) { record.emailStatus = 'failed'; console.error(emailError.message); } record.updatedAt = new Date().toISOString(); await saveDb(db);
    res.json({ id: record.id, reportName: record.reportName, reportUrl, emailSent, report });
  } catch (error) { res.status(502).json({ error: `AI 分析失败：${error.message}` }); }
});
app.get('/api/reports', async (req, res) => { const db = await readDb(); const user = currentUser(req, db); if (!user) return res.status(401).json({ error: '请先登录。' }); const appUrl = publicAppUrl(); const reports = db.reports.filter(item => item.userId === user.id || (!item.userId && item.email === user.email)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(item => ({ id: item.id, reportName: item.reportName || reportName(item.createdAt, item.companyShortName, item.jobTitle), jobTitle: item.jobTitle || '未命名岗位', status: item.status || 'completed', emailStatus: item.emailStatus || 'unknown', createdAt: item.createdAt, reportUrl: item.accessToken ? `${appUrl}/report/${item.accessToken}` : null })); res.json({ reports }); });
app.get('/api/reports/:token', async (req, res) => { const db = await readDb(); const record = db.reports.find(item => item.accessToken === req.params.token); if (!record) return res.status(404).json({ error: '报告不存在或链接无效。' }); res.setHeader('Cache-Control', 'private, no-store'); res.json({ reportName: record.reportName || reportName(record.createdAt, record.companyShortName, record.jobTitle), jobTitle: record.jobTitle, createdAt: record.createdAt, report: record.report }); });
// 旧 URL -> uni-app H5 页面重定向（邮件链接与旧书签不失效）
app.get('/report/:token', (req, res) => {
  if (isMobileUA(req.headers['user-agent'])) return res.redirect('/#/pages/report/detail?token=' + encodeURIComponent(req.params.token));
  return sendPc(req, res);
});
app.get('/verify-email/:token', (req, res) => {
  if (isMobileUA(req.headers['user-agent'])) return res.redirect('/#/pages/auth/index?verify=' + encodeURIComponent(req.params.token));
  return sendPc(req, res);
});
app.get('/resume', pageByUA('/pages/resume/index'));
app.get('/facts', pageByUA('/pages/facts/index'));
app.get('/job', pageByUA('/pages/job/index'));
app.get('/report', pageByUA('/pages/report/list'));
app.get('/reports', pageByUA('/pages/report/list'));
app.get('/my-resume', pageByUA('/pages/my/index'));
// 其它非 API/静态路径 fallback：PC 浏览器回 PC SPA，移动端回 H5 SPA
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/assets/')) return next();
  if (isMobileUA(req.headers['user-agent'])) return sendH5(req, res);
  return sendPc(req, res);
});
// 临时文件清理：uploads 超过 1 小时、简历暂存区超过 24 小时未保存的文件删除
async function cleanupTempFiles() {
  const now = Date.now();
  const sweep = async (dir, maxAgeMs) => {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const p = path.join(dir, entry.name);
      try { const stat = await fs.stat(p); if (now - stat.mtimeMs > maxAgeMs) await fs.rm(p, { force: true }); } catch {}
    }
  };
  await sweep(uploadDir, 60 * 60 * 1000);
  await sweep(resumeStagingDir, 24 * 60 * 60 * 1000);
}
cleanupTempFiles();
setInterval(cleanupTempFiles, 60 * 60 * 1000).unref();
const port = Number(process.env.PORT || 3215);
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => console.log(`岗位镜运行在 http://${host}:${port}`));
