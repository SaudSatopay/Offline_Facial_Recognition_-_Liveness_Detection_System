// Thin REST client for the offline->cloud sync server (../../server).
const TIMEOUT_MS = 8000;

async function req(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function checkHealth(baseUrl: string): Promise<boolean> {
  try {
    const res = await req(`${baseUrl}/health`, { method: 'GET' });
    const json = await res.json();
    return !!json.ok;
  } catch {
    return false;
  }
}

export async function postUsers(
  baseUrl: string, apiKey: string,
  users: { id: string; name: string; embedding: number[]; created_at: number }[],
): Promise<string[]> {
  if (!users.length) return [];
  const res = await req(`${baseUrl}/sync/users`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ users }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'sync users failed');
  return json.accepted as string[];
}

export async function postAttendance(
  baseUrl: string, apiKey: string, records: any[],
): Promise<string[]> {
  if (!records.length) return [];
  const res = await req(`${baseUrl}/sync/attendance`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ records }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'sync attendance failed');
  return json.accepted as string[];
}
