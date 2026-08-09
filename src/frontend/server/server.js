import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { pdf as pdfToImages } from 'pdf-to-img';
import { createPgStore } from './db.js';
import { analyzePdf, analyzeDocx } from './resumeParse.js';
import { detectOccupation, withOccupation } from './resumeOccupation.js';

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
// 后台配置（admin_settings 数据库）：邮件配置优先于环境变量兜底，保存后立即生效；AI 凭证由 ai_keys / ai_models 提供
const appConfig = { resendApiKey: '', emailFrom: '' };
await refreshAppConfig();
async function refreshAppConfig() {
  try {
    const row = await dbStore.getAppSettings();
    if (row) {
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
const aiBaseUrl = () => (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const outputText = payload => payload.output_text || payload.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text || '';
const parseJsonText = text => {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw;
  try { return JSON.parse(candidate); } catch { try { return JSON.parse(raw); } catch { return {}; } }
};
const extractText = payload => {
  const chat = payload?.choices?.[0]?.message?.content;
  if (typeof chat === 'string') return chat;
  if (Array.isArray(chat)) return chat.map(item => item?.text || item?.content || '').join('');
  return outputText(payload);
};
const toNumber = value => { if (value == null) return null; const n = Number(value); return Number.isFinite(n) ? n : null; };
// 从 AI 响应 usage 中提取 token 用量与“真实费用”：中转站（one-api/new-api 等）常返回 cost/total_cost/prompt_cost+completion_cost 等字段
const extractUsage = (payload, model) => {
  if (!payload?.usage) return null;
  const u = payload.usage;
  const inputTokens = Number(u.input_tokens ?? u.prompt_tokens ?? 0);
  const outputTokens = Number(u.output_tokens ?? u.completion_tokens ?? 0);
  const apiCost = toNumber(u.cost ?? u.total_cost ?? u.amount ?? (u.prompt_cost != null && u.completion_cost != null ? u.prompt_cost + u.completion_cost : null) ?? (u.input_cost != null && u.output_cost != null ? u.input_cost + u.output_cost : null));
  const currency = String(u.currency || u.currency_symbol || '').trim().toUpperCase() || 'USD';
  return { model, inputTokens, outputTokens, totalTokens: Number(u.total_tokens ?? (inputTokens + outputTokens)), cost: apiCost, currency };
};

// 模型单价（美元 / 百万 tokens），OpenAI 官方公开价目，用于估算报告费用（非账单）
const MODEL_PRICES = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-4': { input: 30, output: 60 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'o1': { input: 15, output: 60 },
  'o1-mini': { input: 3, output: 12 },
  'o3': { input: 2, output: 8 },
  'o3-mini': { input: 1.1, output: 4.4 },
};
// 报告费用：优先使用接口返回的真实费用（costSource=api），缺失时按模型价目估算（costSource=estimate）
const computeReportCost = async usage => {
  if (!usage) return { value: null, source: null, currency: 'USD' };
  if (usage.cost != null) {
    const n = Number(usage.cost);
    if (Number.isFinite(n)) return { value: n, source: 'api', currency: usage.currency || 'USD' };
  }
  const key = String(usage.model || '').toLowerCase();
  let price = null;
  try {
    const row = await dbStore.findAiModelByModelId(key);
    if (row && row.inputPrice != null && row.outputPrice != null) price = { input: row.inputPrice, output: row.outputPrice };
  } catch {}
  if (!price) {
    try {
      const ref = await dbStore.findAiModelReferencePrice(key);
      if (ref && ref.input_price != null && ref.output_price != null) price = { input: Number(ref.input_price), output: Number(ref.output_price) };
    } catch {}
  }
  if (!price) price = MODEL_PRICES[key] || MODEL_PRICES[key.split('/').pop()];
  if (!price) return { value: null, source: null, currency: 'USD' };
  const value = (Number(usage.inputTokens) / 1e6) * price.input + (Number(usage.outputTokens) / 1e6) * price.output;
  return { value, source: 'estimate', currency: 'USD' };
};
async function callResponses(body, opts = {}) { await refreshAppConfig(); const base = (opts.baseUrl || aiBaseUrl()).replace(/\/$/, ''); const key = opts.apiKey || process.env.OPENAI_API_KEY; const response = await fetch(`${base}/responses`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...(opts.timeoutMs ? { signal: AbortSignal.timeout(opts.timeoutMs) } : {}) }); if (!response.ok) throw new Error(`AI 接口返回 ${response.status}`); return response.json(); }
async function callChatCompletions(body, opts = {}) { await refreshAppConfig(); const base = (opts.baseUrl || aiBaseUrl()).replace(/\/$/, ''); const key = opts.apiKey || process.env.OPENAI_API_KEY; const response = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...(opts.timeoutMs ? { signal: AbortSignal.timeout(opts.timeoutMs) } : {}) }); if (!response.ok) throw new Error(`AI 接口返回 ${response.status}`); return response.json(); }
async function resolveAiModel(modelType) {
  try { const row = await dbStore.getDefaultAiModel(modelType); if (row) return row; } catch (error) { console.error('读取主模型失败：', error.message); }
  return null;
}

// AI 调用凭证：模型绑定 Key > 当前使用 Key > 环境变量；Base URL 同理由 Key 提供
async function resolveAiCredential(model) {
  if (model?.apiKeyId) {
    try {
      const bound = await dbStore.getAiKeyById(model.apiKeyId);
      if (bound && bound.enabled && bound.api_key) return { apiKey: bound.api_key, baseUrl: (bound.base_url || '').replace(/\/+$/, '') || null };
    } catch (error) { console.error('读取模型绑定 Key 失败：', error.message); }
  }
  try {
    const def = await dbStore.getDefaultAiKey();
    if (def && def.enabled && def.api_key) return { apiKey: def.api_key, baseUrl: (def.base_url || '').replace(/\/+$/, '') || null };
  } catch (error) { console.error('读取当前使用 Key 失败：', error.message); }
  return { apiKey: process.env.OPENAI_API_KEY || '', baseUrl: null };
}

// 简历结构化：将简历文本解析为 LLM 友好 JSON，存入 PG 供 AI 分析直接使用
const RESUME_STRUCTURE_PROMPT = `你是资深中文简历解析专家。将下面的简历文本解析为结构化 JSON，供 AI 求职匹配系统直接使用。要求：
1. 只提取简历中真实存在的信息，绝不编造或推测；无法确定的内容留空字符串或空数组，不要输出 null。
2. 日期统一为 "YYYY-MM" 或 "YYYY" 或 ""。
3. 工作经历按时间倒序排列；responsibilities 与 achievements 各用数组，每项一句话并保留量化数据。
4. skills.technical 是技术栈/框架/编程语言，tools 是工具软件，soft 是软技能，languages 是语言能力。
5. years_of_experience、birth_year 用数字，无法确定时输出 null。
6. 求职意向独立成块：target_position 目标岗位、expected_city 期望城市、expected_salary 期望薪资、job_type 工作性质（全职/兼职/实习）、available_date 到岗时间；无法确定留空。
7. 自由区块对号入座：培训经历→training、语言能力→languages、志愿/公益→volunteer、社团/校园→social、论文/著作/学术成果→publications、专利→patents、个人作品/作品集→portfolio、开源项目→open_source、兴趣爱好→interests、推荐人/证明人→references；references 需本人同意才写，一般写「可提供」。
8. 输出严格 JSON，不要输出任何多余文字或代码块标记。

JSON 结构：{schema_version:2,basic:{name,gender,birth_year,phone,email,location,current_company,current_title,years_of_experience,expected_salary,job_intention,available_date},job_intention:{target_position,expected_city,expected_salary,job_type,available_date},education:[{school,degree,major,start_date,end_date,gpa,honors:[]}],work_experience:[{company,title,start_date,end_date,industry,responsibilities:[],achievements:[],skills_used:[]}],project_experience:[{name,role,start_date,end_date,description,achievements:[],tech_stack:[]}],skills:{technical:[],tools:[],soft:[],languages:[]},certificates:[],awards:[],training:[{name,institution,date,description}],languages:[{language,fluency}],volunteer:[{organization,role,date,description}],social:[{organization,role,date,description}],publications:[{title,journal,date,authors}],patents:[{name,patent_no,date,status}],portfolio:[{name,url,description}],open_source:[{name,url,description}],interests:[],references:[{name,company,title,contact}],self_evaluation,summary,warnings:[]}

简历文本：
`;
async function structureResume(text) {
  await refreshAppConfig();
  const active = await resolveAiModel('text');
  const credential = await resolveAiCredential(active);
  if (!credential.apiKey) throw new Error('尚未配置 AI 接口，无法结构化简历。');
  const prompt = RESUME_STRUCTURE_PROMPT + String(text || '');
  const callOpts = { timeoutMs: 90000, ...(credential.apiKey ? { apiKey: credential.apiKey, ...(credential.baseUrl ? { baseUrl: credential.baseUrl } : {}) } : {}) };
  let payload;
  if (active?.apiProtocol === 'responses') {
    payload = await callResponses({ model: active.modelId, input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }], temperature: 0.1, text: { format: { type: 'json_object' } } }, callOpts);
  } else if (active) {
    payload = await callChatCompletions({ model: active.modelId, messages: [{ role: 'user', content: prompt }], temperature: 0.1, response_format: { type: 'json_object' } }, callOpts);
  } else {
    payload = await callResponses({ model: process.env.OPENAI_MODEL, input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }], temperature: 0.1, text: { format: { type: 'json_object' } } }, callOpts);
  }
  const model = active?.modelId || process.env.OPENAI_MODEL;
  const parsed = parseJsonText(extractText(payload));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || (!parsed.basic && !parsed.education && !parsed.work_experience && !parsed.skills)) throw new Error('AI 返回的简历结构化数据不完整，请稍后重试。');
  // 职业识别：写入 structured.occupation 元数据（供渲染强调与后台对号入座）
  const structured = withOccupation(parsed, String(text || ''));
  const usage = extractUsage(payload, model);
  const cost = await computeReportCost(usage);
  return { structured, usage: usage ? { ...usage, costSource: cost.source, currency: cost.currency } : null, cost, model };
}
// 简历隐私脱敏：保存/入库/发送 AI 前对手机号、邮箱、证件号、银行卡、微信/QQ、门牌号等敏感信息打码，尊重用户隐私
function maskResumePII(text) {
  if (!text) return '';
  let s = String(text);
  // 手机号：13812345678 / 138 1234 5678 / 138-1234-5678 -> 138****5678
  s = s.replace(/(?<!\d)(1[3-9]\d)[\s-]?(\d{4})[\s-]?(\d{4})(?!\d)/g, '$1****$3');
  // 座机：010-12345678 / 01012345678 -> 010-1234****
  s = s.replace(/(?<!\d)(0\d{2,3})[\s-]?(\d{3,4})(\d{4})(?!\d)/g, '$1-$2****');
  // 邮箱：zhangsan@example.com -> zh***@example.com（保留域名）
  s = s.replace(/(?<![A-Za-z0-9_+-])([A-Za-z0-9_+-])([A-Za-z0-9_+.-]*?)@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g,
    (match, first, rest, domain) => `${first}${'*'.repeat(Math.max(1, Math.min(rest.length, 3)))}@${domain}`);
  // 身份证：18 位（末位可为数字或 X）-> 保留前 6 后 4
  s = s.replace(/(?<!\d)(\d{6})\d{8}([\dXx]{4})(?!\d)/g, '$1********$2');
  // 15 位旧身份证 -> 保留前 6 后 3
  s = s.replace(/(?<!\d)(\d{6})(\d{6})(\d{3})(?!\d)/g, '$1*******$3');
  // 银行卡：13-19 位纯数字 -> 保留前 6 后 4
  s = s.replace(/(?<!\d)(\d{6})(\d{3,9})(\d{4})(?!\d)/g, '$1******$3');
  // 微信号 / QQ 号：保留标识，打码号码
  s = s.replace(/(微信|QQ|qq|Q Q)\s*号?[:：]?\s*([A-Za-z][A-Za-z0-9_-]{4,19}|\d{5,12})/g, '$1：****');
  // 详细地址门牌：xx路xx号 -> xx路**号
  s = s.replace(/([\u4e00-\u9fa5]{1,12}?(?:路|街|道|巷|弄|大道))(\d{1,6}号)/g, '$1**号');
  // 楼栋室号：3栋502室 -> 3栋**室
  s = s.replace(/(\d{1,4}(?:栋|号楼))(\d{1,4})(?=室|单元|号)/g, '$1**');
  return s;
}
// 脱敏字段分析：扫描已脱敏文本，识别被脱敏的数据类型（上传保存时记录，供前端标注/打印复原）
const MASKED_FIELD_PATTERNS = [
  { type: 'phone', label: '手机号', re: /1[3-9]\d\*{4}\d{4}/ },
  { type: 'landline', label: '座机', re: /0\d{2,3}-?\d{3,4}\*{4}/ },
  { type: 'email', label: '邮箱', re: /[A-Za-z0-9_+-]\*{1,3}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/ },
  { type: 'idcard', label: '身份证号', re: /\d{6}\*{7,8}\d{3,4}/ },
  { type: 'bankcard', label: '银行卡号', re: /\d{6}\*{6}\d{4}/ },
  { type: 'wechat', label: '微信号/QQ', re: /(?:微信|QQ|qq|Q Q)[：:]\*{4}/ },
  { type: 'address', label: '门牌号', re: /[\u4e00-\u9fa5]{1,12}?(?:路|街|道|巷|弄|大道)\*{2}号/ },
  { type: 'building', label: '楼栋室号', re: /\d{1,4}(?:栋|号楼)\*{2}(?=室|单元|号)/ },
];
function detectMaskedFields(maskedText) {
  const text = String(maskedText || '');
  const found = [];
  for (const p of MASKED_FIELD_PATTERNS) {
    const m = text.match(new RegExp(p.re.source, 'g'));
    if (m && m.length) found.push({ type: p.type, label: p.label, count: m.length });
  }
  return found;
}
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
app.get('/api/resume', async (req, res) => { const db = await readDb(); const user = currentUser(req, db); if (!user) return res.status(401).json({ error: '请先登录。' }); res.json({ hasResume: Boolean(user.resumeText), factsConfirmed: Boolean(user.factsConfirmedAt), text: maskResumePII(user.resumeText || ''), masked: true, maskedFields: user.resumeMaskedFields && user.resumeMaskedFields.length ? user.resumeMaskedFields : detectMaskedFields(maskResumePII(user.resumeText || '')), updatedAt: user.resumeUpdatedAt || user.createdAt, structured: (() => { let st = user.resumeStructured || null; if (st && !st.occupation) st = withOccupation(st, maskResumePII(user.resumeText || '')); return st; })(), structuredAt: user.resumeStructuredAt || null, resumeFile: user.resumeFilePath ? { name: user.resumeFileName || '简历文件', mime: user.resumeFileMime || 'application/octet-stream', size: user.resumeFileSize || 0, uploadedAt: user.resumeFileUploadedAt || null } : null }); });
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
  // 隐私脱敏：保存前对手机号、邮箱、证件号等敏感信息打码，库中只存脱敏文本，AI 分析也只看到脱敏内容
  const maskedText = maskResumePII(text);
  const fileRef = String(req.body?.fileRef || '');
  // OCR 识别（/api/extract/resume 返回）结果：用户未编辑文本时随保存提交，避免二次文本模型解析
  const providedStructured = req.body?.structured && typeof req.body.structured === 'object' && !Array.isArray(req.body.structured) ? req.body.structured : null;
  const providedUsage = req.body?.usage && typeof req.body.usage === 'object' ? req.body.usage : null;
  const providedModel = String(req.body?.model || '');
  const factsConfirmed = req.body?.facts === true;
  const db = await readDb();
  const user = currentUser(req, db);
  if (!user) return res.status(401).json({ error: '请先登录。' });
  const resumeTextChanged = user.resumeText !== maskedText;
  let structuredError = '';
  user.resumeText = maskedText;
  user.resumeMaskedFields = detectMaskedFields(maskedText);
  // 事实确认状态：确认事实时记录；更新简历后重置（事实已失效，需重新确认）
  if (factsConfirmed) {
    user.factsConfirmedAt = new Date().toISOString();
  } else if (resumeTextChanged) {
    user.factsConfirmedAt = null;
  }
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
  if (resumeTextChanged || !user.resumeStructured) {
    try {
      let result;
      const hasShape = providedStructured && (providedStructured.basic || providedStructured.education || providedStructured.work_experience || providedStructured.skills);
      if (hasShape) {
        result = { structured: providedStructured, usage: providedUsage, model: providedModel };
      } else {
        result = await structureResume(maskedText);
      }
      // 结构化字段兜底脱敏（OCR 直接读到真实信息 → 全字段递归打码；文本模型输入已脱敏，幂等无副作用）
      // 职业识别：随保存写入 occupation 元数据（AI/本地/OCR 结果统一补齐，旧数据读取时再兜底）
      const withOcc = withOccupation(result.structured, maskedText);
      user.resumeStructured = maskStructuredPII(withOcc);
      user.resumeStructuredUsage = result.usage || null;
      user.resumeStructuredAt = new Date().toISOString();
    } catch (error) {
      if (resumeTextChanged) { user.resumeStructured = null; user.resumeStructuredUsage = null; user.resumeStructuredAt = null; }
      structuredError = error.message;
    }
  }
  await saveDb(db);
  res.json({ saved: true, masked: true, maskedFields: user.resumeMaskedFields || [], hasResumeFile: Boolean(user.resumeFilePath), structured: Boolean(user.resumeStructured), structuredError });
});
// ---------- 简历 OCR 识别（多模态模型直接读取页面图片，识别版式结构） ----------
const RESUME_STRUCTURE_SCHEMA = `{schema_version:2,basic:{name,gender,birth_year,phone,email,location,current_company,current_title,years_of_experience,expected_salary,job_intention,available_date},job_intention:{target_position,expected_city,expected_salary,job_type,available_date},education:[{school,degree,major,start_date,end_date,gpa,honors:[]}],work_experience:[{company,title,start_date,end_date,industry,responsibilities:[],achievements:[],skills_used:[]}],project_experience:[{name,role,start_date,end_date,description,achievements:[],tech_stack:[]}],skills:{technical:[],tools:[],soft:[],languages:[]},certificates:[],awards:[],training:[{name,institution,date,description}],languages:[{language,fluency}],volunteer:[{organization,role,date,description}],social:[{organization,role,date,description}],publications:[{title,journal,date,authors}],patents:[{name,patent_no,date,status}],portfolio:[{name,url,description}],open_source:[{name,url,description}],interests:[],references:[{name,company,title,contact}],self_evaluation,summary,warnings:[]}`;
const RESUME_OCR_PROMPT = `你是资深中文简历解析专家，正在 OCR 识别候选人上传的简历页面图片（多页按阅读顺序排列）。
输出严格 JSON（不要输出任何多余文字或代码块标记）：{"text":"完整保留简历文本与版式结构，段落/条目前保留原始标题行（如「个人摘要」「工作经历」「技能特长」），保持阅读顺序，不遗漏真实信息","structured":${RESUME_STRUCTURE_SCHEMA},"warnings":[]}
结构化要求：只提取简历中真实存在的信息，绝不编造或推测；无法确定的内容留空字符串或空数组，不要输出 null；日期统一为 "YYYY-MM" 或 "YYYY" 或 ""；工作经历按时间倒序；responsibilities 与 achievements 各用数组，每项一句话并保留量化数据；skills.technical 是技术栈/框架/编程语言，tools 是工具软件，soft 是软技能，languages 是语言能力；years_of_experience、birth_year 用数字，无法确定时输出 null。自评类标题（个人优势、个人亮点、核心优势、个人特长、职业优势、竞争优势等）下的内容必须放入 structured.self_evaluation，严禁混入 work_experience 条目；归属判断以标题与版式位置为据，不依赖正文先后顺序。自由区块对号入座：培训经历→training、语言能力→languages、志愿/公益→volunteer、社团/校园→social、论文/著作/学术成果→publications、专利→patents、个人作品/作品集→portfolio、开源项目→open_source、兴趣爱好→interests、推荐人/证明人→references。`;
const MAX_OCR_PAGES = 6;
// 把 PDF 渲染成页面 PNG（最多 MAX_OCR_PAGES 页）；图片直接使用；DOCX 不支持返回 null
async function renderResumePageBuffers(filePath, mimetype) {
  if (mimetype.startsWith('image/')) return [await fs.readFile(filePath)];
  if (mimetype === 'application/pdf') {
    const pages = [];
    const doc = await pdfToImages(filePath, { scale: 1.6 });
    try {
      for await (const page of doc) {
        pages.push(Buffer.from(page));
        if (pages.length >= MAX_OCR_PAGES) break;
      }
    } finally { await doc.destroy().catch(() => {}); }
    if (!pages.length) throw new Error('PDF 页面渲染为空。');
    return pages;
  }
  return null;
}
// OCR 识别简历：多模态模型读取页面图片，返回 text + structured + usage
async function ocrResume(filePath, mimetype) {
  await refreshAppConfig();
  const activeOcr = await resolveAiModel('ocr');
  const credential = await resolveAiCredential(activeOcr);
  if (!credential.apiKey) throw new Error('尚未配置 AI 接口，无法 OCR 识别简历。');
  const pages = await renderResumePageBuffers(filePath, mimetype);
  if (!pages) throw new Error('该文件类型不支持 OCR 识别。');
  const images = pages.map(buf => `data:image/png;base64,${buf.toString('base64')}`);
  const callOpts = { timeoutMs: 120000, ...(credential.apiKey ? { apiKey: credential.apiKey, ...(credential.baseUrl ? { baseUrl: credential.baseUrl } : {}) } : {}) };
  let payload;
  if (activeOcr?.apiProtocol === 'responses') {
    payload = await callResponses({ model: activeOcr.modelId, input: [{ role: 'user', content: [{ type: 'input_text', text: RESUME_OCR_PROMPT }, ...images.map(image_url => ({ type: 'input_image', image_url }))] }], temperature: 0.1, text: { format: { type: 'json_object' } } }, callOpts);
  } else if (activeOcr) {
    payload = await callChatCompletions({ model: activeOcr.modelId, messages: [{ role: 'user', content: [{ type: 'text', text: RESUME_OCR_PROMPT }, ...images.map(image_url => ({ type: 'image_url', image_url: { url: image_url } }))] }], temperature: 0.1, response_format: { type: 'json_object' } }, callOpts);
  } else {
    payload = await callResponses({ model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL, input: [{ role: 'user', content: [{ type: 'input_text', text: RESUME_OCR_PROMPT }, ...images.map(image_url => ({ type: 'input_image', image_url }))] }], temperature: 0.1, text: { format: { type: 'json_object' } } }, callOpts);
  }
  const model = activeOcr?.modelId || process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL;
  const parsed = parseJsonText(extractText(payload));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('OCR 返回数据无法解析，请稍后重试。');
  let structured = parsed.structured && typeof parsed.structured === 'object' && !Array.isArray(parsed.structured) ? parsed.structured : null;
  const text = String(parsed.text || '').trim();
  // 职业识别：写入 structured.occupation 元数据
  if (structured) structured = withOccupation(structured, text);
  else if (text) structured = { schema_version: 2, occupation: detectOccupation(text, {}) };
  if (!text && !structured) throw new Error('OCR 未能识别出简历内容，请稍后重试。');
  const usage = extractUsage(payload, model);
  const cost = await computeReportCost(usage);
  return { text, structured, usage: usage ? { ...usage, costSource: cost.source, currency: cost.currency } : null, cost, model, warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [] };
}
// 结构化数据全字段递归脱敏（OCR 直接读到真实信息，库中必须保持脱敏）
function maskStructuredPII(value) {
  if (typeof value === 'string') return maskResumePII(value);
  if (Array.isArray(value)) return value.map(maskStructuredPII);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = maskStructuredPII(value[k]);
    return out;
  }
  return value;
}
async function extractResume({ mimetype, path: filePath }) {
  if (mimetype === 'application/pdf') { const parser = new PDFParse({ data: await fs.readFile(filePath) }); const result = await parser.getText(); await parser.destroy(); return result.text; }
  if (mimetype.includes('wordprocessingml')) return (await mammoth.extractRawText({ path: filePath })).value;
  throw new Error('仅支持 PDF、DOCX 或图片简历。');
}
app.post('/api/extract/resume', upload.single('resume'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: '请选择要上传的简历文件。' });
  const fileRef = crypto.randomUUID();
  const stagingPath = path.join(resumeStagingDir, fileRef);
  let staged = false;
  try {
    const mimetype = String(file.mimetype || '').toLowerCase();
    // 保留原始文件到暂存区，等保存简历时归档到用户目录（原始文件名仅存库，磁盘用 UUID 命名）
    await fs.rename(file.path, stagingPath).catch(async () => { await fs.copyFile(file.path, stagingPath); await fs.unlink(file.path).catch(() => {}); });
    staged = true;
    await fs.writeFile(stagingPath + '.meta.json', JSON.stringify({ name: normalizeResumeFileName(file.originalname) || 'resume', mime: mimetype || 'application/octet-stream', size: file.size || 0 }));
    // 1) 本地版式解析优先：文本型 PDF 用坐标+字号分析、DOCX 用 mammoth 结构 → 结构化 + 文本（不调 AI、不产生费用）
    if (mimetype === 'application/pdf') {
      const layout = await analyzePdf(stagingPath);
      if (layout?.structured) {
        return res.json({ text: layout.text, structured: layout.structured, fileRef, mode: 'layout', usage: null, costUsd: null, costSource: null, model: null, warnings: layout.structured.warnings || [] });
      }
    } else if (mimetype.includes('wordprocessingml')) {
      const layout = await analyzeDocx(stagingPath);
      if (layout?.structured) {
        return res.json({ text: layout.text, structured: layout.structured, fileRef, mode: 'layout', usage: null, costUsd: null, costSource: null, model: null, warnings: layout.structured.warnings || [] });
      }
    }
    // 2) 本地解析失败（扫描件/复杂版式）→ AI OCR 兜底（PDF/图片）
    const isOcrCandidate = mimetype === 'application/pdf' || mimetype.startsWith('image/');
    if (isOcrCandidate) {
      try {
        const ocr = await ocrResume(stagingPath, mimetype);
        return res.json({ text: ocr.text, structured: ocr.structured || undefined, fileRef, mode: 'ocr', usage: ocr.usage || null, costUsd: ocr.cost?.value ?? null, costSource: ocr.cost?.source ?? null, model: ocr.model, warnings: ocr.warnings || [] });
      } catch (error) {
        if (mimetype.startsWith('image/')) { await fs.unlink(stagingPath).catch(() => {}); await fs.unlink(stagingPath + '.meta.json').catch(() => {}); return res.status(502).json({ error: `AI OCR 识别简历失败：${error.message}` }); }
        // PDF OCR 失败：回退文本提取
      }
    }
    const text = await extractResume({ mimetype, path: stagingPath });
    if (!String(text || '').trim()) throw new Error('未能从文件中提取到文本，请确认文件未加密或尝试上传清晰的 PDF/图片。');
    res.json({ text, fileRef, mode: 'text' });
  } catch (error) {
    if (staged) { await fs.unlink(stagingPath).catch(() => {}); await fs.unlink(stagingPath + '.meta.json').catch(() => {}); }
    else await fs.unlink(file.path).catch(() => {});
    res.status(400).json({ error: error.message });
  }
});
app.post('/api/extract/screenshot', upload.single('screenshot'), async (req, res) => { try { if (!req.file?.mimetype.startsWith('image/')) return res.status(400).json({ error: '请上传有效的岗位截图。' }); await refreshAppConfig(); const activeOcr = await resolveAiModel('ocr'); const credential = await resolveAiCredential(activeOcr); if (!credential.apiKey) return res.status(503).json({ error: '尚未配置 AI 接口。' }); const image = `data:${req.file.mimetype};base64,${(await fs.readFile(req.file.path)).toString('base64')}`; const prompt = '识别这张招聘岗位截图。完整保留职责、要求、薪资、地点、公司和岗位名称，不要补充图片中不存在的信息。输出严格 JSON：{"company_short_name":"","job_title":"","text":"","warnings":[]}。公司简称应去掉有限公司等工商后缀；无法确认的内容留空并放入 warnings。';
    const ocrOpts = credential.apiKey ? { apiKey: credential.apiKey, ...(credential.baseUrl ? { baseUrl: credential.baseUrl } : {}) } : {};
    let payload;
    if (activeOcr?.apiProtocol === 'responses') {
      payload = await callResponses({ model: activeOcr.modelId, input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }, { type: 'input_image', image_url: image }] }], text: { format: { type: 'json_object' } } }, ocrOpts);
    } else if (activeOcr) {
      payload = await callChatCompletions({ model: activeOcr.modelId, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: image } }] }], response_format: { type: 'json_object' } }, ocrOpts);
    } else {
      payload = await callResponses({ model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL, input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }, { type: 'input_image', image_url: image }] }], text: { format: { type: 'json_object' } } }, ocrOpts);
    }
    const result = parseJsonText(extractText(payload)); const ocrModel = activeOcr?.modelId || process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL; const ocrUsage = extractUsage(payload, ocrModel); const ocrCost = await computeReportCost(ocrUsage); res.json({ text: result.text || '', companyShortName: result.company_short_name || '', jobTitle: result.job_title || '', warnings: result.warnings || [], usage: ocrUsage ? { ...ocrUsage, costSource: ocrCost.source, currency: ocrCost.currency } : null, costUsd: ocrCost.value, costSource: ocrCost.source }); } catch (error) { res.status(502).json({ error: `AI 截图识别失败：${error.message}` }); } finally { if (req.file?.path) await fs.unlink(req.file.path).catch(() => {}); } });
app.post('/api/analyze', async (req, res) => {
  await refreshAppConfig();
  const active = await resolveAiModel('text');
  const credential = await resolveAiCredential(active);
  if (!credential.apiKey) return res.status(503).json({ error: '尚未配置 AI 接口，不能生成真实 AI 报告。' });
  const db = await readDb(); const user = currentUser(req, db); if (!user) return res.status(401).json({ error: '请先登录后生成报告。' });
  if (!user.emailVerifiedAt) return res.status(403).json({ error: '请先验证注册邮箱，再生成分析报告。', code: 'EMAIL_NOT_VERIFIED' });
  const { resumeText, jobText, jobTitle, companyShortName } = req.body; const email = user.email;
  if (!resumeText || !jobText) return res.status(400).json({ error: '请先提供简历文本和岗位内容。' });
  // 隐私脱敏：发送 AI 前对简历打码，库中存的是脱敏文本，未脱敏的请求文本也先脱敏再使用
  const maskedResume = maskResumePII(resumeText);
  // 简历输入：优先使用已保存并结构化的 LLM 格式简历（更精准、省 token），未结构化或文本不一致时回退原始文本
  let resumeInput = maskedResume;
  if (user.resumeStructured && maskResumePII(String(user.resumeText || '')).trim() === maskedResume.trim()) {
    resumeInput = `【简历结构化数据】\n${JSON.stringify(user.resumeStructured, null, 2)}\n【简历原文】\n${maskedResume}`;
  }
  const prompt = `你是严谨的中文职业顾问。只依据给出的简历与岗位内容分析，不能承诺 offer 或虚构经历。输出严格 JSON：{company_short_name,job_title,summary, qualification:{status,evidence,risks}, dimensions:[{name,score_0_to_5,evidence,gap}], verify:[string], resume_rewrite:[{section,original_issue,rewrite_direction,example}], actions:[string]}。company_short_name 去掉有限公司等工商后缀。公司简称：${companyShortName || '请从岗位正文识别'}\n岗位名称：${jobTitle || '请从岗位正文识别'}\n岗位内容：${jobText}\n简历：${resumeInput}`;
  try {
    let payload;
    let usedModel;
    const callOpts = credential.apiKey ? { apiKey: credential.apiKey, ...(credential.baseUrl ? { baseUrl: credential.baseUrl } : {}) } : {};
    if (active?.apiProtocol === 'responses') {
      payload = await callResponses({ model: active.modelId, input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }], temperature: 0.2, text: { format: { type: 'json_object' } } }, callOpts);
    } else if (active) {
      payload = await callChatCompletions({ model: active.modelId, messages: [{ role: 'user', content: prompt }], temperature: 0.2, response_format: { type: 'json_object' } }, callOpts);
    } else {
      payload = await callResponses({ model: process.env.OPENAI_MODEL, input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }], temperature: 0.2, text: { format: { type: 'json_object' } } }, callOpts);
    }
    usedModel = active?.modelId || process.env.OPENAI_MODEL;
    const report = parseJsonText(extractText(payload));
    const usage = extractUsage(payload, usedModel);
    const cost = await computeReportCost(usage);
    const costUsd = cost.value;
    const costSource = cost.source;
    const createdAt = new Date().toISOString(); const finalCompany = companyShortName || report.company_short_name || ''; const finalJobTitle = jobTitle || report.job_title || ''; const accessToken = crypto.randomBytes(24).toString('base64url'); // 岗位-简历职业联动：识别岗位职业模板 + 简历职业快照，供报告页一致性提示
  const jobOccupation = detectOccupation(String(jobText || ''));
  const resumeOccupation = withOccupation(user.resumeStructured || {}, maskedResume).occupation || null;
  const record = { id: crypto.randomUUID(), accessToken, userId: user.id, email, companyShortName: finalCompany, jobTitle: finalJobTitle, reportName: reportName(createdAt, finalCompany, finalJobTitle), status: 'completed', emailStatus: 'pending', report, usage: usage ? { ...usage, costSource, currency: cost.currency } : null, costUsd, costSource, jobOccupation, resumeOccupation, createdAt, updatedAt: createdAt }; db.reports.push(record); await saveDb(db);
    const reportUrl = `${publicAppUrl()}/report/${accessToken}`;
    let emailSent = false; try { await sendReportEmail(email, reportUrl, report); emailSent = Boolean(email && (appConfig.resendApiKey || process.env.RESEND_API_KEY) && (appConfig.emailFrom || process.env.EMAIL_FROM)); record.emailStatus = emailSent ? 'sent' : 'not_configured'; } catch (emailError) { record.emailStatus = 'failed'; console.error(emailError.message); } record.updatedAt = new Date().toISOString(); await saveDb(db);
    res.json({ id: record.id, reportName: record.reportName, reportUrl, emailSent, report });
  } catch (error) { res.status(502).json({ error: `AI 分析失败：${error.message}` }); }
});
app.get('/api/reports', async (req, res) => { const db = await readDb(); const user = currentUser(req, db); if (!user) return res.status(401).json({ error: '请先登录。' }); const appUrl = publicAppUrl(); const owned = db.reports.filter(item => item.userId === user.id || (!item.userId && item.email === user.email)); const reports = owned.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(item => ({ id: item.id, reportName: item.reportName || reportName(item.createdAt, item.companyShortName, item.jobTitle), jobTitle: item.jobTitle || '未命名岗位', status: item.status || 'completed', emailStatus: item.emailStatus || 'unknown', createdAt: item.createdAt, reportUrl: item.accessToken ? `${appUrl}/report/${item.accessToken}` : null })); const jobKeys = new Set(owned.map(item => `${item.companyShortName || ''}|${item.jobTitle || ''}`).filter(key => key !== '|')); res.json({ reports, stats: { jobs: jobKeys.size, reports: owned.length } }); });
app.get('/api/reports/:token', async (req, res) => { const db = await readDb(); const record = db.reports.find(item => item.accessToken === req.params.token); if (!record) return res.status(404).json({ error: '报告不存在或链接无效。' }); res.setHeader('Cache-Control', 'private, no-store'); res.json({ reportName: record.reportName || reportName(record.createdAt, record.companyShortName, record.jobTitle), jobTitle: record.jobTitle, createdAt: record.createdAt, report: record.report, jobOccupation: record.jobOccupation || null, resumeOccupation: record.resumeOccupation || null }); });
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

