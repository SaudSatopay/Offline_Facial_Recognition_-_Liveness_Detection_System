// Local-first storage (expo-sqlite). Everything works fully offline here; the
// sync layer later pushes unsynced rows to the cloud server when online.
import * as SQLite from 'expo-sqlite';

let _db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (_db) return _db;
  _db = SQLite.openDatabaseSync('faceattend.db');
  _db.execSync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      embedding   TEXT NOT NULL,          -- JSON number[] (L2-normalized)
      created_at  INTEGER NOT NULL,
      synced      INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS attendance (
      id              TEXT PRIMARY KEY,
      user_id         TEXT,
      name            TEXT,
      timestamp       INTEGER NOT NULL,
      liveness_passed INTEGER NOT NULL,
      challenge       TEXT,
      score           REAL,
      device_id       TEXT,
      synced          INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  return _db;
}

// Lightweight unique id (no native crypto dependency needed).
export function uid(prefix = ''): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}${Date.now().toString(36)}-${rand}`;
}
