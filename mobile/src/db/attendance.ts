// Attendance events (the audit log). Each is created locally and later synced.
import { getDb, uid } from './database';

export type AttendanceRecord = {
  id: string;
  user_id: string | null;
  name: string | null;
  timestamp: number;
  liveness_passed: number;
  challenge: string | null;
  score: number | null;
  device_id: string | null;
  synced: number;
};

export function markAttendance(rec: {
  user_id: string | null; name: string | null; liveness_passed: boolean;
  challenge: string; score: number | null; device_id: string;
}): AttendanceRecord {
  const db = getDb();
  const row: AttendanceRecord = {
    id: uid('a-'), user_id: rec.user_id, name: rec.name, timestamp: Date.now(),
    liveness_passed: rec.liveness_passed ? 1 : 0, challenge: rec.challenge,
    score: rec.score, device_id: rec.device_id, synced: 0,
  };
  db.runSync(
    `INSERT INTO attendance
       (id, user_id, name, timestamp, liveness_passed, challenge, score, device_id, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    row.id, row.user_id, row.name, row.timestamp, row.liveness_passed,
    row.challenge, row.score, row.device_id,
  );
  return row;
}

export function listAttendance(limit = 100): AttendanceRecord[] {
  return getDb().getAllSync<AttendanceRecord>(
    'SELECT * FROM attendance ORDER BY timestamp DESC LIMIT ?', limit,
  );
}

export function countToday(): number {
  const since = Date.now() - 24 * 3600 * 1000;
  const r = getDb().getFirstSync<{ c: number }>(
    'SELECT COUNT(*) AS c FROM attendance WHERE timestamp >= ?', since,
  );
  return r?.c ?? 0;
}

export function countUnsynced(): number {
  const r = getDb().getFirstSync<{ c: number }>(
    'SELECT COUNT(*) AS c FROM attendance WHERE synced = 0',
  );
  return r?.c ?? 0;
}

export function getUnsyncedAttendance(): AttendanceRecord[] {
  return getDb().getAllSync<AttendanceRecord>('SELECT * FROM attendance WHERE synced = 0');
}

export function markAttendanceSynced(ids: string[]): void {
  if (!ids.length) return;
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  db.runSync(`UPDATE attendance SET synced = 1 WHERE id IN (${placeholders})`, ...ids);
}

export function countSynced(): number {
  const r = getDb().getFirstSync<{ c: number }>(
    'SELECT COUNT(*) AS c FROM attendance WHERE synced = 1',
  );
  return r?.c ?? 0;
}

// Purge mechanism — only ever deletes records that are already safely in the
// cloud (synced = 1), keeping on-device storage bounded for long-running remote
// deployments. `olderThanMs = 0` purges all synced records (manual action).
export function purgeSynced(olderThanMs = 0): number {
  const cutoff = olderThanMs > 0 ? Date.now() - olderThanMs : Date.now() + 1;
  const r = getDb().runSync('DELETE FROM attendance WHERE synced = 1 AND timestamp < ?', cutoff);
  return r.changes ?? 0;
}
