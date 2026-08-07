import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { createPgStore } from '../db.js';

const jsonPath = process.env.JSON_DB_PATH || '.runtime/db.json';
const data = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
const users = data.users || [];
const userByEmail = new Map(users.map(user => [user.email, user]));
const fallbackUser = users.length === 1 ? users[0] : null;
const reports = (data.reports || []).map(report => ({
  ...report,
  accessToken: report.accessToken || crypto.randomBytes(24).toString('base64url'),
  userId: report.userId || userByEmail.get(report.email)?.id || fallbackUser?.id || null,
  email: report.email || userByEmail.get(report.userId)?.email || fallbackUser?.email || null,
  createdAt: report.createdAt || new Date().toISOString(),
  updatedAt: report.updatedAt || report.createdAt || new Date().toISOString()
}));
const store = createPgStore();
await store.init();
await store.saveDb({ users, sessions: data.sessions || [], reports });
await store.close();
console.log(JSON.stringify({ migrated: true, users: users.length, sessions: (data.sessions || []).length, reports: reports.length }));
