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
CREATE TABLE IF NOT EXISTS app_reports (
  id uuid PRIMARY KEY,
  access_token text NOT NULL UNIQUE,
  user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  email text,
  company_short_name text,
  job_title text,
  report_name text,
  status text NOT NULL,
  email_status text NOT NULL,
  report jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS app_reports_user_id_idx ON app_reports(user_id);
`;

function selectedUrl() {
  const mode = (process.env.APP_URL_MODE || (process.env.NODE_ENV === 'production' ? 'server' : 'local')).toLowerCase();
  return mode === 'server' ? process.env.DATABASE_URL_SERVER : process.env.DATABASE_URL_LOCAL;
}

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
          users: users.rows.map(row => ({ id: row.id, email: row.email, passwordHash: row.password_hash, emailVerifiedAt: row.email_verified_at?.toISOString() || null, resumeText: row.resume_text || '', resumeUpdatedAt: row.resume_updated_at?.toISOString() || null, resumeFileName: row.resume_file_name || null, resumeFileMime: row.resume_file_mime || null, resumeFileSize: row.resume_file_size == null ? null : Number(row.resume_file_size), resumeFilePath: row.resume_file_path || null, resumeFileUploadedAt: row.resume_file_uploaded_at?.toISOString() || null, createdAt: row.created_at.toISOString(), emailVerificationTokenHash: row.email_verification_token_hash, emailVerificationExpiresAt: row.email_verification_expires_at?.toISOString() || null, verificationSentAt: row.verification_sent_at?.toISOString() || null, verificationMessageId: row.verification_message_id, verificationEmailStatus: row.verification_email_status, verificationEmailError: row.verification_email_error })),
          sessions: sessions.rows.map(row => ({ token: row.token, userId: row.user_id, expiresAt: row.expires_at.toISOString() })),
          reports: reports.rows.map(row => ({ id: row.id, accessToken: row.access_token, userId: row.user_id, email: row.email, companyShortName: row.company_short_name, jobTitle: row.job_title, reportName: row.report_name, status: row.status, emailStatus: row.email_status, report: row.report, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() }))
        };
      } finally { client.release(); }
    },
    async saveDb(db) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const user of db.users || []) await client.query(`INSERT INTO app_users (id,email,password_hash,email_verified_at,resume_text,resume_updated_at,resume_file_name,resume_file_mime,resume_file_size,resume_file_path,resume_file_uploaded_at,created_at,email_verification_token_hash,email_verification_expires_at,verification_sent_at,verification_message_id,verification_email_status,verification_email_error) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) ON CONFLICT (id) DO UPDATE SET email=$2,password_hash=$3,email_verified_at=$4,resume_text=$5,resume_updated_at=$6,resume_file_name=$7,resume_file_mime=$8,resume_file_size=$9,resume_file_path=$10,resume_file_uploaded_at=$11,email_verification_token_hash=$13,email_verification_expires_at=$14,verification_sent_at=$15,verification_message_id=$16,verification_email_status=$17,verification_email_error=$18`, [user.id,user.email,user.passwordHash,user.emailVerifiedAt||null,user.resumeText||null,user.resumeUpdatedAt||null,user.resumeFileName||null,user.resumeFileMime||null,user.resumeFileSize==null?null:user.resumeFileSize,user.resumeFilePath||null,user.resumeFileUploadedAt||null,user.createdAt,user.emailVerificationTokenHash||null,user.emailVerificationExpiresAt||null,user.verificationSentAt||null,user.verificationMessageId||null,user.verificationEmailStatus||null,user.verificationEmailError||null]);
        await client.query('DELETE FROM app_sessions');
        for (const session of db.sessions || []) await client.query('INSERT INTO app_sessions (token,user_id,expires_at) VALUES ($1,$2,$3)', [session.token,session.userId,session.expiresAt]);
        for (const report of db.reports || []) await client.query(`INSERT INTO app_reports (id,access_token,user_id,email,company_short_name,job_title,report_name,status,email_status,report,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO UPDATE SET access_token=$2,user_id=$3,email=$4,company_short_name=$5,job_title=$6,email_status=$9,updated_at=$12,report=$10,report_name=$7`, [report.id,report.accessToken,report.userId||null,report.email||null,report.companyShortName||null,report.jobTitle||null,report.reportName||null,report.status||'completed',report.emailStatus||'unknown',JSON.stringify(report.report||{}),report.createdAt,report.updatedAt]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    }
  };
}
