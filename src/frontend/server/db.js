import { Pool } from 'pg';

const schema = `
CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  email_verified_at timestamptz,
  resume_text text,
  resume_updated_at timestamptz,
  resume_file_name text,
  resume_file_mime text,
  resume_file_size integer,
  resume_file_path text,
  resume_file_uploaded_at timestamptz,
  resume_structured jsonb,
  resume_structured_usage jsonb,
  resume_structured_at timestamptz,
  created_at timestamptz NOT NULL,
  email_verification_token_hash text,
  email_verification_expires_at timestamptz,
  verification_sent_at timestamptz,
  verification_message_id text,
  verification_email_status text,
  verification_email_error text
);
CREATE TABLE IF NOT EXISTS app_sessions (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS app_sessions_user_id_idx ON app_sessions(user_id);
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS resume_file_name text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS resume_file_mime text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS resume_file_size integer;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS resume_file_path text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS resume_file_uploaded_at timestamptz;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS resume_structured jsonb;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS resume_structured_usage jsonb;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS resume_structured_at timestamptz;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS resume_masked_fields jsonb;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS facts_confirmed_at timestamptz;
CREATE TABLE IF NOT EXISTS app_reports (
  id uuid PRIMARY KEY,
  access_token text NOT NULL UNIQUE,
  user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  email text,
  company_short_name text,
  job_title text,
  job_text text,
  report_name text,
  status text NOT NULL,
  email_status text NOT NULL,
  report jsonb NOT NULL,
  usage jsonb,
  cost_usd numeric,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS app_reports_user_id_idx ON app_reports(user_id);
ALTER TABLE app_reports ADD COLUMN IF NOT EXISTS usage jsonb;
ALTER TABLE app_reports ADD COLUMN IF NOT EXISTS cost_usd numeric;
ALTER TABLE app_reports ADD COLUMN IF NOT EXISTS cost_source text;
ALTER TABLE app_reports ADD COLUMN IF NOT EXISTS job_text text;
ALTER TABLE app_reports ADD COLUMN IF NOT EXISTS email_sent_times jsonb;
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

`;

function selectedUrl() {
  const mode = (process.env.APP_URL_MODE || (process.env.NODE_ENV === 'production' ? 'server' : 'local')).toLowerCase();
  return mode === 'server' ? process.env.DATABASE_URL_SERVER : process.env.DATABASE_URL_LOCAL;
}

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

export function createPgStore() {
  const connectionString = selectedUrl() || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL_LOCAL 或 DATABASE_URL_SERVER 未配置。');
  const pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30000 });
  return {
    async init() { await pool.query(schema); },
    async close() { await pool.end(); },
    async readDb() {
      const client = await pool.connect();
      try {
        const users = await client.query('SELECT * FROM app_users ORDER BY created_at');
        const sessions = await client.query('SELECT token, user_id, expires_at FROM app_sessions');
        const reports = await client.query('SELECT * FROM app_reports ORDER BY created_at');
        return {
          users: users.rows.map(row => ({ id: row.id, email: row.email, passwordHash: row.password_hash, emailVerifiedAt: row.email_verified_at?.toISOString() || null, resumeText: row.resume_text || '', resumeUpdatedAt: row.resume_updated_at?.toISOString() || null, resumeFileName: row.resume_file_name || null, resumeFileMime: row.resume_file_mime || null, resumeFileSize: row.resume_file_size == null ? null : Number(row.resume_file_size), resumeFilePath: row.resume_file_path || null, resumeFileUploadedAt: row.resume_file_uploaded_at?.toISOString() || null, resumeStructured: row.resume_structured || null, resumeStructuredUsage: row.resume_structured_usage || null, resumeStructuredAt: row.resume_structured_at?.toISOString() || null, resumeMaskedFields: row.resume_masked_fields || null, factsConfirmedAt: row.facts_confirmed_at?.toISOString() || null, createdAt: row.created_at.toISOString(), emailVerificationTokenHash: row.email_verification_token_hash, emailVerificationExpiresAt: row.email_verification_expires_at?.toISOString() || null, verificationSentAt: row.verification_sent_at?.toISOString() || null, verificationMessageId: row.verification_message_id, verificationEmailStatus: row.verification_email_status, verificationEmailError: row.verification_email_error })),
          sessions: sessions.rows.map(row => ({ token: row.token, userId: row.user_id, expiresAt: row.expires_at.toISOString() })),
          reports: reports.rows.map(row => ({ id: row.id, accessToken: row.access_token, userId: row.user_id, email: row.email, companyShortName: row.company_short_name, jobTitle: row.job_title, reportName: row.report_name, status: row.status, emailStatus: row.email_status, report: row.report, usage: row.usage, costUsd: row.cost_usd == null ? null : Number(row.cost_usd), costSource: row.cost_source || null, jobText: row.job_text || null, emailSentTimes: Array.isArray(row.email_sent_times) ? row.email_sent_times : [], deletedAt: row.deleted_at?.toISOString() || null, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() }))
        };
      } finally { client.release(); }
    },
    async saveDb(db) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const user of db.users || []) await client.query(`INSERT INTO app_users (id,email,password_hash,email_verified_at,resume_text,resume_updated_at,resume_file_name,resume_file_mime,resume_file_size,resume_file_path,resume_file_uploaded_at,resume_structured,resume_structured_usage,resume_structured_at,created_at,email_verification_token_hash,email_verification_expires_at,verification_sent_at,verification_message_id,verification_email_status,verification_email_error,resume_masked_fields,facts_confirmed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) ON CONFLICT (id) DO UPDATE SET email=$2,password_hash=$3,email_verified_at=$4,resume_text=$5,resume_updated_at=$6,resume_file_name=$7,resume_file_mime=$8,resume_file_size=$9,resume_file_path=$10,resume_file_uploaded_at=$11,resume_structured=$12,resume_structured_usage=$13,resume_structured_at=$14,email_verification_token_hash=$16,email_verification_expires_at=$17,verification_sent_at=$18,verification_message_id=$19,verification_email_status=$20,verification_email_error=$21,resume_masked_fields=$22,facts_confirmed_at=$23`, [user.id,user.email,user.passwordHash,user.emailVerifiedAt||null,user.resumeText||null,user.resumeUpdatedAt||null,user.resumeFileName||null,user.resumeFileMime||null,user.resumeFileSize==null?null:user.resumeFileSize,user.resumeFilePath||null,user.resumeFileUploadedAt||null,user.resumeStructured?JSON.stringify(user.resumeStructured):null,user.resumeStructuredUsage?JSON.stringify(user.resumeStructuredUsage):null,user.resumeStructuredAt||null,user.createdAt,user.emailVerificationTokenHash||null,user.emailVerificationExpiresAt||null,user.verificationSentAt||null,user.verificationMessageId||null,user.verificationEmailStatus||null,user.verificationEmailError||null,user.resumeMaskedFields?JSON.stringify(user.resumeMaskedFields):null,user.factsConfirmedAt||null]);
        await client.query('DELETE FROM app_sessions');
        for (const session of db.sessions || []) await client.query('INSERT INTO app_sessions (token,user_id,expires_at) VALUES ($1,$2,$3)', [session.token,session.userId,session.expiresAt]);
        for (const report of db.reports || []) await client.query(`INSERT INTO app_reports (id,access_token,user_id,email,company_short_name,job_title,job_text,report_name,status,email_status,report,usage,cost_usd,cost_source,created_at,updated_at,email_sent_times,deleted_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) ON CONFLICT (id) DO UPDATE SET access_token=$2,user_id=$3,email=$4,company_short_name=$5,job_title=$6,job_text=$7,email_status=$10,updated_at=$16,report=$11,report_name=$8,usage=$12,cost_usd=$13,cost_source=$14,email_sent_times=$17,deleted_at=$18`, [report.id,report.accessToken,report.userId||null,report.email||null,report.companyShortName||null,report.jobTitle||null,report.jobText||null,report.reportName||null,report.status||'completed',report.emailStatus||'unknown',JSON.stringify(report.report||{}),report.usage?JSON.stringify(report.usage):null,report.costUsd==null?null:report.costUsd,report.costSource||null,report.createdAt,report.updatedAt,JSON.stringify(Array.isArray(report.emailSentTimes)?report.emailSentTimes:[]),report.deletedAt||null]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    },
    async getDefaultAiModel(modelType = 'text') {
      const { rows } = await pool.query('SELECT * FROM ai_models WHERE model_type = $1 AND is_default = true AND enabled = true LIMIT 1', [modelType]);
      if (rows[0]) return mapAiModel(rows[0]);
      // 截图识别：不再区分 OCR 类型，优先选择“支持多模态”的默认模型，其次任意启用的多模态模型
      if (modelType === 'ocr') {
        const fb = await pool.query(`SELECT * FROM ai_models WHERE multimodal = true AND is_default = true AND enabled = true LIMIT 1`);
        if (fb.rows[0]) return mapAiModel(fb.rows[0]);
        const any = await pool.query(`SELECT * FROM ai_models WHERE multimodal = true AND enabled = true ORDER BY is_default DESC, created_at LIMIT 1`);
        return mapAiModel(any.rows[0] || null);
      }
      return null;
    },
    async findAiModelByModelId(modelId) {
      const { rows } = await pool.query('SELECT * FROM ai_models WHERE LOWER(model_id) = LOWER($1) ORDER BY is_default DESC LIMIT 1', [String(modelId || '')]);
      return mapAiModel(rows[0] || null);
    },
    // 官方参考价（admin 后台 ai_model_reference_prices 自动拉取），用于费用估算回退
    async findAiModelReferencePrice(modelId) {
      const { rows } = await pool.query('SELECT model_id, input_price, output_price FROM ai_model_reference_prices WHERE LOWER(model_id) = LOWER($1) LIMIT 1', [String(modelId || '')]);
      return rows[0] || null;
    },
    async getAiKeyById(id) {
      const { rows } = await pool.query('SELECT * FROM ai_keys WHERE id = $1', [id]);
      return rows[0] || null;
    },
    async getDefaultAiKey() {
      const { rows } = await pool.query('SELECT * FROM ai_keys WHERE is_default = true AND enabled = true LIMIT 1');
      return rows[0] || null;
    },
    async getAppSettings() {
      const { rows } = await pool.query('SELECT site_name, resend_api_key, email_from FROM admin_settings WHERE id = 1');
      return rows[0] || null;
    }
  };
}
