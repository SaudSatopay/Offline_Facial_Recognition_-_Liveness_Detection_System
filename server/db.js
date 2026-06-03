// SQLite storage + idempotent merge logic for the sync backend.
//
// The phone is the source of truth while offline. Every user and attendance
// record carries a client-generated UUID, so re-sending the same record (after
// a flaky connection, say) is a no-op on the server — "sync" is just an
// idempotent upsert keyed on that UUID.
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,         -- client UUID
      name        TEXT NOT NULL,
      embedding   TEXT,                     -- JSON float[] (cloud backup of the face template)
      created_at  INTEGER NOT NULL,
      synced_at   INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attendance (
      id              TEXT PRIMARY KEY,      -- client UUID
      user_id         TEXT,
      name            TEXT,
      timestamp       INTEGER NOT NULL,      -- when attendance was marked (epoch ms)
      liveness_passed INTEGER NOT NULL,      -- 0/1 — was the anti-spoof challenge passed
      challenge       TEXT,                  -- which liveness challenge was issued
      score           REAL,                  -- recognition cosine similarity
      device_id       TEXT,
      synced_at       INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_attendance_ts ON attendance(timestamp DESC);
  `);
  return db;
}

// ---- writes (idempotent) --------------------------------------------------
export function upsertUsers(db, users, now) {
  const stmt = db.prepare(`
    INSERT INTO users (id, name, embedding, created_at, synced_at)
    VALUES (@id, @name, @embedding, @created_at, @synced_at)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      embedding = excluded.embedding,
      synced_at = excluded.synced_at
  `);
  const tx = db.transaction((rows) => {
    const ids = [];
    for (const u of rows) {
      stmt.run({
        id: u.id,
        name: u.name,
        embedding: u.embedding ? JSON.stringify(u.embedding) : null,
        created_at: u.created_at ?? now,
        synced_at: now,
      });
      ids.push(u.id);
    }
    return ids;
  });
  return tx(users);
}

export function upsertAttendance(db, records, now) {
  const stmt = db.prepare(`
    INSERT INTO attendance
      (id, user_id, name, timestamp, liveness_passed, challenge, score, device_id, synced_at)
    VALUES
      (@id, @user_id, @name, @timestamp, @liveness_passed, @challenge, @score, @device_id, @synced_at)
    ON CONFLICT(id) DO NOTHING
  `);
  const tx = db.transaction((rows) => {
    const ids = [];
    for (const r of rows) {
      stmt.run({
        id: r.id,
        user_id: r.user_id ?? null,
        name: r.name ?? null,
        timestamp: r.timestamp,
        liveness_passed: r.liveness_passed ? 1 : 0,
        challenge: r.challenge ?? null,
        score: r.score ?? null,
        device_id: r.device_id ?? null,
        synced_at: now,
      });
      ids.push(r.id);
    }
    return ids;
  });
  return tx(records);
}

// ---- reads ----------------------------------------------------------------
export function listUsers(db) {
  return db.prepare('SELECT id, name, created_at, synced_at FROM users ORDER BY created_at DESC').all();
}

export function listAttendance(db, limit = 200) {
  return db
    .prepare('SELECT * FROM attendance ORDER BY timestamp DESC LIMIT ?')
    .all(limit);
}

export function stats(db) {
  const users = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  const total = db.prepare('SELECT COUNT(*) c FROM attendance').get().c;
  const live = db.prepare('SELECT COUNT(*) c FROM attendance WHERE liveness_passed = 1').get().c;
  const today = db
    .prepare('SELECT COUNT(*) c FROM attendance WHERE timestamp >= ?')
    .get(Date.now() - 24 * 3600 * 1000).c;
  return { users, attendance_total: total, attendance_live: live, attendance_24h: today };
}
