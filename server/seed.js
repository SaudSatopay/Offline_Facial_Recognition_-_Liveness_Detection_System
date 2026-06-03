// Insert demo data so the dashboard has something to show without a phone.
// Usage:  node seed.js
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, upsertUsers, upsertAttendance } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = openDb(process.env.DB_PATH || join(__dirname, 'data', 'sync.sqlite'));
const now = Date.now();

const users = [
  { id: 'u-anita', name: 'Anita Sharma', created_at: now - 5 * 86400000 },
  { id: 'u-rahul', name: 'Rahul Verma', created_at: now - 4 * 86400000 },
  { id: 'u-saud', name: 'Saud Satopay', created_at: now - 3 * 86400000 },
];
upsertUsers(db, users, now);

const challenges = ['blink', 'smile', 'turn_left', 'open_mouth'];
const records = [];
for (let i = 0; i < 12; i++) {
  const u = users[i % users.length];
  const live = i % 7 !== 0; // one spoof attempt for contrast
  records.push({
    id: `a-${i}-${u.id}`,
    user_id: live ? u.id : null,
    name: live ? u.name : null,
    timestamp: now - i * 1800000,
    liveness_passed: live,
    challenge: challenges[i % challenges.length],
    score: live ? +(0.62 + Math.random() * 0.3).toFixed(3) : +(0.2 + Math.random() * 0.2).toFixed(3),
    device_id: `Pixel-${(i % 3) + 4}a`,
  });
}
upsertAttendance(db, records, now);

console.log(`[seed] inserted ${users.length} users + ${records.length} attendance records`);
