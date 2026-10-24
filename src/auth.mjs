import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

function hmac(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function signedSession(user, secret, durationSeconds = 7 * 24 * 60 * 60) {
  const payload = Buffer.from(JSON.stringify({
    id: user.id, login: user.login, exp: Math.floor(Date.now() / 1000) + durationSeconds
  })).toString('base64url');
  return `${payload}.${hmac(payload, secret)}`;
}

export function verifySession(raw, secret) {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  const [payload, signature, extra] = raw.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(hmac(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!(typeof data.id === 'number' && Number.isSafeInteger(data.id) && data.id > 0) &&
        data.id !== 'local') return null;
    if (typeof data.login !== 'string' || !Number.isSafeInteger(data.exp) ||
        data.exp <= Math.floor(Date.now() / 1000)) return null;
    return { id: data.id, login: data.login };
  } catch {
    return null;
  }
}

export function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? [] : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  }).filter((pair) => pair.length === 2));
}

export function newOAuthState() {
  return randomBytes(32).toString('base64url');
}

export function matchOAuthState(expected, received) {
  if (typeof received !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && a.length >= 32 && timingSafeEqual(a, b);
}
