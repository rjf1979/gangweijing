import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { Pool } from 'pg';

const schema = `
CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  last_login_at timestamptz
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token text PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_sessions_admin_id_idx ON admin_sessions(admin_id);
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS resume_file_name text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS resume_file_mime text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS resume_file_size integer;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS resume_file_path text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS resume_file_uploaded_at timestamptz;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS resume_masked_fields jsonb;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS facts_confirmed_at timestamptz;
ALTER TABLE app_reports ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE TABLE IF NOT EXISTS admin_settings (
  id integer PRIMARY KEY DEFAULT 1,
  site_name text NOT NULL DEFAULT '岗位镜管理后台',
  announcement text NOT NULL DEFAULT '',
  free_quota integer NOT NULL DEFAULT 3,
  registration_enabled boolean NOT NULL DEFAULT true,
  resend_api_key text,
  email_from text,
  updated_at timestamptz NOT NULL
);
INSERT INTO admin_settings (id, site_name, updated_at)
VALUES (1, '岗位镜管理后台', now())
ON CONFLICT (id) DO NOTHING;
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS resend_api_key text;
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS email_from text;
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS analysis_concurrency integer NOT NULL DEFAULT 2;
  ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS ai_call_timeout_seconds integer NOT NULL DEFAULT 300;
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS announcement_updated_at timestamptz;
-- 自愈：历史编码问题可能导致默认站点名被写成问号/空，启动时仅修复站点名本身。
-- 注意：admin_settings 为后台用户配置表，公告/邮件密钥等均为用户数据，
-- 任何启动/部署逻辑均禁止重置 announcement / resend_api_key / email_from 等用户字段
CREATE TABLE IF NOT EXISTS ai_models (
  id uuid PRIMARY KEY,
  provider text NOT NULL,
  model_id text NOT NULL,
  display_name text,
  model_type text NOT NULL DEFAULT 'text',
  official_url text,
  api_base_url text,
  api_protocol text NOT NULL DEFAULT 'chat_completions',
  input_price numeric,
  output_price numeric,
  context_window integer,
  enabled boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  multimodal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (provider, model_id)
);
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS multimodal boolean NOT NULL DEFAULT false;
-- 迁移：旧的 OCR 类型或勾选过“同时用于 OCR”的模型 -> 视为支持多模态（文本/OCR 统一为 text）
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS also_ocr boolean NOT NULL DEFAULT false;
UPDATE ai_models SET model_type = 'text', multimodal = true WHERE model_type = 'ocr' OR also_ocr = true;
ALTER TABLE ai_models DROP COLUMN IF EXISTS also_ocr;
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS api_key_id uuid;
CREATE TABLE IF NOT EXISTS ai_keys (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  provider text,
  base_url text,
  api_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  remark text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_model_reference_prices (
  id uuid PRIMARY KEY,
  provider_key text NOT NULL,
  provider text NOT NULL,
  model_id text NOT NULL,
  display_name text,
  context_length integer,
  input_price numeric,
  output_price numeric,
  fetched_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (model_id)
);
UPDATE admin_settings
SET site_name = '岗位镜管理后台'
WHERE id = 1 AND (site_name IS NULL OR site_name = '' OR site_name ~ '^[?]+$');

CREATE TABLE IF NOT EXISTS resume_templates (
  id text PRIMARY KEY,
  occupation_id text NOT NULL,
  name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  html text NOT NULL,
  source text NOT NULL DEFAULT 'builtin',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- 一职业可有多套模板（内置 / AI 生成 / 人工编辑），其中一套为默认；is_default 由管理后台维护
ALTER TABLE resume_templates ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_resume_templates_one_default_per_occupation
  ON resume_templates (occupation_id) WHERE is_default;
-- 存量数据：仅当某职业尚无默认模板时，补选最早一套为默认（已有默认的职业跳过，避免唯一索引冲突）
UPDATE resume_templates SET is_default = true
  WHERE id IN (
    SELECT DISTINCT ON (occupation_id) id FROM resume_templates
    WHERE NOT is_default
      AND occupation_id NOT IN (SELECT DISTINCT occupation_id FROM resume_templates WHERE is_default)
    ORDER BY occupation_id, created_at, id
  );

CREATE TABLE IF NOT EXISTS app_jobs (
  id text PRIMARY KEY,
  task_type text NOT NULL,
  title text NOT NULL DEFAULT '',
  subtitle text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  progress integer,
  error text,
  ref_type text,
  ref_id text,
  owner text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  canceled_at timestamptz,
  retried_from text,
  retries integer NOT NULL DEFAULT 0,
  result jsonb
);
CREATE INDEX IF NOT EXISTS app_jobs_created_at_idx ON app_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS app_jobs_status_idx ON app_jobs (status);
CREATE INDEX IF NOT EXISTS app_jobs_type_idx ON app_jobs (task_type);

`;

function selectedUrl() {
  const mode = (process.env.APP_URL_MODE || (process.env.NODE_ENV === 'production' ? 'server' : 'local')).toLowerCase();
  const url = mode === 'server' ? process.env.DATABASE_URL_SERVER : process.env.DATABASE_URL_LOCAL;
  return url || process.env.DATABASE_URL;
}

const cnDate = `(created_at AT TIME ZONE 'Asia/Shanghai')::date`;
const reportTable = 'app_reports';
const userTable = 'app_users';

const mapAiModel = row => row && ({
  id: row.id,
  provider: row.provider,
  modelId: row.model_id,
  displayName: row.display_name,
  modelType: row.model_type,
  officialUrl: row.official_url,
  apiBaseUrl: row.api_base_url,
  apiProtocol: row.api_protocol,
  inputPrice: row.input_price == null ? null : Number(row.input_price),
  outputPrice: row.output_price == null ? null : Number(row.output_price),
  contextWindow: row.context_window == null ? null : Number(row.context_window),
  enabled: Boolean(row.enabled),
  isDefault: Boolean(row.is_default),
  apiKeyId: row.api_key_id || null,
  multimodal: Boolean(row.multimodal),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
const mapAiKey = row => row && ({
  id: row.id,
  name: row.name,
  provider: row.provider || null,
  baseUrl: row.base_url || null,
  apiKey: row.api_key || '',
  enabled: Boolean(row.enabled),
  isDefault: Boolean(row.is_default),
  remark: row.remark || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
const mapReferencePrice = row => row && ({
  providerKey: row.provider_key,
  provider: row.provider,
  modelId: row.model_id,
  displayName: row.display_name,
  contextLength: row.context_length == null ? null : Number(row.context_length),
  inputPrice: row.input_price == null ? null : Number(row.input_price),
  outputPrice: row.output_price == null ? null : Number(row.output_price),
  fetchedAt: row.fetched_at,
});

const mapResumeTemplate = row => row && ({
  id: row.id,
  occupationId: row.occupation_id,
  isDefault: Boolean(row.is_default),
  name: row.name,
  description: row.description,
  html: row.html,
  source: row.source,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapJob = row => row && ({
  id: row.id,
  taskType: row.task_type,
  title: row.title,
  subtitle: row.subtitle,
  status: row.status,
  progress: row.progress == null ? null : Number(row.progress),
  error: row.error || null,
  refType: row.ref_type || null,
  refId: row.ref_id || null,
  owner: row.owner || 'admin',
  createdAt: row.created_at,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  canceledAt: row.canceled_at,
  retriedFrom: row.retried_from || null,
  retries: Number(row.retries) || 0,
  result: row.result || null,
});


export function createPgStore() {
  const connectionString = selectedUrl();
  if (!connectionString) throw new Error('未配置数据库连接：DATABASE_URL_LOCAL / DATABASE_URL_SERVER / DATABASE_URL。');
  const pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30000 });

  return {
    async init() { await pool.query(schema); },

    async close() { await pool.end(); },

    // ===== 管理员 =====
    async findAdminByEmail(email) {
      const { rows } = await pool.query('SELECT id, email, password_hash, created_at, last_login_at FROM admin_users WHERE email = $1', [email]);
      return rows[0] || null;
    },
    async createAdmin({ id, email, passwordHash }) {
      await pool.query('INSERT INTO admin_users (id, email, password_hash, created_at) VALUES ($1, $2, $3, now())', [id, email, passwordHash]);
    },
    async listAdmins() {
      const { rows } = await pool.query('SELECT id, email, created_at, last_login_at FROM admin_users ORDER BY created_at');
      return rows;
    },
    async updateAdminLastLogin(id) {
      await pool.query('UPDATE admin_users SET last_login_at = now() WHERE id = $1', [id]);
    },
    async updateAdminPassword(id, passwordHash) {
      await pool.query('UPDATE admin_users SET password_hash = $2 WHERE id = $1', [id, passwordHash]);
    },
    async deleteAdmin(id) {
      await pool.query('DELETE FROM admin_users WHERE id = $1', [id]);
    },

    // ===== 管理员会话 =====
    async createSession({ token, adminId, expiresAt }) {
      await pool.query('INSERT INTO admin_sessions (token, admin_id, expires_at) VALUES ($1, $2, $3)', [token, adminId, expiresAt]);
    },
    async findSession(token) {
      const { rows } = await pool.query(
        'SELECT s.token, s.expires_at, a.id AS admin_id, a.email, a.created_at FROM admin_sessions s JOIN admin_users a ON a.id = s.admin_id WHERE s.token = $1',
        [token]
      );
      return rows[0] || null;
    },
    async deleteSession(token) {
      await pool.query('DELETE FROM admin_sessions WHERE token = $1', [token]);
    },
    async deleteSessionsForAdmin(adminId) {
      await pool.query('DELETE FROM admin_sessions WHERE admin_id = $1', [adminId]);
    },

    // ===== 站点设置 =====
    async getSettings() {
      const { rows } = await pool.query('SELECT site_name, announcement, announcement_updated_at, free_quota, registration_enabled, resend_api_key, email_from, analysis_concurrency, ai_call_timeout_seconds, updated_at FROM admin_settings WHERE id = 1');
      return rows[0] || null;
    },
    async updateSettings(patch = {}) {
      const fields = [];
      const values = [];
      const push = (col, val) => { fields.push(col + ' = $' + (fields.length + 1)); values.push(val); };
      if ('siteName' in patch) push('site_name', patch.siteName);
      if ('announcement' in patch) { push('announcement', patch.announcement); push('announcement_updated_at', new Date().toISOString()); }
      if ('freeQuota' in patch) push('free_quota', patch.freeQuota);
      if ('registrationEnabled' in patch) push('registration_enabled', Boolean(patch.registrationEnabled));
      if ('resendApiKey' in patch) push('resend_api_key', patch.resendApiKey || null);
      if ('emailFrom' in patch) push('email_from', patch.emailFrom || null);
      if ('analysisConcurrency' in patch) push('analysis_concurrency', patch.analysisConcurrency);
        if ('aiCallTimeoutSeconds' in patch) push('ai_call_timeout_seconds', patch.aiCallTimeoutSeconds);
      if (!fields.length) return;
      await pool.query('UPDATE admin_settings SET ' + fields.join(', ') + ', updated_at = now() WHERE id = 1', values);
    },

    // ===== AI 模型（人工维护；抓取价目仅作参考，不写入此表） =====
    async listAiModels() {
      const { rows } = await pool.query('SELECT * FROM ai_models ORDER BY model_type, is_default DESC, provider, model_id');
      return rows.map(mapAiModel);
    },
    async getAiModelById(id) {
      const { rows } = await pool.query('SELECT * FROM ai_models WHERE id = $1', [id]);
      return mapAiModel(rows[0] || null);
    },
    async findAiModelByModelId(modelId) {
      const { rows } = await pool.query('SELECT * FROM ai_models WHERE LOWER(model_id) = LOWER($1) ORDER BY is_default DESC LIMIT 1', [String(modelId || '')]);
      return mapAiModel(rows[0] || null);
    },
    async getDefaultAiModel(modelType = 'text') {
      const { rows } = await pool.query('SELECT * FROM ai_models WHERE model_type = $1 AND is_default = true AND enabled = true LIMIT 1', [modelType]);
      return mapAiModel(rows[0] || null);
    },
    async createAiModel(input) {
      const existing = await pool.query('SELECT 1 FROM ai_models WHERE provider = $1 AND model_id = $2', [input.provider, input.modelId]);
      if (existing.rows.length) return { conflict: true };
      const { rows } = await pool.query(
        `INSERT INTO ai_models (id, provider, model_id, display_name, model_type, official_url, api_base_url, api_protocol, input_price, output_price, context_window, enabled, is_default, multimodal, api_key_id, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now(),now()) RETURNING *`,
        [input.id, input.provider, input.modelId, input.displayName || null, input.modelType, input.officialUrl || null, input.apiBaseUrl || null, input.apiProtocol, input.inputPrice, input.outputPrice, input.contextWindow, Boolean(input.enabled !== false), Boolean(input.isDefault), Boolean(input.multimodal), input.apiKeyId || null]
      );
      return { conflict: false, model: mapAiModel(rows[0]) };
    },
    async updateAiModel(id, input) {
      const fields = [];
      const values = [];
      const push = (col, val) => { fields.push(col + ' = $' + (fields.length + 1)); values.push(val); };
      if ('provider' in input) push('provider', input.provider);
      if ('modelId' in input) push('model_id', input.modelId);
      if ('displayName' in input) push('display_name', input.displayName || null);
      if ('modelType' in input) push('model_type', input.modelType);
      if ('officialUrl' in input) push('official_url', input.officialUrl || null);
      if ('apiBaseUrl' in input) push('api_base_url', input.apiBaseUrl || null);
      if ('apiProtocol' in input) push('api_protocol', input.apiProtocol);
      if ('inputPrice' in input) push('input_price', input.inputPrice);
      if ('outputPrice' in input) push('output_price', input.outputPrice);
      if ('contextWindow' in input) push('context_window', input.contextWindow);
      if ('enabled' in input) push('enabled', Boolean(input.enabled));
      if ('isDefault' in input) push('is_default', Boolean(input.isDefault));
      if ('multimodal' in input) push('multimodal', Boolean(input.multimodal));
      if ('apiKeyId' in input) push('api_key_id', input.apiKeyId || null);
      if (!fields.length) return null;
      values.push(id);
      const { rows } = await pool.query('UPDATE ai_models SET ' + fields.join(', ') + ', updated_at = now() WHERE id = $' + (fields.length + 1) + ' RETURNING *', values);
      return mapAiModel(rows[0] || null);
    },
    async deleteAiModel(id) {
      await pool.query('DELETE FROM ai_models WHERE id = $1', [id]);
    },
    async setDefaultAiModel(id, modelType) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query('SELECT * FROM ai_models WHERE id = $1', [id]);
        if (!rows.length) { await client.query('ROLLBACK'); return { error: '模型不存在。' }; }
        if (rows[0].model_type !== modelType) { await client.query('ROLLBACK'); return { error: '模型类型不匹配。' }; }
        if (!rows[0].enabled) { await client.query('ROLLBACK'); return { error: '请先启用该模型，再设为主模型。' }; }
        await client.query('UPDATE ai_models SET is_default = false, updated_at = now() WHERE model_type = $1', [modelType]);
        await client.query('UPDATE ai_models SET is_default = true, updated_at = now() WHERE id = $1', [id]);
        await client.query('COMMIT');
        return { ok: true };
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    },
    async clearDefaultAiModel(id) {
      await pool.query('UPDATE ai_models SET is_default = false, updated_at = now() WHERE id = $1', [id]);
    },
    // ===== API Key 池（官方 / 中转站等多套凭证，模型可按需绑定） =====
    async listAiKeys() {
      const { rows } = await pool.query('SELECT * FROM ai_keys ORDER BY is_default DESC, created_at');
      return rows.map(mapAiKey);
    },
    async getAiKeyById(id) {
      const { rows } = await pool.query('SELECT * FROM ai_keys WHERE id = $1', [id]);
      return mapAiKey(rows[0] || null);
    },
    async getDefaultAiKey() {
      const { rows } = await pool.query('SELECT * FROM ai_keys WHERE is_default = true AND enabled = true LIMIT 1');
      return mapAiKey(rows[0] || null);
    },
    async createAiKey(input) {
      const { rows } = await pool.query(
        `INSERT INTO ai_keys (id, name, provider, base_url, api_key, enabled, is_default, remark, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),now()) RETURNING *`,
        [input.id, input.name, input.provider || null, input.baseUrl || null, input.apiKey, Boolean(input.enabled !== false), Boolean(input.isDefault), input.remark || null]
      );
      return mapAiKey(rows[0]);
    },
    async updateAiKey(id, input) {
      const fields = [];
      const values = [];
      const push = (col, val) => { fields.push(col + ' = $' + (fields.length + 1)); values.push(val); };
      if ('name' in input) push('name', input.name);
      if ('provider' in input) push('provider', input.provider || null);
      if ('baseUrl' in input) push('base_url', input.baseUrl || null);
      if ('apiKey' in input) push('api_key', input.apiKey);
      if ('enabled' in input) push('enabled', Boolean(input.enabled));
      if ('remark' in input) push('remark', input.remark || null);
      if (!fields.length) return null;
      values.push(id);
      const { rows } = await pool.query('UPDATE ai_keys SET ' + fields.join(', ') + ', updated_at = now() WHERE id = $' + (fields.length + 1) + ' RETURNING *', values);
      return mapAiKey(rows[0] || null);
    },
    async deleteAiKey(id) {
      await pool.query('DELETE FROM ai_keys WHERE id = $1', [id]);
      await pool.query('UPDATE ai_models SET api_key_id = NULL WHERE api_key_id = $1', [id]);
    },
    async setDefaultAiKey(id) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query('SELECT * FROM ai_keys WHERE id = $1', [id]);
        if (!rows.length) { await client.query('ROLLBACK'); return { error: '该 Key 不存在。' }; }
        if (!rows[0].enabled) { await client.query('ROLLBACK'); return { error: '请先启用该 Key，再设为当前使用。' }; }
        await client.query('UPDATE ai_keys SET is_default = false, updated_at = now() WHERE is_default = true');
        await client.query('UPDATE ai_keys SET is_default = true, updated_at = now() WHERE id = $1', [id]);
        await client.query('COMMIT');
        return { ok: true };
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    },
    async clearDefaultAiKey(id) {
      await pool.query('UPDATE ai_keys SET is_default = false, updated_at = now() WHERE id = $1', [id]);
    },
    // ===== 参考价目（OpenRouter 抓取结果落库，仅作填写参考，不写入正式 AI 配置） =====
    async listReferencePrices() {
      const { rows } = await pool.query('SELECT * FROM ai_model_reference_prices ORDER BY provider, model_id');
      return rows.map(mapReferencePrice);
    },
    async getReferenceMeta() {
      const { rows } = await pool.query('SELECT max(fetched_at) AS fetched_at, count(*)::int AS total FROM ai_model_reference_prices');
      return { fetchedAt: rows[0]?.fetched_at || null, total: rows[0]?.total || 0 };
    },
    async replaceReferencePrices(models, fetchedAt) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM ai_model_reference_prices');
        for (const m of models) {
          await client.query(
            `INSERT INTO ai_model_reference_prices (id, provider_key, provider, model_id, display_name, context_length, input_price, output_price, fetched_at, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now())`,
            [crypto.randomUUID(), m.providerKey, m.provider, m.id, m.name || null, m.contextLength, m.inputPrice, m.outputPrice, fetchedAt]
          );
        }
        await client.query('COMMIT');
        return { ok: true, count: models.length };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    // ===== 统计 =====
    async countUsers() {
      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${userTable}`);
      return rows[0].n;
    },
    async countUsersSince(iso) {
      const { rows } = await pool.query('SELECT count(*)::int AS n FROM ' + userTable + ' WHERE created_at >= $1', [iso]);
      return rows[0].n;
    },
    async countVerifiedUsers() {
      const { rows } = await pool.query('SELECT count(*)::int AS n FROM ' + userTable + ' WHERE email_verified_at IS NOT NULL');
      return rows[0].n;
    },
    async countUsersWithResume() {
      const { rows } = await pool.query('SELECT count(*)::int AS n FROM ' + userTable + ' WHERE resume_text IS NOT NULL AND resume_text <> \'\'');
      return rows[0].n;
    },
    async countReports() {
      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${reportTable} WHERE deleted_at IS NULL`);
      return rows[0].n;
    },
    async countReportsSince(iso) {
      const { rows } = await pool.query('SELECT count(*)::int AS n FROM ' + reportTable + ' WHERE created_at >= $1 AND deleted_at IS NULL', [iso]);
      return rows[0].n;
    },
    async reportStatusBreakdown() {
      const { rows } = await pool.query('SELECT status, count(*)::int AS n FROM ' + reportTable + ' WHERE deleted_at IS NULL GROUP BY status ORDER BY n DESC');
      return rows;
    },
    async reportEmailStatusBreakdown() {
      const { rows } = await pool.query('SELECT email_status, count(*)::int AS n FROM ' + reportTable + ' WHERE deleted_at IS NULL GROUP BY email_status ORDER BY n DESC');
      return rows;
    },
    async trend(days = 14) {
      const { rows } = await pool.query(
        `SELECT d::date AS day,
           COALESCE(u.n, 0)::int AS users,
           COALESCE(r.n, 0)::int AS reports
         FROM generate_series(current_date - ($1::int - 1), current_date, interval '1 day') AS d
         LEFT JOIN (SELECT ${cnDate} AS day, count(*) AS n FROM ${userTable} GROUP BY 1) u ON u.day = d::date
         LEFT JOIN (SELECT ${cnDate} AS day, count(*) AS n FROM ${reportTable} WHERE deleted_at IS NULL GROUP BY 1) r ON r.day = d::date
         ORDER BY d::date`,
        [days]
      );
      return rows.map(row => ({ date: row.day, users: row.users, reports: row.reports }));
    },
    async recentUsers(limit = 6) {
      const { rows } = await pool.query(
        `SELECT id, email, email_verified_at, created_at,
           (resume_text IS NOT NULL AND resume_text <> '') AS has_resume
         FROM ${userTable} ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
      return rows;
    },
    async recentReports(limit = 6) {
      const { rows } = await pool.query(
        `SELECT id, access_token, company_short_name, job_title, status, email_status, created_at
         FROM ${reportTable} WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
      return rows;
    },

    // ===== 用户管理 =====
    async searchUsers(q, { limit, offset }) {
      const where = q ? 'WHERE email ILIKE $1' : '';
      const params = q ? [`%${q}%`] : [];
      const { rows } = await pool.query(
        `SELECT id, email, email_verified_at, created_at,
           (resume_text IS NOT NULL AND resume_text <> '') AS has_resume
         FROM ${userTable} ${where}
         ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
        params
      );
      return rows;
    },
    async countSearchUsers(q) {
      const where = q ? 'WHERE email ILIKE $1' : '';
      const params = q ? [`%${q}%`] : [];
      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${userTable} ${where}`, params);
      return rows[0].n;
    },
    async getUserById(id) {
      const { rows } = await pool.query('SELECT * FROM ' + userTable + ' WHERE id = $1', [id]);
      return rows[0] || null;
    },
    async getUserReports(userId) {
      const { rows } = await pool.query(
        `SELECT id, access_token, company_short_name, job_title, report_name, status, email_status, created_at
         FROM ${reportTable} WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
        [userId]
      );
      return rows;
    },
    async deleteUser(id) {
      await pool.query('DELETE FROM ' + userTable + ' WHERE id = $1', [id]);
    },
    async clearResumeFile(id) {
      await pool.query(
        'UPDATE ' + userTable + ' SET resume_file_name = NULL, resume_file_mime = NULL, resume_file_size = NULL, resume_file_path = NULL, resume_file_uploaded_at = NULL WHERE id = $1',
        [id]
      );
    },

    // ===== 报告管理 =====
    async searchReports({ q, status, emailStatus, limit, offset }) {
      const clauses = ['deleted_at IS NULL'];
      const params = [];
      if (q) {
        params.push(`%${q}%`);
        clauses.push(`(email ILIKE $${params.length} OR company_short_name ILIKE $${params.length} OR job_title ILIKE $${params.length} OR report_name ILIKE $${params.length})`);
      }
      if (status) {
        params.push(status);
        clauses.push(`status = $${params.length}`);
      }
      if (emailStatus) {
        params.push(emailStatus);
        clauses.push(`email_status = $${params.length}`);
      }
      const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
      const { rows } = await pool.query(
        `SELECT id, access_token, company_short_name, job_title, report_name, status, email_status, email, usage, cost_usd, cost_source, created_at
         FROM ${reportTable} ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
        params
      );
      return rows;
    },
    async countSearchReports({ q, status, emailStatus }) {
      const clauses = ['deleted_at IS NULL'];
      const params = [];
      if (q) {
        params.push(`%${q}%`);
        clauses.push(`(email ILIKE $${params.length} OR company_short_name ILIKE $${params.length} OR job_title ILIKE $${params.length} OR report_name ILIKE $${params.length})`);
      }
      if (status) {
        params.push(status);
        clauses.push(`status = $${params.length}`);
      }
      if (emailStatus) {
        params.push(emailStatus);
        clauses.push(`email_status = $${params.length}`);
      }
      const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${reportTable} ${where}`, params);
      return rows[0].n;
    },
    async getReportById(id) {
      const { rows } = await pool.query('SELECT * FROM ' + reportTable + ' WHERE id = $1 AND deleted_at IS NULL', [id]);
      return rows[0] || null;
    },
    async deleteReport(id) {
      await pool.query('UPDATE ' + reportTable + ' SET deleted_at = now() WHERE id = $1', [id]);
    },

    // ===== 简历模板（内置 + AI 生成 + 人工编辑；source: builtin | ai | manual） =====
    async listResumeTemplates() {
      const { rows } = await pool.query('SELECT * FROM resume_templates ORDER BY occupation_id, is_default DESC, created_at, id');
      return rows.map(mapResumeTemplate);
    },
    async getResumeTemplate(id) {
      const { rows } = await pool.query('SELECT * FROM resume_templates WHERE id = $1', [id]);
      return mapResumeTemplate(rows[0] || null);
    },
    async upsertResumeTemplate(input) {
      // is_default 仅在 INSERT 时写入；ON CONFLICT 更新内容不动 is_default（避免种子/恢复内置抢默认标记）
      const { rows } = await pool.query(
        `INSERT INTO resume_templates (id, occupation_id, name, description, html, source, is_default, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,now())
         ON CONFLICT (id) DO UPDATE SET occupation_id = EXCLUDED.occupation_id, name = EXCLUDED.name, description = EXCLUDED.description, html = EXCLUDED.html, source = EXCLUDED.source, updated_at = now()
         RETURNING *`,
        [input.id, input.occupationId, input.name, input.description, input.html, input.source, Boolean(input.isDefault)]
      );
      return mapResumeTemplate(rows[0]);
    },
    async updateResumeTemplate(id, input = {}) {
      const fields = [];
      const values = [];
      const push = (col, val) => { fields.push(col + ' = $' + (fields.length + 1)); values.push(val); };
      if ('name' in input) push('name', input.name);
      if ('description' in input) push('description', input.description);
      if ('html' in input) push('html', input.html);
      if ('source' in input) push('source', input.source);
      if ('isDefault' in input) push('is_default', input.isDefault);
      if (!fields.length) return null;
      values.push(id);
      const { rows } = await pool.query('UPDATE resume_templates SET ' + fields.join(', ') + ', updated_at = now() WHERE id = $' + (fields.length + 1) + ' RETURNING *', values);
      return mapResumeTemplate(rows[0] || null);
    },
    async deleteResumeTemplate(id) {
      // 若删除的是默认模板，自动将该职业剩余最早一套设为默认
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query('SELECT occupation_id, is_default FROM resume_templates WHERE id = $1', [id]);
        if (rows.length) {
          const occ = rows[0].occupation_id;
          const wasDefault = Boolean(rows[0].is_default);
          await client.query('DELETE FROM resume_templates WHERE id = $1', [id]);
          if (wasDefault) {
            await client.query(
              `UPDATE resume_templates SET is_default = true
               WHERE id = (SELECT id FROM resume_templates WHERE occupation_id = $1 AND NOT is_default ORDER BY created_at, id LIMIT 1)`,
              [occ]
            );
          }
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async getDefaultResumeTemplate(occupationId) {
      const { rows } = await pool.query('SELECT * FROM resume_templates WHERE occupation_id = $1 AND is_default LIMIT 1', [occupationId]);
      return mapResumeTemplate(rows[0] || null);
    },
    async setDefaultResumeTemplate(id) {
      // 同一职业仅一套默认：先清空该职业默认，再标记目标模板（唯一索引兜底）
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query('SELECT occupation_id FROM resume_templates WHERE id = $1 FOR UPDATE', [id]);
        if (!rows.length) { await client.query('ROLLBACK'); return null; }
        const occ = rows[0].occupation_id;
        await client.query('UPDATE resume_templates SET is_default = false WHERE occupation_id = $1 AND is_default', [occ]);
        await client.query('UPDATE resume_templates SET is_default = true WHERE id = $1', [id]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return this.getResumeTemplate(id);
    },
    // 内置模板：读取 builtin/<id>.html + builtin-meta.js，不存在返回 null
    async getBuiltinResumeTemplate(id) {
      let meta = {};
      try { meta = (await import('./resumeTemplates/builtin-meta.js')).BUILTIN_TEMPLATE_META || {}; } catch {}
      const def = meta[id];
      if (!def) return null;
      let html = '';
      try { html = await readFile(new URL('./resumeTemplates/builtin/' + id + '.html', import.meta.url), 'utf8'); } catch { return null; }
      if (!html.trim()) return null;
      return { id, occupationId: def.occupationId, name: def.name, description: def.description, html };
    },
    // 启动种子：扫描 builtin/*.html，仅当不存在或原 source=builtin 时同步，不覆盖 ai/manual
    async seedBuiltinResumeTemplates() {
      let files = [];
      try { files = await readdir(new URL('./resumeTemplates/builtin/', import.meta.url)); } catch { return { imported: 0 }; }
      let imported = 0;
      let skipped = 0;
      for (const file of files) {
        if (!file.endsWith('.html')) continue;
        const id = file.slice(0, -5);
        const builtin = await this.getBuiltinResumeTemplate(id);
        if (!builtin) continue;
        const { rows } = await pool.query('SELECT source FROM resume_templates WHERE id = $1', [id]);
        if (rows.length && rows[0].source !== 'builtin') { skipped += 1; continue; }
        // 该职业尚无默认模板时，内置模板作为默认；已有默认则不抢
        const hasDefault = !!(await this.getDefaultResumeTemplate(id));
        await this.upsertResumeTemplate({ ...builtin, source: 'builtin', isDefault: !hasDefault });
        imported += 1;
      }
      return { imported, skipped };
    },
    // 恢复内置：按职业覆盖内置记录（无论当前来源），返回新记录；无内置文件返回 null；不抢默认标记
    async restoreBuiltinResumeTemplate(occupationId) {
      const builtin = await this.getBuiltinResumeTemplate(occupationId);
      if (!builtin) return null;
      const hasDefault = !!(await this.getDefaultResumeTemplate(occupationId));
      return this.upsertResumeTemplate({ ...builtin, id: occupationId, source: 'builtin', isDefault: !hasDefault });
    },

    // ===== 统一任务列表（app_jobs：admin + frontend 所有长任务，状态同步到 PG）=====
    async listJobs({ type, status, q, limit = 50, offset = 0 } = {}) {
      const conditions = [];
      const values = [];
      const push = (sql, val) => { conditions.push(sql); values.push(val); };
      if (type) push('task_type = $' + (values.length + 1), type);
      if (status) push('status = $' + (values.length + 1), status);
      if (q) push('(title ILIKE $' + (values.length + 1) + ' OR subtitle ILIKE $' + (values.length + 1) + ' OR id ILIKE $' + (values.length + 1) + ')', '%' + q + '%');
      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
      const { rows } = await pool.query(
        `SELECT * FROM app_jobs ${where} ORDER BY created_at DESC, id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      );
      return rows.map(mapJob);
    },
    async countJobs({ type, status, q } = {}) {
      const conditions = [];
      const values = [];
      const push = (sql, val) => { conditions.push(sql); values.push(val); };
      if (type) push('task_type = $' + (values.length + 1), type);
      if (status) push('status = $' + (values.length + 1), status);
      if (q) push('(title ILIKE $' + (values.length + 1) + ' OR subtitle ILIKE $' + (values.length + 1) + ' OR id ILIKE $' + (values.length + 1) + ')', '%' + q + '%');
      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
      const { rows } = await pool.query(`SELECT COUNT(*)::int AS total FROM app_jobs ${where}`, values);
      return rows[0]?.total || 0;
    },
    async jobStats() {
      const { rows } = await pool.query('SELECT status, COUNT(*)::int AS count FROM app_jobs GROUP BY status');
      const stats = { pending: 0, running: 0, done: 0, error: 0, canceled: 0, total: 0 };
      for (const row of rows) if (row.status in stats) stats[row.status] = row.count;
      stats.total = rows.reduce((sum, row) => sum + row.count, 0);
      return stats;
    },
    async getJob(id) {
      const { rows } = await pool.query('SELECT * FROM app_jobs WHERE id = $1', [id]);
      return mapJob(rows[0] || null);
    },
    async insertJob(job) {
      const { rows } = await pool.query(
        `INSERT INTO app_jobs (id, task_type, title, subtitle, status, progress, error, ref_type, ref_id, owner, created_at, started_at, finished_at, canceled_at, retried_from, retries, result)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11, now()),$12,$13,$14,$15,$16,$17) RETURNING *`,
        [job.id, job.taskType, job.title || '', job.subtitle || '', job.status || 'pending', job.progress ?? null, job.error || null, job.refType || null, job.refId || null, job.owner || 'admin', job.createdAt || null, job.startedAt || null, job.finishedAt || null, job.canceledAt || null, job.retriedFrom || null, job.retries ?? 0, job.result ? JSON.stringify(job.result) : null]
      );
      return mapJob(rows[0]);
    },
    async updateJob(id, patch = {}) {
      const fields = [];
      const values = [];
      const push = (col, val) => { fields.push(col + ' = $' + (fields.length + 1)); values.push(val); };
      if ('status' in patch) push('status', patch.status);
      if ('progress' in patch) push('progress', patch.progress);
      if ('error' in patch) push('error', patch.error || null);
      if ('startedAt' in patch) push('started_at', patch.startedAt || null);
      if ('finishedAt' in patch) push('finished_at', patch.finishedAt || null);
      if ('canceledAt' in patch) push('canceled_at', patch.canceledAt || null);
      if ('retriedFrom' in patch) push('retried_from', patch.retriedFrom || null);
      if ('retries' in patch) push('retries', patch.retries);
      if ('result' in patch) push('result', patch.result == null ? null : JSON.stringify(patch.result));
      if (!fields.length) return null;
      values.push(id);
      const { rows } = await pool.query('UPDATE app_jobs SET ' + fields.join(', ') + ' WHERE id = $' + (fields.length + 1) + ' RETURNING *', values);
      return mapJob(rows[0] || null);
    },
    async clearJobsHistoryByType(taskType) {
      const { rows } = await pool.query("DELETE FROM app_jobs WHERE task_type = $1 AND status IN ('done','error','canceled') RETURNING id", [taskType]);
      return rows.length;
    },
    async clearJobsHistory() {
      const { rows } = await pool.query("DELETE FROM app_jobs WHERE status IN ('done','error','canceled') RETURNING id");
      return rows.length;
    },
    async markInterruptedJobs({ taskType, statuses = ['pending', 'running'] } = {}) {
      const conditions = [];
      const values = [];
      const push = (sql, val) => { conditions.push(sql); values.push(val); };
      if (taskType) { conditions.push('task_type = $' + (values.length + 1)); values.push(taskType); }
      conditions.push('status = ANY($' + (values.length + 1) + ')');
      values.push(statuses);
      const where = 'WHERE ' + conditions.join(' AND ');
      const { rows } = await pool.query(
        "UPDATE app_jobs SET status = 'error', error = COALESCE(error, '服务重启导致任务中断'), finished_at = now() " + where + " RETURNING id",
        values
      );
      return rows.length;
    },
  };
}
