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
        `SELECT id, access_token, company_short_name, job_title, report_name, status, email_status, email, created_at
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