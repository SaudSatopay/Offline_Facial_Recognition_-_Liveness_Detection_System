// Enrolled users + their face templates (embeddings).
import { getDb, uid } from './database';

export type User = { id: string; name: string; created_at: number; synced: number };
export type GalleryEntry = { id: string; name: string; embedding: number[] };

export function enrollUser(name: string, embedding: number[]): User {
  const db = getDb();
  const user: User = { id: uid('u-'), name: name.trim(), created_at: Date.now(), synced: 0 };
  db.runSync(
    'INSERT INTO users (id, name, embedding, created_at, synced) VALUES (?, ?, ?, ?, 0)',
    user.id, user.name, JSON.stringify(embedding), user.created_at,
  );
  return user;
}

export function listUsers(): User[] {
  return getDb().getAllSync<User>(
    'SELECT id, name, created_at, synced FROM users ORDER BY created_at DESC',
  );
}

export function countUsers(): number {
  const r = getDb().getFirstSync<{ c: number }>('SELECT COUNT(*) AS c FROM users');
  return r?.c ?? 0;
}

// The face gallery used for 1:N identification.
export function getGallery(): GalleryEntry[] {
  const rows = getDb().getAllSync<{ id: string; name: string; embedding: string }>(
    'SELECT id, name, embedding FROM users',
  );
  return rows.map((r) => ({ id: r.id, name: r.name, embedding: JSON.parse(r.embedding) }));
}

export function deleteUser(id: string): void {
  getDb().runSync('DELETE FROM users WHERE id = ?', id);
}

export function getUnsyncedUsers() {
  return getDb().getAllSync<{ id: string; name: string; embedding: string; created_at: number }>(
    'SELECT id, name, embedding, created_at FROM users WHERE synced = 0',
  );
}

export function markUsersSynced(ids: string[]): void {
  if (!ids.length) return;
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  db.runSync(`UPDATE users SET synced = 1 WHERE id IN (${placeholders})`, ...ids);
}
