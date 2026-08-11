import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createPgStore } from './db.js';
import { SAMPLE_RESUME } from './resumeTemplates/sampleResume.js';
import { BUILTIN_TEMPLATE_META } from './resumeTemplates/builtin-meta.js';

const app = express();
const root = path.resolve('.');
const webDist = path.join(root, 'dist');
const store = createPgStore();
await store.init();
// 内置简历模板种子（仅当不存在或来源为 builtin 时同步，不覆盖 AI/人工编辑）
try {
  const seeded = await store.seedBuiltinResumeTemplates();
  console.log(`内置简历模板已同步：${seeded.imported} 套${seeded.skipped ? `，跳过 AI/人工模板 ${seeded.skipped} 套` : ''}`);
} catch (error) {
  console.error('内置简历模板同步失败：', error.message);
}

// 用户端上传的简历原文件目录（用户端默认在 src/frontend/server/.runtime 下，可用 FRONTEND_DATA_DIR 覆盖）
const frontendDataDir = path.resolve(process.env.FRONTEND_DATA_DIR || '../../frontend/server/.runtime');
// 数据库中的相对路径白名单：仅允许 resume-files/ 下的相对路径，防止路径穿越
const safeRelPath = value => {
  if (typeof value !== 'string' || !value) return null;
  const normalized = value.replace(/\\/g, '/');
  if (normalized.includes('..') || path.posix.isAbsolute(normalized) || !normalized.startsWith('resume-files/')) return null;
  return normalized;
};
const publicResumeFile = user => {
  if (!user?.resume_file_path || !safeRelPath(user.resume_file_path)) return null;
  return {
    name: user.resume_file_name || '简历文件',
    mime: user.resume_file_mime || 'application/octet-stream',
    size: Number(user.resume_file_size) || 0,
    uploadedAt: iso(user.resume_file_uploaded_at),
  };
};
async function removeUserResumeDir(user) {
  const relPath = safeRelPath(user?.resume_file_path);
  if (!relPath) return;
  const dir = path.posix.dirname(relPath);
  if (!dir || dir === '.') return;
  await fs.promises.rm(path.join(frontendDataDir, dir), { recursive: true, force: true }).catch(() => {});
}

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

// ===== AI 调用（简历模板 AI 重新生成用） =====
// 凭证优先级：模型绑定 Key > 当前使用 Key > 环境变量；Base URL 同理由 Key 提供
async function resolveAiModel(modelType = 'text') {
  try { const row = await store.getDefaultAiModel(modelType); if (row) return row; } catch (error) { console.error('读取默认 AI 模型失败：', error.message); }
  return null;
}
async function resolveAiCredential(model) {
  if (model?.apiKeyId) {
    try {
      const bound = await store.getAiKeyById(model.apiKeyId);
      if (bound && bound.enabled && bound.apiKey) return { apiKey: bound.apiKey, baseUrl: (bound.baseUrl || '').replace(/\/+$/, '') || null };
    } catch (error) { console.error('读取模型绑定 Key 失败：', error.message); }
  }
  try {
    const def = await store.getDefaultAiKey();
    if (def && def.enabled && def.apiKey) return { apiKey: def.apiKey, baseUrl: (def.baseUrl || '').replace(/\/+$/, '') || null };
  } catch (error) { console.error('读取当前使用 Key 失败：', error.message); }
  return { apiKey: process.env.OPENAI_API_KEY || '', baseUrl: null };
}
async function callAi(baseUrl, path, body, apiKey, timeoutMs = 120000) {
  const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
  });
  if (!response.ok) {
    let message = `AI 接口返回 ${response.status}`;
    try { const data = await response.json(); message = data?.error?.message || message; } catch {}
    throw new Error(message);
  }
  return response.json();
}
const extractAiText = payload => {
  if (!payload) return '';
  if (Array.isArray(payload.output)) {
    return payload.output
      .map(item => item?.content)
      .filter(Boolean)
      .map(part => (Array.isArray(part) ? part.map(c => c?.text || '').join('') : String(part)))
      .join('');
  }
  if (payload.choices?.[0]?.message?.content) return String(payload.choices[0].message.content);
  if (payload.choices?.[0]?.text) return String(payload.choices[0].text);
  return '';
};
const parsePage = value => {
  const page = Math.max(1, parseInt(value, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(process.env.ADMIN_PAGE_SIZE, 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
};
const iso = value => value && new Date(value).toISOString();
const maskSecret = value => {
  if (!value) return null;
  const s = String(value);
  return s.length <= 8 ? '••••••••' : '••••••••' + s.slice(-4);
};
const isMasked = value => typeof value === 'string' && /[•*]/.test(value);
const parseNullableNumber = value => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const parseNullableInt = value => {
  if (value === '' || value === null || value === undefined) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
// 大模型公司预设名称（用于选择与展示，参考价目按厂商归类）
const MODEL_TYPES = ['text'];
const API_PROTOCOLS = ['chat_completions', 'responses'];
const PROVIDER_LABELS = {
  openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google', deepseek: 'DeepSeek',
  qwen: '阿里通义千问', 'z-ai': '智谱 GLM', moonshotai: 'Kimi（月之暗面）', moonshot: 'Kimi（月之暗面）',
  minimax: 'MiniMax', stepfun: '阶跃星辰', '01-ai': '零一万物', baichuan: '百川智能',
  mistralai: 'Mistral', 'meta-llama': 'Meta', 'x-ai': 'xAI', amazon: 'AWS Bedrock',
  microsoft: '微软 Azure', cohere: 'Cohere', perplexity: 'Perplexity', baidu: '百度',
  tencent: '腾讯混元', nvidia: 'NVIDIA', internlm: '书生 InternLM',
};
// 参考价目抓取只保留这些知名国内外厂商（OpenRouter 前缀）
const REFERENCE_PROVIDERS = new Set(['openai', 'anthropic', 'google', 'deepseek', 'qwen', 'z-ai', 'moonshotai', 'moonshot', 'minimax', 'stepfun', '01-ai', 'baichuan', 'mistralai', 'meta-llama', 'x-ai', 'amazon', 'microsoft', 'cohere', 'perplexity', 'baidu', 'tencent', 'nvidia', 'internlm']);

// 模型类型 / 接口协议 的可选值与中文标签（供前端下拉选择）
const MODEL_TYPE_LABELS = { text: '文本模型' };
const API_PROTOCOL_LABELS = { chat_completions: 'Chat Completions（/chat/completions）', responses: 'Responses API（/responses）' };

// 各大模型厂商常见模型 ID 建议（文本 / 多模态视觉），仅作为填写时的候选提示，不限制自定义
const PROVIDER_KNOWN_MODELS = {
  openai: { text: ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3', 'o3-mini', 'o4-mini'], multimodal: ['gpt-5', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'] },
  anthropic: { text: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'], multimodal: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022'] },
  google: { text: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'], multimodal: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'] },
  deepseek: { text: ['deepseek-chat', 'deepseek-reasoner'], multimodal: [] },
  qwen: { text: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen3-max', 'qwen3-plus'], multimodal: ['qwen-vl-max', 'qwen-vl-plus', 'qwen2.5-vl-72b-instruct', 'qwen2.5-vl-7b-instruct'] },
  'z-ai': { text: ['glm-4.5', 'glm-4-plus', 'glm-4-air', 'glm-4-flash', 'glm-4-long'], multimodal: ['glm-4v-plus', 'glm-4v-flash', 'glm-4.1v-thinking-flash'] },
  moonshotai: { text: ['kimi-k2-0711-preview', 'kimi-k2-turbo-preview', 'moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k'], multimodal: [] },
  moonshot: { text: ['kimi-k2-0711-preview', 'kimi-k2-turbo-preview', 'moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k'], multimodal: [] },
  minimax: { text: ['MiniMax-Text-01', 'abab6.5s-chat'], multimodal: ['MiniMax-VL-01'] },
  stepfun: { text: ['step-2-16k', 'step-1-32k'], multimodal: ['step-1v-32k', 'step-1o-vision'] },
  '01-ai': { text: ['yi-lightning', 'yi-large', 'yi-medium'], multimodal: ['yi-vision'] },
  baichuan: { text: ['Baichuan4', 'Baichuan3-Turbo'], multimodal: [] },
  mistralai: { text: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'], multimodal: ['pixtral-large-latest'] },
  'meta-llama': { text: ['meta-llama/llama-3.3-70b-instruct', 'meta-llama/llama-3.1-405b-instruct'], multimodal: ['meta-llama/llama-3.2-90b-vision-instruct'] },
  'x-ai': { text: ['grok-3', 'grok-2-latest', 'grok-beta'], multimodal: ['grok-4-vision', 'grok-2-vision-latest'] },
  amazon: { text: ['amazon.nova-pro-v1:0', 'amazon.nova-lite-v1:0'], multimodal: ['amazon.nova-pro-v1:0'] },
  microsoft: { text: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'], multimodal: ['gpt-4o', 'gpt-4o-mini'] },
  cohere: { text: ['command-r-plus', 'command-r'], multimodal: [] },
  perplexity: { text: ['sonar-pro', 'sonar'], multimodal: [] },
  baidu: { text: ['ernie-4.0-turbo-8k', 'ernie-3.5-8k'], multimodal: ['ernie-4.5-vl-28k', 'ernie-4.0-vl-8k'] },
  tencent: { text: ['hunyuan-turbos-latest', 'hunyuan-pro'], multimodal: ['hunyuan-vision'] },
  nvidia: { text: ['meta/llama-3.3-70b-instruct', 'deepseek-ai/deepseek-r1'], multimodal: ['nvidia/llama-3.2-90b-vision-instruct'] },
  internlm: { text: ['internlm3.5-22b-chat', 'internlm2.5-20b-chat'], multimodal: ['internlm-xcomposer2.5-7b'] },
};

// 各大模型厂商默认 API 地址与官网价目页（填写时自动作为占位提示，可覆盖）
const PROVIDER_DEFAULTS = {
  openai: { apiBaseUrl: 'https://api.openai.com/v1', officialUrl: 'https://openai.com/api/pricing/' },
  anthropic: { apiBaseUrl: 'https://api.anthropic.com/v1', officialUrl: 'https://www.anthropic.com/pricing' },
  google: { apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta', officialUrl: 'https://ai.google.dev/gemini-api/docs/pricing' },
  deepseek: { apiBaseUrl: 'https://api.deepseek.com/v1', officialUrl: 'https://api-docs.deepseek.com/quick_start/pricing' },
  qwen: { apiBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', officialUrl: 'https://help.aliyun.com/zh/model-studio/models' },
  'z-ai': { apiBaseUrl: 'https://open.bigmodel.cn/api/paas/v4', officialUrl: 'https://open.bigmodel.cn/pricing' },
  moonshotai: { apiBaseUrl: 'https://api.moonshot.cn/v1', officialUrl: 'https://platform.moonshot.cn/docs/pricing' },
  moonshot: { apiBaseUrl: 'https://api.moonshot.cn/v1', officialUrl: 'https://platform.moonshot.cn/docs/pricing' },
  minimax: { apiBaseUrl: 'https://api.minimax.chat/v1', officialUrl: 'https://platform.minimaxi.com/document/price' },
  stepfun: { apiBaseUrl: 'https://api.stepfun.com/v1', officialUrl: 'https://platform.stepfun.com/docs/pricing' },
  '01-ai': { apiBaseUrl: 'https://api.lingyiwanwu.com/v1', officialUrl: 'https://platform.lingyiwanwu.com/docs' },
  baichuan: { apiBaseUrl: 'https://api.baichuan-ai.com/v1', officialUrl: 'https://platform.baichuan-ai.com/price' },
  mistralai: { apiBaseUrl: 'https://api.mistral.ai/v1', officialUrl: 'https://mistral.ai/pricing' },
  'meta-llama': { apiBaseUrl: 'https://api.together.xyz/v1', officialUrl: 'https://ai.meta.com/llama/' },
  'x-ai': { apiBaseUrl: 'https://api.x.ai/v1', officialUrl: 'https://docs.x.ai/docs/models' },
  amazon: { apiBaseUrl: '', officialUrl: 'https://aws.amazon.com/bedrock/pricing/' },
  microsoft: { apiBaseUrl: 'https://<your-resource>.openai.azure.com/openai/v1', officialUrl: 'https://azure.microsoft.com/pricing/details/cognitive-services/openai-service/' },
  cohere: { apiBaseUrl: 'https://api.cohere.com/v1', officialUrl: 'https://cohere.com/pricing' },
  perplexity: { apiBaseUrl: 'https://api.perplexity.ai', officialUrl: 'https://docs.perplexity.ai/guides/pricing' },
  baidu: { apiBaseUrl: 'https://qianfan.baidubce.com/v2', officialUrl: 'https://cloud.baidu.com/doc/WENXINWORKSHOP/s/hlrk4akp7' },
  tencent: { apiBaseUrl: 'https://api.hunyuan.cloud.tencent.com/v1', officialUrl: 'https://cloud.tencent.com/document/product/1729/97731' },
  nvidia: { apiBaseUrl: 'https://integrate.api.nvidia.com/v1', officialUrl: 'https://build.nvidia.com/' },
  internlm: { apiBaseUrl: 'https://api.intern-ai.org.cn/v1', officialUrl: 'https://internlm.intern-ai.org.cn/' },
};

function parseAiModelBody(body, partial = false) {
  const out = {};
  if (!partial || 'provider' in body) {
    const provider = String(body?.provider || '').trim();
    if (!provider) return { error: '请选择或填写大模型公司名称。' };
    out.provider = provider;
  }
  if (!partial || 'modelId' in body) {
    const modelId = String(body?.modelId || '').trim();
    if (!modelId) return { error: '请填写模型 ID。' };
    if (modelId.length > 200) return { error: '模型 ID 过长。' };
    out.modelId = modelId;
  }
  if (!partial || 'modelType' in body) {
    const modelType = String(body?.modelType || '').trim();
    if (!MODEL_TYPES.includes(modelType)) return { error: '模型类型必须是文本模型。' };
    out.modelType = modelType;
  }
  if (!partial || 'apiProtocol' in body) {
    const apiProtocol = String(body?.apiProtocol || '').trim();
    if (!API_PROTOCOLS.includes(apiProtocol)) return { error: '接口协议不正确。' };
    out.apiProtocol = apiProtocol;
  }
  if ('displayName' in body) out.displayName = String(body.displayName || '').trim().slice(0, 120) || null;
  if ('officialUrl' in body) out.officialUrl = String(body.officialUrl || '').trim().slice(0, 300) || null;
  if ('apiBaseUrl' in body) out.apiBaseUrl = String(body.apiBaseUrl || '').trim().replace(/\/+$/, '') || null;
  if ('inputPrice' in body) out.inputPrice = parseNullableNumber(body.inputPrice);
  if ('outputPrice' in body) out.outputPrice = parseNullableNumber(body.outputPrice);
  if ('contextWindow' in body) out.contextWindow = parseNullableInt(body.contextWindow);
  if ('enabled' in body) out.enabled = Boolean(body.enabled);
  if ('isDefault' in body) out.isDefault = Boolean(body.isDefault);
  if ('multimodal' in body) out.multimodal = Boolean(body.multimodal);
  if ('apiKeyId' in body) out.apiKeyId = body.apiKeyId ? String(body.apiKeyId) : null;
  return out;
}
function parseAiKeyBody(body, partial = false) {
  const out = {};
  if (!partial || 'name' in body) {
    const name = String(body?.name || '').trim();
    if (!name) return { error: '请填写 Key 名称。' };
    if (name.length > 60) return { error: 'Key 名称过长。' };
    out.name = name;
  }
  if ('provider' in body) out.provider = String(body.provider || '').trim().slice(0, 60) || null;
  if ('baseUrl' in body) out.baseUrl = String(body.baseUrl || '').trim().replace(/\/+$/, '') || null;
  if ('remark' in body) out.remark = String(body.remark || '').trim().slice(0, 300) || null;
  if ('enabled' in body) out.enabled = Boolean(body.enabled);
  if ('isDefault' in body) out.isDefault = Boolean(body.isDefault);
  return out;
}

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
  const inviteInfo = await store.getUserInviteInfo(user.id).catch(() => null);
  res.json({
    user: {
      id: user.id, email: user.email, emailVerifiedAt: iso(user.email_verified_at),
      createdAt: iso(user.created_at), resumeText: user.resume_text || '',
      resumeUpdatedAt: iso(user.resume_updated_at),
      resumeFile: publicResumeFile(user),
      resumeStructured: user.resume_structured || null,
      verificationEmailStatus: user.verification_email_status || 'none',
      isTest: Boolean(user.is_test),
      inviteCode: user.invite_code || null,
      invitedByEmail: (inviteInfo && inviteInfo.invited_by_email) || null,
      inviteCount: (inviteInfo && inviteInfo.invite_count) || 0,
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
  if (!user.is_test) return res.status(403).json({ error: '仅测试用户可删除。' });
  await removeUserResumeDir(user);
  await store.deleteUser(user.id);
  res.json({ ok: true, deleted: user.id });
});

// ===== 用户原始简历文件管理 =====
app.get('/api/admin/users/:id/resume-file', requireAdmin, async (req, res) => {
  const user = await store.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在。' });
  const relPath = safeRelPath(user.resume_file_path);
  if (!relPath) return res.status(404).json({ error: '该用户没有原始简历文件。' });
  const filePath = path.join(frontendDataDir, relPath);
  let stat;
  try { stat = await fs.promises.stat(filePath); } catch { return res.status(404).json({ error: '原始简历文件不存在或已被清理。' }); }
  if (!stat.isFile()) return res.status(404).json({ error: '原始简历文件不存在或已被清理。' });
  const name = user.resume_file_name || 'resume';
  const encoded = encodeURIComponent(name).replace(/'/g, '%27');
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.setHeader('Content-Type', user.resume_file_mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${disposition}; filename="resume"; filename*=UTF-8''${encoded}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(filePath, { dotfiles: 'allow' });
});

app.delete('/api/admin/users/:id/resume-file', requireAdmin, async (req, res) => {
  const user = await store.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在。' });
  const relPath = safeRelPath(user.resume_file_path);
  if (!relPath) return res.status(404).json({ error: '该用户没有原始简历文件。' });
  const filePath = path.join(frontendDataDir, relPath);
  await fs.promises.rm(filePath, { force: true }).catch(() => {});
  await fs.promises.rmdir(path.dirname(filePath)).catch(() => {});
  await store.clearResumeFile(user.id);
  res.json({ ok: true });
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
  res.json({ reports: rows.map(r => ({ ...r, cost_usd: r.cost_usd == null ? null : Number(r.cost_usd), costSource: r.cost_source || r.usage?.costSource || null })), total, page, pageSize });
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
      usage: report.usage || null,
      costUsd: report.cost_usd == null ? null : Number(report.cost_usd),
      costSource: report.cost_source || report.usage?.costSource || null,
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
    settings: settings ? {
      site_name: settings.site_name,
      announcement: settings.announcement,
      free_quota: settings.free_quota,
      registration_enabled: settings.registration_enabled,
      resend_api_key_masked: maskSecret(settings.resend_api_key),
      email_from: settings.email_from || null,
      analysis_concurrency: settings.analysis_concurrency ?? 2,
      ai_call_timeout_seconds: settings.ai_call_timeout_seconds ?? 300,
      updated_at: settings.updated_at,
    } : null,
    admins: admins.map(publicAdmin),
  });
});

app.put('/api/admin/settings', express.json(), requireAdmin, async (req, res) => {
  const patch = {};

  // 站点设置：仅在请求体包含对应字段时才校验并更新（部分更新）
  if ('siteName' in req.body) {
    const siteName = String(req.body.siteName || '').trim().slice(0, 60);
    if (!siteName) return res.status(400).json({ error: '站点名称不能为空。' });
    patch.siteName = siteName;
  }
  if ('announcement' in req.body) {
    patch.announcement = String(req.body.announcement || '').trim().slice(0, 500);
  }
  if ('freeQuota' in req.body) {
    patch.freeQuota = Math.max(0, Math.min(999, parseInt(req.body.freeQuota, 10) || 0));
  }
  if ('registrationEnabled' in req.body) {
    patch.registrationEnabled = Boolean(req.body.registrationEnabled);
  }
  if ('analysisConcurrency' in req.body) {
    const n = parseInt(req.body.analysisConcurrency, 10);
    if (!Number.isFinite(n) || n < 1 || n > 10) return res.status(400).json({ error: '分析并发数需为 1-10 的整数。' });
    patch.analysisConcurrency = n;
  }
  if ('aiCallTimeoutSeconds' in req.body) {
    const n = parseInt(req.body.aiCallTimeoutSeconds, 10);
    if (!Number.isFinite(n) || n < 30 || n > 3600) return res.status(400).json({ error: '接口调用超时需为 30-3600 秒。' });
    patch.aiCallTimeoutSeconds = n;
  }

  // 邮件配置（Resend）：同上
  const resendApiKey = String(req.body?.resendApiKey || '').trim();
  if (resendApiKey && !isMasked(resendApiKey)) patch.resendApiKey = resendApiKey;
  if (req.body?.clearResendKey) patch.resendApiKey = '';
  const emailFrom = String(req.body?.emailFrom || '').trim();
  if ('emailFrom' in req.body) patch.emailFrom = emailFrom || null;

  if (Object.keys(patch).length === 0) return res.status(400).json({ error: '没有可保存的配置项。' });

  await store.updateSettings(patch);
  res.json({ ok: true });
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

// ===== API Key 池（官方 / 中转站等多套凭证，模型可绑定；is_default = 当前使用） =====
app.get('/api/admin/ai-keys', requireAdmin, async (req, res) => {
  const keys = await store.listAiKeys();
  res.json({
    keys: keys.map(k => ({
      id: k.id,
      name: k.name,
      provider: k.provider,
      baseUrl: k.baseUrl,
      apiKeyMasked: maskSecret(k.apiKey),
      enabled: k.enabled,
      isDefault: k.isDefault,
      remark: k.remark,
      createdAt: k.createdAt,
      updatedAt: k.updatedAt,
    })),
  });
});

app.post('/api/admin/ai-keys', express.json(), requireAdmin, async (req, res) => {
  const apiKey = String(req.body?.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ error: '请填写 API Key。' });
  const parsed = parseAiKeyBody(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const key = await store.createAiKey({ id: crypto.randomUUID(), apiKey, ...parsed });
  if (key.isDefault) {
    const r = await store.setDefaultAiKey(key.id);
    if (r.error) await store.updateAiKey(key.id, { isDefault: false });
  }
  res.json({ ok: true, key: { ...key, apiKeyMasked: maskSecret(key.apiKey) } });
});

app.put('/api/admin/ai-keys/:id', express.json(), requireAdmin, async (req, res) => {
  const existing = await store.getAiKeyById(req.params.id);
  if (!existing) return res.status(404).json({ error: '该 Key 不存在。' });
  const parsed = parseAiKeyBody(req.body, true);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const apiKey = String(req.body?.apiKey || '').trim();
  if (apiKey && !isMasked(apiKey)) parsed.apiKey = apiKey;
  if (req.body?.clearKey) parsed.apiKey = '';
  const { isDefault, ...rest } = parsed;
  const key = (await store.updateAiKey(existing.id, rest)) || existing;
  if (isDefault === true) {
    const r = await store.setDefaultAiKey(key.id);
    if (r.error) return res.status(400).json({ error: r.error });
  } else if (isDefault === false && existing.isDefault) {
    await store.clearDefaultAiKey(key.id);
  }
  res.json({ ok: true, key: { ...(await store.getAiKeyById(key.id)), apiKeyMasked: maskSecret(key.apiKey) } });
});

app.delete('/api/admin/ai-keys/:id', requireAdmin, async (req, res) => {
  const existing = await store.getAiKeyById(req.params.id);
  if (!existing) return res.status(404).json({ error: '该 Key 不存在。' });
  await store.deleteAiKey(existing.id);
  res.json({ ok: true, deleted: existing.id });
});

app.post('/api/admin/ai-keys/:id/default', requireAdmin, async (req, res) => {
  const existing = await store.getAiKeyById(req.params.id);
  if (!existing) return res.status(404).json({ error: '该 Key 不存在。' });
  const result = await store.setDefaultAiKey(existing.id);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ ok: true, key: { ...(await store.getAiKeyById(existing.id)), apiKeyMasked: maskSecret(existing.apiKey) } });
});

// ===== AI 模型管理（人工维护为主，抓取价目仅作参考） =====
app.get('/api/admin/ai-models', requireAdmin, async (req, res) => {
  const [models, keys] = await Promise.all([store.listAiModels(), store.listAiKeys()]);
  const keyNameMap = new Map(keys.map(k => [k.id, k.name]));
  const enriched = models.map(m => ({ ...m, apiKeyName: m.apiKeyId ? keyNameMap.get(m.apiKeyId) || null : null }));
  res.json({
    models: enriched,
    keys: keys.map(k => ({
      id: k.id,
      name: k.name,
      provider: k.provider,
      baseUrl: k.baseUrl,
      apiKeyMasked: maskSecret(k.apiKey),
      enabled: k.enabled,
      isDefault: k.isDefault,
    })),
    defaultTextId: enriched.find(m => m.modelType === 'text' && m.isDefault)?.id || null,
    defaultMultimodalId: enriched.find(m => m.multimodal && m.isDefault)?.id || null,
    defaultOcrId: enriched.find(m => m.modelType === 'ocr' && m.isDefault)?.id || null,
  });
});

// 前端表单元数据：可选厂商、模型类型、接口协议、常见模型 ID 建议与默认 API 地址
app.get('/api/admin/ai-models/meta', requireAdmin, async (req, res) => {
  res.json({
    providers: Object.entries(PROVIDER_LABELS)
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN')),
    modelTypes: Object.entries(MODEL_TYPE_LABELS).map(([value, label]) => ({ value, label })),
    apiProtocols: Object.entries(API_PROTOCOL_LABELS).map(([value, label]) => ({ value, label })),
    knownModels: PROVIDER_KNOWN_MODELS,
    providerDefaults: PROVIDER_DEFAULTS,
  });
});

app.post('/api/admin/ai-models', express.json(), requireAdmin, async (req, res) => {
  const parsed = parseAiModelBody(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const result = await store.createAiModel({ id: crypto.randomUUID(), ...parsed });
  if (result.conflict) return res.status(409).json({ error: '该厂商下已存在相同模型 ID，请勿重复添加。' });
  if (result.model.isDefault) {
    const r = await store.setDefaultAiModel(result.model.id, result.model.modelType);
    if (r.error) await store.updateAiModel(result.model.id, { isDefault: false });
  }
  res.json({ ok: true, model: result.model });
});

app.put('/api/admin/ai-models/:id', express.json(), requireAdmin, async (req, res) => {
  const existing = await store.getAiModelById(req.params.id);
  if (!existing) return res.status(404).json({ error: '模型不存在。' });
  const parsed = parseAiModelBody(req.body, true);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  if (parsed.modelType && parsed.modelType !== existing.modelType && existing.isDefault) {
    await store.clearDefaultAiModel(existing.id);
  }
  const { isDefault, ...rest } = parsed;
  const model = (await store.updateAiModel(existing.id, rest)) || existing;
  if (isDefault === true) {
    const r = await store.setDefaultAiModel(model.id, model.modelType);
    if (r.error) return res.status(400).json({ error: r.error });
  } else if (isDefault === false && existing.isDefault) {
    await store.clearDefaultAiModel(model.id);
  }
  res.json({ ok: true, model: await store.getAiModelById(model.id) });
});

app.delete('/api/admin/ai-models/:id', requireAdmin, async (req, res) => {
  const existing = await store.getAiModelById(req.params.id);
  if (!existing) return res.status(404).json({ error: '模型不存在。' });
  await store.deleteAiModel(existing.id);
  res.json({ ok: true, deleted: existing.id });
});

app.post('/api/admin/ai-models/:id/default', requireAdmin, async (req, res) => {
  const existing = await store.getAiModelById(req.params.id);
  if (!existing) return res.status(404).json({ error: '模型不存在。' });
  const result = await store.setDefaultAiModel(existing.id, existing.modelType);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ ok: true, model: await store.getAiModelById(existing.id) });
});

const referencePayload = (models, fetchedAt) => {
  const list = [...models].sort((a, b) => a.provider.localeCompare(b.provider, 'zh-CN') || a.id.localeCompare(b.id));
  return {
    fetchedAt: fetchedAt ? new Date(fetchedAt).toISOString() : null,
    source: 'OpenRouter 第三方代理参考价（非官方账单价），仅作填写参考；抓取结果已保存到参考价目库，不写入正式 AI 配置',
    total: list.length,
    providers: [...new Set(list.map(m => m.provider))],
    models: list,
  };
};

// 读取已保存的参考价目（首次拉取后落库，后续从数据库读取展示）
app.get('/api/admin/ai-models/reference', requireAdmin, async (req, res) => {
  const rows = await store.listReferencePrices();
  const metaInfo = await store.getReferenceMeta();
  const models = rows.map(r => ({
    providerKey: r.providerKey,
    provider: r.provider,
    id: r.modelId,
    name: r.displayName,
    contextLength: r.contextLength,
    inputPrice: r.inputPrice,
    outputPrice: r.outputPrice,
  }));
  res.json(referencePayload(models, metaInfo.fetchedAt));
});

// 抓取第三方（OpenRouter）参考价目：拉取后保存到参考价目库，仅作填写参考，不写入正式 AI 配置
app.post('/api/admin/ai-models/fetch', requireAdmin, async (req, res) => {
  let response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/models', { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  } catch (error) {
    return res.status(502).json({ error: `参考价目抓取失败：${error.message}` });
  }
  if (!response.ok) return res.status(502).json({ error: `参考价目抓取失败：OpenRouter 返回 ${response.status}` });
  const data = await response.json().catch(() => null);
  const raw = Array.isArray(data?.data) ? data.data : [];
  const fetchedAt = new Date();
  const models = raw
    .map(m => {
      const pricing = m.pricing || {};
      const providerKey = String(m.id || '').split('/')[0];
      if (!REFERENCE_PROVIDERS.has(providerKey)) return null;
      const inputPrice = pricing.prompt == null ? null : Number(pricing.prompt) * 1e6;
      const outputPrice = pricing.completion == null ? null : Number(pricing.completion) * 1e6;
      return {
        providerKey,
        provider: PROVIDER_LABELS[providerKey] || providerKey,
        id: String(m.id || ''),
        name: m.name || m.id,
        contextLength: m.context_length == null ? null : Number(m.context_length),
        inputPrice: inputPrice == null || !Number.isFinite(inputPrice) ? null : Math.round(inputPrice * 10000) / 10000,
        outputPrice: outputPrice == null || !Number.isFinite(outputPrice) ? null : Math.round(outputPrice * 10000) / 10000,
      };
    })
    .filter(Boolean);
  const saved = await store.replaceReferencePrices(models, fetchedAt);
  res.json({ ...referencePayload(models, fetchedAt), saved: saved.count });
});

// ===== 简历模板（内置 / AI 生成 / 人工编辑） =====
const RESUME_TEMPLATE_FIELDS = `可用字段（模板中禁止出现示例数据，所有内容必须来自占位符）：
basic（已展开到顶层，直接写 {{name}}）：name, gender, birth_year, phone, email, location, current_company, current_title, years_of_experience, expected_salary, job_intention, available_date
summary / self_evaluation
skills.technical[] / skills.tools[] / skills.soft[] / skills.languages[]（数组字段自动用「、」连接）
work_experience[]：company, title, start_date, end_date, industry, responsibilities[], achievements[], skills_used[]
project_experience[]：name, role, start_date, end_date, description, achievements[], tech_stack[]
education[]：school, degree, major, start_date, end_date, gpa, honors[]
certificates[] / awards[] / interests[]（字符串数组）
training[]：name, institution, date, description
languages[]：language, fluency
portfolio[]：name, url, description
open_source[]：name, url, description
publications[]：title, journal, date, authors
references[]：name, company, title, contact`;

const buildResumeTemplatePrompt = ({ name, description, styleNote }) => `你是资深中文简历排版设计师。请为「${name}」设计一套可直接用于 A4 打印的精美 HTML 简历模板。
${description ? `模板定位：${description}
` : ''}${styleNote ? `本次风格要求：${styleNote}
` : ''}
硬性要求：
1. 输出一个完整 HTML 文档（<!DOCTYPE html> 到 </html>），包含 <meta charset="UTF-8"> 与内联 <style>，不引用任何外部资源（字体、图片、CDN、JS 库一律禁用）。
2. A4 尺寸（210mm 宽、最小高度 297mm），做好打印优化（print-color-adjust / @media print），字体使用系统中文字体栈。
3. 全中文界面，排版要体现该行业的气质：配色、字体层次、分区装饰、留白都要像专业设计师出品，不要像默认浏览器模板。
4. 数据一律使用占位符语法，禁止写死任何示例内容：
   - {{字段}} 取字段值，支持点路径（如 {{company}}）；数组字段自动用「、」连接
   - 数组循环：{{#字段名}}...{{/字段名}}，块内使用该数组元素的子字段占位符
   - 空值兜底：{{^字段名}}...{{/字段名}}
   - 条件显示：{{#if:字段名}}...{{/if}}
5. ${RESUME_TEMPLATE_FIELDS}
6. 输出直接返回 HTML 文本本身：不要用 \`\`\` 代码块包裹，不要输出任何解释、注释或 Markdown。`;

app.get('/api/admin/resume-templates', requireAdmin, async (req, res) => {
  const templates = await store.listResumeTemplates();
  const byOcc = new Map();
  for (const t of templates) {
    if (!byOcc.has(t.occupationId)) byOcc.set(t.occupationId, []);
    byOcc.get(t.occupationId).push(t);
  }
  const order = ['tech', 'product', 'sales', 'finance', 'design', 'functional', 'medical', 'entry', 'management', 'general'];
  const occupations = [];
  const seen = new Set();
  for (const occId of [...order, ...[...byOcc.keys()]]) {
    if (seen.has(occId)) continue;
    seen.add(occId);
    const list = byOcc.get(occId) || [];
    const meta = BUILTIN_TEMPLATE_META[occId] || {};
    const builtinFile = path.join(root, 'resumeTemplates', 'builtin', occId + '.html');
    occupations.push({
      occupationId: occId,
      name: meta.name || occId,
      description: meta.description || '',
      hasBuiltin: fs.existsSync(builtinFile),
      defaultId: (list.find(t => t.isDefault) || {}).id || null,
      templates: list.map(t => ({
        id: t.id,
        name: t.name,
        source: t.source,
        isDefault: t.isDefault,
        htmlLength: String(t.html || '').length,
        updatedAt: iso(t.updatedAt),
      })),
    });
  }
  res.json({
    occupations,
    templates: occupations.flatMap(o => o.templates),
  });
});

// 手动新增模板：按职业创建一套全新模板（source='manual'，不覆盖现有模板，不抢默认标记）
app.post('/api/admin/resume-templates', express.json({ limit: '5mb' }), requireAdmin, async (req, res) => {
  const occupationId = String(req.body?.occupationId || '').trim();
  const meta = BUILTIN_TEMPLATE_META[occupationId];
  if (!meta) return res.status(404).json({ error: '该职业不存在。' });
  const html = typeof req.body?.html === 'string' ? req.body.html.trim() : '';
  if (!html) return res.status(400).json({ error: '请粘贴或输入模板 HTML 内容。' });
  if (html.length > 1024 * 1024) return res.status(400).json({ error: '模板内容过大（超过 1MB）。' });
  const now = new Date();
  const pad2 = n => String(n).padStart(2, '0');
  const ts = `${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const userProvidedName = String(req.body?.name || '').trim().slice(0, 120);
  const name = userProvidedName || `${meta.name} · 手动版 ${ts}`;
  const description = String(req.body?.description || '').trim().slice(0, 500);
  const id = 'manual-' + occupationId + '-' + crypto.randomBytes(4).toString('hex');
  const created = await store.upsertResumeTemplate({
    id,
    occupationId,
    name,
    description,
    html,
    source: 'manual',
    isDefault: false,
  });
  res.json({ ok: true, template: { id: created.id, occupationId: created.occupationId, name: created.name, description: created.description, source: 'manual', isDefault: false, html: created.html, updatedAt: iso(created.updatedAt) } });
});

// 示例数据（预览渲染用；注意必须先于 /:id 注册）
app.get('/api/admin/resume-templates/sample-data', requireAdmin, async (req, res) => {
  res.json({ sample: SAMPLE_RESUME });
});

// ===== AI 生成任务队列：状态持久化到 app_jobs（任务列表页统一查看），执行用内存 FIFO 串行 =====
const aiGenQueue = [];       // FIFO 待执行 jobId
let aiGenBusy = false;

// PG 行 -> 内部执行 job（供 runAiGenerateJob 使用）
const toInternalJob = row => ({
  id: row.id,
  occupationId: row.refType === 'occupation' ? row.refId : null,
  occupationName: row.title || row.refId,
  styleNote: row.subtitle || '',
  status: row.status,
  createdAt: row.createdAt,
  startedAt: row.startedAt,
  finishedAt: row.finishedAt,
  templateId: row.result?.templateId || null,
  templateName: row.result?.templateName || null,
  error: row.error || null,
  canceledAt: row.canceledAt,
  retriedFrom: row.retriedFrom || null,
});

// PG 行 -> 对外返回（简历模板页轮询兼容）
const publicGenJob = row => ({
  id: row.id,
  occupationId: row.refType === 'occupation' ? row.refId : null,
  occupationName: row.title || row.refId,
  styleNote: row.subtitle || '',
  status: row.status, // pending | running | done | error | canceled
  createdAt: iso(row.createdAt),
  startedAt: row.startedAt ? iso(row.startedAt) : null,
  finishedAt: row.finishedAt ? iso(row.finishedAt) : null,
  templateId: row.result?.templateId || null,
  templateName: row.result?.templateName || null,
  error: row.error || null,
  canceledAt: row.canceledAt ? iso(row.canceledAt) : null,
  retriedFrom: row.retriedFrom || null,
});

async function runAiGenerateJob(job) {
  job.status = 'running';
  job.startedAt = new Date();
  await store.updateJob(job.id, { status: 'running', startedAt: job.startedAt, error: null });
  const meta = BUILTIN_TEMPLATE_META[job.occupationId] || {};
  const styleNote = job.styleNote || '';
  try {
    const active = await resolveAiModel('text');
    const credential = await resolveAiCredential(active);
    const callSettings = await store.getSettings();
    const callTimeoutMs = (Number(callSettings?.ai_call_timeout_seconds) || 300) * 1000;
    if (!credential.apiKey) throw new Error('尚未配置 AI 接口。请先在「AI 设置」中添加并启用 API Key 与默认模型。');
    const prompt = buildResumeTemplatePrompt({ name: meta.name, description: meta.description, styleNote });
    let html;
    if (active?.apiProtocol === 'responses') {
      const payload = await callAi(credential.baseUrl, '/responses', { model: active.modelId, input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }], temperature: 0.7 }, credential.apiKey, callTimeoutMs);
      html = extractAiText(payload);
    } else if (active) {
      const payload = await callAi(credential.baseUrl, '/chat/completions', { model: active.modelId, messages: [{ role: 'user', content: prompt }], temperature: 0.7 }, credential.apiKey, callTimeoutMs);
      html = extractAiText(payload);
    } else {
      const payload = await callAi(credential.baseUrl, '/responses', { model: process.env.OPENAI_MODEL || 'gpt-4o-mini', input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }], temperature: 0.7 }, credential.apiKey, callTimeoutMs);
      html = extractAiText(payload);
    }
    html = String(html || '').trim();
    html = html.replace(/^```(?:html|xml)?\s*/i, '').replace(/```\s*$/, '').trim();
    if (!/<!DOCTYPE html>/i.test(html) && !/<html[\s>]/i.test(html)) throw new Error('AI 返回内容不是完整的 HTML 文档，请重试或更换模型。');
    if (html.length > 1024 * 1024) throw new Error('AI 生成内容过大，请重试。');
    const now = new Date();
    const pad2 = n => String(n).padStart(2, '0');
    const ts = `${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    const id = 'ai-' + job.occupationId + '-' + crypto.randomBytes(4).toString('hex');
    const created = await store.upsertResumeTemplate({
      id,
      occupationId: job.occupationId,
      name: `${meta.name} · AI 版 ${ts}`,
      description: styleNote || meta.description,
      html,
      source: 'ai',
      isDefault: false,
    });
    job.templateId = created.id;
    job.templateName = created.name;
    job.status = 'done';
    await store.updateJob(job.id, { status: 'done', result: { templateId: created.id, templateName: created.name } });
  } catch (error) {
    job.status = 'error';
    job.error = (error && error.message) ? error.message : String(error);
    await store.updateJob(job.id, { status: 'error', error: job.error });
  } finally {
    job.finishedAt = new Date();
    await store.updateJob(job.id, { finishedAt: job.finishedAt });
  }
}

// 串行执行队列（FIFO）：同一时刻只执行一个 AI 生成任务，连续点击多次会依次排队
async function processAiQueue() {
  if (aiGenBusy) return;
  aiGenBusy = true;
  try {
    while (aiGenQueue.length) {
      const jobId = aiGenQueue[0];
      const row = await store.getJob(jobId);
      if (!row || row.status === 'canceled') { aiGenQueue.shift(); continue; }
      const job = toInternalJob(row);
      try {
        await runAiGenerateJob(job);
      } catch (error) {
        job.status = 'error';
        job.error = (error && error.message) ? error.message : String(error);
        job.finishedAt = new Date();
        await store.updateJob(job.id, { status: 'error', error: job.error, finishedAt: job.finishedAt });
      }
      aiGenQueue.shift();
    }
  } finally {
    aiGenBusy = false;
  }
}

async function createAiGenerateJob(occupationId, styleNote) {
  const meta = BUILTIN_TEMPLATE_META[occupationId] || {};
  const job = {
    id: 'gen-' + crypto.randomBytes(6).toString('hex'),
    occupationId,
    occupationName: meta.name || occupationId,
    styleNote: styleNote || '',
    status: 'pending',
    createdAt: new Date(),
    startedAt: null,
    finishedAt: null,
    templateId: null,
    templateName: null,
    error: null,
    canceledAt: null,
    retriedFrom: null,
  };
  // 状态持久化到 app_jobs（任务列表页统一查看；服务重启后由启动恢复标记为中断）
  await store.insertJob({
    id: job.id,
    taskType: 'template_generate',
    title: job.occupationName,
    subtitle: styleNote || 'AI 生成简历模板',
    status: 'pending',
    refType: 'occupation',
    refId: occupationId,
    owner: 'admin',
  });
  aiGenQueue.push(job.id);
  processAiQueue().catch(() => {});
  return job;
}

// ===== 统一任务列表（app_jobs）：AI 模板生成 / 报告生成 / 简历解析 / 截图识别 / 简历结构化，状态同步到 PG =====
const TASK_TYPE_LABELS = {
  template_generate: 'AI 模板生成',
  report_generate: '报告生成',
  resume_parse: '简历解析',
  screenshot_ocr: '截图识别',
  resume_structure: '简历结构化',
};
const taskTypeLabel = type => TASK_TYPE_LABELS[type] || type || '—';
const publicJob = row => row && ({
  id: row.id,
  taskType: row.taskType,
  taskTypeLabel: taskTypeLabel(row.taskType),
  title: row.title,
  subtitle: row.subtitle,
  status: row.status,
  progress: row.progress == null ? null : Number(row.progress),
  error: row.error || null,
  refType: row.refType || null,
  refId: row.refId || null,
  owner: row.owner || 'admin',
  createdAt: iso(row.createdAt),
  startedAt: row.startedAt ? iso(row.startedAt) : null,
  finishedAt: row.finishedAt ? iso(row.finishedAt) : null,
  canceledAt: row.canceledAt ? iso(row.canceledAt) : null,
  retriedFrom: row.retriedFrom || null,
  retries: Number(row.retries) || 0,
  result: row.result || null,
  // 兼容旧轮询接口字段（简历模板页）
  occupationId: row.refType === 'occupation' ? row.refId : null,
  occupationName: row.title || row.refId,
  styleNote: row.subtitle || '',
  templateId: row.result?.templateId || null,
  templateName: row.result?.templateName || null,
});

// 查询 AI 生成任务（简历模板页轮询兼容；?status=running 可只看进行中；服务重启后任务状态由 app_jobs 持久化）
app.get('/api/admin/resume-templates/generate-jobs', requireAdmin, async (req, res) => {
  const statusFilter = String(req.query.status || '').split(',').map(s => s.trim()).filter(Boolean);
  const jobs = await store.listJobs({ type: 'template_generate' });
  const filtered = statusFilter.length ? jobs.filter(j => statusFilter.includes(j.status)) : jobs;
  const queued = jobs.filter(j => j.status === 'pending' || j.status === 'running').length;
  res.json({ jobs: filtered.map(publicJob), queued });
});

app.get('/api/admin/resume-templates/generate-jobs/:jobId', requireAdmin, async (req, res) => {
  const row = await store.getJob(req.params.jobId);
  if (!row || row.taskType !== 'template_generate') return res.status(404).json({ error: '生成任务不存在。' });
  res.json({ job: publicJob(row) });
});

app.post('/api/admin/resume-templates/generate-jobs/clear-history', requireAdmin, async (req, res) => {
  const removed = await store.clearJobsHistoryByType('template_generate');
  for (let i = aiGenQueue.length - 1; i >= 0; i--) {
    const row = await store.getJob(aiGenQueue[i]).catch(() => null);
    if (!row || row.status === 'done' || row.status === 'error' || row.status === 'canceled') aiGenQueue.splice(i, 1);
  }
  res.json({ ok: true, removed, queued: aiGenQueue.length });
});

app.post('/api/admin/resume-templates/generate-jobs/:jobId/cancel', requireAdmin, async (req, res) => {
  const row = await store.getJob(req.params.jobId);
  if (!row || row.taskType !== 'template_generate') return res.status(404).json({ error: '生成任务不存在。' });
  if (row.status === 'running') return res.status(400).json({ error: '任务正在生成中，无法取消。' });
  if (row.status === 'done') return res.status(400).json({ error: '任务已完成，无需取消。' });
  if (row.status === 'error') return res.status(400).json({ error: '任务已失败，请使用「重试」或清空历史。' });
  if (row.status === 'canceled') return res.status(400).json({ error: '任务已取消。' });
  const qi = aiGenQueue.indexOf(row.id);
  if (qi !== -1) aiGenQueue.splice(qi, 1);
  const updated = await store.updateJob(row.id, { status: 'canceled', canceledAt: new Date(), finishedAt: new Date() });
  res.json({ ok: true, job: publicJob(updated || { ...row, status: 'canceled' }) });
});

app.post('/api/admin/resume-templates/generate-jobs/:jobId/retry', requireAdmin, async (req, res) => {
  const row = await store.getJob(req.params.jobId);
  if (!row || row.taskType !== 'template_generate') return res.status(404).json({ error: '生成任务不存在。' });
  if (row.status !== 'error' && row.status !== 'canceled') return res.status(400).json({ error: '仅失败或已取消的任务可以重试。' });
  const retriedFrom = row.retriedFrom || row.id;
  const updated = await store.updateJob(row.id, {
    status: 'pending', error: null, canceledAt: null, startedAt: null, finishedAt: null,
    retriedFrom, retries: Number(row.retries) + 1, result: null,
  });
  aiGenQueue.push(row.id);
  processAiQueue().catch(() => {});
  res.json({ ok: true, job: publicJob(updated || { ...row, status: 'pending' }) });
});

// ===== 统一任务列表 API（管理后台「任务列表」页：查看 / 状态统计 / 取消排队 / 重试 / 清空历史）=====
app.post('/api/admin/jobs/clear-history', requireAdmin, async (req, res) => {
  const removed = await store.clearJobsHistory();
  for (let i = aiGenQueue.length - 1; i >= 0; i--) {
    const row = await store.getJob(aiGenQueue[i]).catch(() => null);
    if (!row || row.status === 'done' || row.status === 'error' || row.status === 'canceled') aiGenQueue.splice(i, 1);
  }
  res.json({ ok: true, removed, queued: aiGenQueue.length });
});

app.get('/api/admin/jobs/stats', requireAdmin, async (req, res) => {
  res.json({ stats: await store.jobStats() });
});

app.get('/api/admin/jobs', requireAdmin, async (req, res) => {
  const type = String(req.query.type || '').trim() || null;
  const status = String(req.query.status || '').trim() || null;
  const q = String(req.query.q || '').trim() || null;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const [total, jobs] = await Promise.all([
    store.countJobs({ type, status, q }),
    store.listJobs({ type, status, q, limit, offset }),
  ]);
  res.json({ total, limit, offset, jobs: jobs.map(publicJob), queued: jobs.filter(j => j.status === 'pending' || j.status === 'running').length });
});

app.get('/api/admin/jobs/:jobId', requireAdmin, async (req, res) => {
  const row = await store.getJob(req.params.jobId);
  if (!row) return res.status(404).json({ error: '任务不存在。' });
  res.json({ job: publicJob(row) });
});

app.post('/api/admin/jobs/:jobId/cancel', requireAdmin, async (req, res) => {
  const row = await store.getJob(req.params.jobId);
  if (!row) return res.status(404).json({ error: '任务不存在。' });
  if (row.status === 'running') return res.status(400).json({ error: '任务正在执行中，无法取消。' });
  if (row.status === 'done') return res.status(400).json({ error: '任务已完成，无需取消。' });
  if (row.status === 'error') return res.status(400).json({ error: '任务已失败，请使用「重试」或清空历史。' });
  if (row.status === 'canceled') return res.status(400).json({ error: '任务已取消。' });
  const qi = aiGenQueue.indexOf(row.id);
  if (qi !== -1) aiGenQueue.splice(qi, 1);
  const updated = await store.updateJob(row.id, { status: 'canceled', canceledAt: new Date(), finishedAt: new Date() });
  res.json({ ok: true, job: publicJob(updated || { ...row, status: 'canceled' }) });
});

app.post('/api/admin/jobs/:jobId/retry', requireAdmin, async (req, res) => {
  const row = await store.getJob(req.params.jobId);
  if (!row) return res.status(404).json({ error: '任务不存在。' });
  if (row.status !== 'error' && row.status !== 'canceled') return res.status(400).json({ error: '仅失败或已取消的任务可以重试。' });
  const retriedFrom = row.retriedFrom || row.id;
  const updated = await store.updateJob(row.id, {
    status: 'pending', error: null, canceledAt: null, startedAt: null, finishedAt: null,
    retriedFrom, retries: Number(row.retries) + 1, result: null,
  });
  // AI 模板生成任务重试后重新入内存 FIFO 队列执行；其它任务类型仅更新状态（由对应服务自行恢复）
  if (row.taskType === 'template_generate') {
    aiGenQueue.push(row.id);
    processAiQueue().catch(() => {});
  }
  res.json({ ok: true, job: publicJob(updated || { ...row, status: 'pending' }) });
});

app.get('/api/admin/resume-templates/:id', requireAdmin, async (req, res) => {
  const t = await store.getResumeTemplate(req.params.id);
  if (!t) return res.status(404).json({ error: '模板不存在。' });
  res.json({
    template: {
      id: t.id,
      occupationId: t.occupationId,
      name: t.name,
      description: t.description,
      html: t.html,
      source: t.source,
      isDefault: t.isDefault,
      updatedAt: iso(t.updatedAt),
    },
  });
});

app.put('/api/admin/resume-templates/:id', express.json({ limit: '5mb' }), requireAdmin, async (req, res) => {
  const t = await store.getResumeTemplate(req.params.id);
  if (!t) return res.status(404).json({ error: '模板不存在。' });
  const html = typeof req.body?.html === 'string' ? req.body.html.trim() : '';
  if (!html) return res.status(400).json({ error: '模板内容不能为空。' });
  if (html.length > 1024 * 1024) return res.status(400).json({ error: '模板内容过大（超过 1MB）。' });
  const name = String(req.body?.name ?? (t.name || '')).trim().slice(0, 120);
  const description = String(req.body?.description ?? (t.description || '')).trim().slice(0, 500);
  const updated = await store.updateResumeTemplate(t.id, { name, description, html, source: 'manual' });
  res.json({ ok: true, template: { id: updated.id, occupationId: updated.occupationId, name: updated.name, description: updated.description, source: updated.source, isDefault: updated.isDefault, updatedAt: iso(updated.updatedAt) } });
});

// AI 生成新排版：提交后立即返回 jobId，后台 FIFO 队列逐个生成（source='ai'，不覆盖现有模板）；关闭弹框/面板不影响任务继续
app.post('/api/admin/resume-templates/:occupationId/generate', express.json({ limit: '5mb' }), requireAdmin, async (req, res) => {
  const occupationId = req.params.occupationId;
  const meta = BUILTIN_TEMPLATE_META[occupationId];
  if (!meta) return res.status(404).json({ error: '该职业不存在。' });
  const styleNote = String(req.body?.styleNote || '').trim().slice(0, 300);
  try {
    const active = await resolveAiModel('text');
    const credential = await resolveAiCredential(active);
    if (!credential.apiKey) return res.status(503).json({ error: '尚未配置 AI 接口。请先在「AI 设置」中添加并启用 API Key 与默认模型。' });
  } catch (error) {
    return res.status(503).json({ error: `AI 配置读取失败：${error.message}` });
  }
  const job = await createAiGenerateJob(occupationId, styleNote);
  res.json({ ok: true, jobId: job.id, status: job.status, queued: aiGenQueue.length });
});

// 恢复内置：按职业从 builtin/<occupationId>.html 重新导入（无论当前来源）
app.post('/api/admin/resume-templates/:occupationId/reset', requireAdmin, async (req, res) => {
  const restored = await store.restoreBuiltinResumeTemplate(req.params.occupationId);
  if (!restored) return res.status(404).json({ error: '该职业没有对应的内置模板，无法恢复。' });
  res.json({ ok: true, template: { id: restored.id, occupationId: restored.occupationId, name: restored.name, source: restored.source, html: restored.html, isDefault: restored.isDefault, updatedAt: iso(restored.updatedAt) } });
});

// 设置该职业默认模板（同一职业仅一套默认）
app.post('/api/admin/resume-templates/:id/set-default', requireAdmin, async (req, res) => {
  const t = await store.setDefaultResumeTemplate(req.params.id);
  if (!t) return res.status(404).json({ error: '模板不存在。' });
  res.json({ ok: true, template: { id: t.id, occupationId: t.occupationId, name: t.name, source: t.source, isDefault: true, updatedAt: iso(t.updatedAt) } });
});

// 删除某套模板（删除默认时自动补位为该职业最早一套；内置模板删除后下次启动自动重建）
app.delete('/api/admin/resume-templates/:id', requireAdmin, async (req, res) => {
  const t = await store.getResumeTemplate(req.params.id);
  if (!t) return res.status(404).json({ error: '模板不存在。' });
  await store.deleteResumeTemplate(req.params.id);
  res.json({ ok: true });
});

// ===== 404 处理 =====
app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在。' }));

// ===== 静态托管前端 =====
app.use(express.static(webDist, { index: false, maxAge: '1h' }));
// 兼容本地直连 /admin/ 前缀（生产 nginx 已剥离前缀，此规则对 /assets/* 无影响）：
// dist 内 index.html 的 base=/admin/，资源路径为 /admin/assets/*，需按前缀二次挂载 static
app.use('/admin', express.static(webDist, { index: false, maxAge: '1h' }));
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

// 启动时恢复任务状态：重启前 pending/running 的 AI 模板生成任务标记为失败，并清空内存 FIFO 队列（避免执行已中断任务）
try {
  const interrupted = await store.markInterruptedJobs({ taskType: 'template_generate' });
  if (interrupted) console.log(`已标记 ${interrupted} 个重启前未完成的模板生成任务为失败`);
} catch (error) {
  console.error('标记中断任务失败：', error.message);
}
aiGenQueue.length = 0;

const port = Number(process.env.PORT || 3216);
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => console.log(`岗位镜管理后台运行在 http://${host}:${port}`));



