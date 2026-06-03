// App settings, persisted in the SQLite `settings` table.
import { getDb, uid } from './db/database';
import { DEFAULT_THRESHOLD } from './ml/constants';

export type Settings = {
  serverUrl: string;
  apiKey: string;
  threshold: number;
  deviceId: string;
};

const DEFAULTS: Settings = {
  // Physical device: use your computer's LAN IP, e.g. http://192.168.1.20:4000
  // Android emulator: http://10.0.2.2:4000
  serverUrl: 'http://10.0.2.2:4000',
  apiKey: 'nhai-dev-key',
  threshold: DEFAULT_THRESHOLD,
  deviceId: '',
};

function getRaw(key: string): string | null {
  const r = getDb().getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return r?.value ?? null;
}

function setRaw(key: string, value: string): void {
  getDb().runSync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, value,
  );
}

export function getSettings(): Settings {
  let deviceId = getRaw('deviceId');
  if (!deviceId) {
    deviceId = uid('dev-');
    setRaw('deviceId', deviceId);
  }
  return {
    serverUrl: getRaw('serverUrl') ?? DEFAULTS.serverUrl,
    apiKey: getRaw('apiKey') ?? DEFAULTS.apiKey,
    threshold: Number(getRaw('threshold') ?? DEFAULTS.threshold),
    deviceId,
  };
}

export function updateSettings(patch: Partial<Settings>): void {
  for (const [k, v] of Object.entries(patch)) setRaw(k, String(v));
}
