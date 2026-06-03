# Sync Server — Offline → Cloud

A small, self-contained **Node + SQLite** backend. The phone works fully offline
and queues every enrollment and attendance event locally; when it regains
connectivity it flushes the queue here. Sync is an **idempotent upsert** keyed on
each record's client-generated UUID, so retries and duplicate sends are safe.

No external accounts, no cloud project — `npm install && npm start`.

## Run

```bash
cd server
cp .env.example .env        # optional; defaults are fine for local/demo
npm install
npm start                   # http://localhost:4000  (dashboard at /)
npm run seed                # optional: insert demo rows to populate the dashboard
```

## API

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| GET  | `/health` | — | liveness probe |
| POST | `/sync/users` | `x-api-key` | upsert enrolled users (id, name, embedding) |
| POST | `/sync/attendance` | `x-api-key` | upsert attendance events (idempotent) |
| GET  | `/api/stats` | — | dashboard counters |
| GET  | `/api/attendance?limit=N` | — | recent attendance |
| GET  | `/api/users` | — | enrolled users |
| GET  | `/` | — | live HTML dashboard (auto-refresh) |

Write endpoints require header `x-api-key: <API_KEY>` (default `nhai-dev-key`).

### Example

```bash
curl -s localhost:4000/health

curl -s -X POST localhost:4000/sync/attendance \
  -H 'content-type: application/json' -H 'x-api-key: nhai-dev-key' \
  -d '{"records":[{"id":"a-1","name":"Saud","user_id":"u-saud","timestamp":1733300000000,
                   "liveness_passed":true,"challenge":"blink","score":0.81,"device_id":"Pixel-7a"}]}'
# -> {"ok":true,"accepted":["a-1"]}
```

## Sync contract (how the app uses it)

1. App stores users/attendance locally in expo-sqlite with a `synced` flag.
2. When `NetInfo` reports connectivity, the app POSTs all rows where `synced = 0`.
3. The server upserts by UUID and returns the accepted IDs.
4. The app marks those rows `synced = 1`. A record can be sent any number of
   times without creating duplicates.

## Schema

`users(id, name, embedding, created_at, synced_at)` ·
`attendance(id, user_id, name, timestamp, liveness_passed, challenge, score, device_id, synced_at)`

The `data/` directory (the SQLite file) is git-ignored.
