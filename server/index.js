// Offline -> cloud sync backend (NHAI Hackathon 2025).
//
// The mobile app works fully offline; when it regains connectivity it flushes
// its local queue here. Write endpoints are idempotent and protected by an API
// key; read endpoints feed a small live dashboard so you can watch records
// arrive from the phone during the demo.
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  openDb, upsertUsers, upsertAttendance, listUsers, listAttendance, stats,
} from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const API_KEY = process.env.API_KEY || 'nhai-dev-key';
const DB_PATH = process.env.DB_PATH || join(__dirname, 'data', 'sync.sqlite');

const db = openDb(DB_PATH);
const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' })); // embeddings are small JSON arrays

// API-key guard for write endpoints
function requireApiKey(req, res, next) {
  if (req.get('x-api-key') !== API_KEY) {
    return res.status(401).json({ ok: false, error: 'invalid or missing x-api-key' });
  }
  next();
}

// ---- health ----
app.get('/health', (_req, res) => res.json({ ok: true, service: 'face-sync', time: Date.now() }));

// ---- sync (writes, idempotent) ----
app.post('/sync/users', requireApiKey, (req, res) => {
  const users = Array.isArray(req.body?.users) ? req.body.users : [];
  if (!users.length) return res.status(400).json({ ok: false, error: 'no users' });
  const accepted = upsertUsers(db, users, Date.now());
  res.json({ ok: true, accepted });
});

app.post('/sync/attendance', requireApiKey, (req, res) => {
  const records = Array.isArray(req.body?.records) ? req.body.records : [];
  if (!records.length) return res.status(400).json({ ok: false, error: 'no records' });
  const accepted = upsertAttendance(db, records, Date.now());
  res.json({ ok: true, accepted }); // client marks these as synced
});

// ---- reads (dashboard) ----
app.get('/api/users', (_req, res) => res.json({ ok: true, users: listUsers(db) }));
app.get('/api/attendance', (req, res) =>
  res.json({ ok: true, attendance: listAttendance(db, Number(req.query.limit) || 200) }));
app.get('/api/stats', (_req, res) => res.json({ ok: true, stats: stats(db) }));

// ---- live dashboard ----
app.use(express.static(join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`[face-sync] listening on http://localhost:${PORT}`);
  console.log(`[face-sync] dashboard:  http://localhost:${PORT}/`);
  console.log(`[face-sync] db:         ${DB_PATH}`);
  console.log(`[face-sync] api key:    ${API_KEY}  (set API_KEY env to change)`);
});
