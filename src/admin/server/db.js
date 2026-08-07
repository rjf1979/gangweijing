import crypto from 'node:crypto';
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
CREATE TABLE IF NOT EXISTS admin_settings (
  id integer PRIMARY KEY DEFAULT 1,
  site_name text NOT NULL DEFAULT '岗位镜管理后台',
  announcement text NOT NULL DEFAULT '',
  free_quota integer NOT NULL DEFAULT 3,
  registration_enabled boolean NOT NULL DEFAULT true,
  openai_api_key text,
  openai_base_url text,
  openai_model text,
  openai_vision_model text,
  resend_api_key text,
  email_from text,
  updated_at timestamptz NOT NULL
);
INSERT INTO admin_settings (id, site_name, updated_at)
VALUES (1, '岗位镜管理后台', now())
ON CONFLICT (id) DO NOTHING;
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS openai_api_key text;
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS openai_base_url text;
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS openai_model text;
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS openai_vision_model text;
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS resend_api_key text;
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS email_from text;
-- 自愈：历史编码问题可能导致默认站点名被写成问号/空，启动时自动重置为默认值（不覆盖用户后期修改）
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
SET site_name = '岗位镜管理后台', announcement = '', updated_at = now()
WHERE id = 1 AND (site_name IS NULL OR site_name = '' OR site_name ~ '^[?]+$');
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
  multimodal: Boolean(row.multimodal),
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
      const { rows } = await pool.query('SELECT site_name, announcement, free_quota, registration_enabled, openai_api_key, openai_base_url, openai_model, openai_vision_model, resend_api_key, email_from, updated_at FROM admin_settings WHERE id = 1');
      return rows[0] || null;
    },
    async updateSettings(patch = {}) {
      const fields = [];
      const values = [];
      const push = (col, val) => { fields.push(col + ' = $' + (fields.length + 1)); values.push(val); };
      if ('siteName' in patch) push('site_name', patch.siteName);
      if ('announcement' in patch) push('announcement', patch.announcement);
      if ('freeQuota' in patch) push('free_quota', patch.freeQuota);
      if ('registrationEnabled' in patch) push('registration_enabled', Boolean(patch.registrationEnabled));
      if ('openaiApiKey' in patch) push('openai_api_key', patch.openaiApiKey || null);
      if ('openaiBaseUrl' in patch) push('openai_base_url', patch.openaiBaseUrl || null);
      if ('openaiModel' in patch) push('openai_model', patch.openaiModel || null);
      if ('openaiVisionModel' in patch) push('openai_vision_model', patch.openaiVisionModel || null);
      if ('resendApiKey' in patch) push('resend_api_key', patch.resendApiKey || null);
      if ('emailFrom' in patch) push('email_from', patch.emailFrom || null);
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
        `INSERT INTO ai_models (id, provider, model_id, display_name, model_type, official_url, api_base_url, api_protocol, input_price, output_price, context_window, enabled, is_default, multimodal, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now(),now()) RETURNING *`,
        [input.id, input.provider, input.modelId, input.displayName || null, input.modelType, input.officialUrl || null, input.apiBaseUrl || null, input.apiProtocol, input.inputPrice, input.outputPrice, input.contextWindow, Boolean(input.enabled !== false), Boolean(input.isDefault), Boolean(input.multimodal)]
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
      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${reportTable}`);
      return rows[0].n;
    },
    async countReportsSince(iso) {
      const { rows } = await pool.query('SELECT count(*)::int AS n FROM ' + reportTable + ' WHERE created_at >= $1', [iso]);
      return rows[0].n;
    },
    async reportStatusBreakdown() {
      const { rows } = await pool.query('SELECT status, count(*)::int AS n FROM ' + reportTable + ' GROUP BY status ORDER BY n DESC');
      return rows;
    },
    async reportEmailStatusBreakdown() {
      const { rows } = await pool.query('SELECT email_status, count(*)::int AS n FROM ' + reportTable + ' GROUP BY email_status ORDER BY n DESC');
      return rows;
    },
    async trend(days = 14) {
      const { rows } = await pool.query(
        `SELECT d::date AS day,
           COALESCE(u.n, 0)::int AS users,
           COALESCE(r.n, 0)::int AS reports
         FROM generate_series(current_date - ($1::int - 1), current_date, interval '1 day') AS d
         LEFT JOIN (SELECT ${cnDate} AS day, count(*) AS n FROM ${userTable} GROUP BY 1) u ON u.day = d::date
         LEFT JOIN (SELECT ${cnDate} AS day, count(*) AS n FROM ${reportTable} GROUP BY 1) r ON r.day = d::date
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
         FROM ${reportTable} ORDER BY created_at DESC LIMIT $1`,
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
         FROM ${reportTable} WHERE user_id = $1 ORDER BY created_at DESC`,
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
      const clauses = [];
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
        `SELECT id, access_token, company_short_name, job_title, report_name, status, email_status, email, usage, cost_usd, created_at
         FROM ${reportTable} ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
        params
      );
      return rows;
    },
    async countSearchReports({ q, status, emailStatus }) {
      const clauses = [];
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
      const { rows } = await pool.query('SELECT * FROM ' + reportTable + ' WHERE id = $1', [id]);
      return rows[0] || null;
    },
    async deleteReport(id) {
      await pool.query('DELETE FROM ' + reportTable + ' WHERE id = $1', [id]);
    },
  };
}