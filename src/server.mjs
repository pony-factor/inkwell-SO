import http from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PreferenceStore } from './storage.mjs';
import { normalizePreferences, openAIComplete, spellcheckText } from './core.mjs';
import { matchOAuthState, newOAuthState, parseCookies, signedSession, verifySession } from './auth.mjs';

const BASE_DIR = fileURLToPath(new URL('../', import.meta.url));
const STATIC = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['public/styles.css', 'text/css; charset=utf-8']]
]);
const MAX_BODY = 32_768;
const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};
const fail = (res, status, error) => json(res, status, { error });
const redirect = (res, location, cookies = []) => {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store', 'Set-Cookie': cookies });
  res.end();
};
const cookie = (name, value, secure, maxAge) =>
  `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; ${secure ? 'Secure; ' : ''}Max-Age=${maxAge}`;

async function receiveJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new TypeError('Request body too large');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new TypeError('Invalid JSON request'); }
}

async function githubSignIn(code, clientId, clientSecret) {
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
  });
  if (!tokenResponse.ok) throw new Error('GitHub login request failed');
  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) throw new Error('GitHub did not authorize the sign-in');
  const response = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github+json', 'User-Agent': 'inkwell-so' }
  });
  if (!response.ok) throw new Error('GitHub identity verification failed');
  const user = await response.json();
  if (!Number.isSafeInteger(user.id) || typeof user.login !== 'string') throw new Error('Invalid GitHub identity');
  return { id: user.id, login: user.login };
}

export function makeHandler({
  store = new PreferenceStore(), provider = openAIComplete,
  env = process.env, githubWebhook = null
} = {}) {
  const host = env.HOST || '127.0.0.1';
  const local = env.LOCAL_DEV_MODE === '1';
  if (local && !['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error('LOCAL_DEV_MODE requires a loopback HOST');
  }
  const base = new URL(env.APP_BASE_URL || `http://${host}:${env.PORT || 3000}`);
  const secure = base.protocol === 'https:';
  const authEnabled = Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.SESSION_SECRET);
  if (!local && !authEnabled) {
    throw new Error('Configure GitHub OAuth client credentials and SESSION_SECRET or enable loopback LOCAL_DEV_MODE=1');
  }
  if (authEnabled && env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must have at least 32 characters');
  if (!local && !secure && !['localhost', '127.0.0.1'].includes(base.hostname)) {
    throw new Error('Public GitHub sign-in must use HTTPS APP_BASE_URL');
  }

  return async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'");
    const url = new URL(req.url || '/', base);
    const pathname = url.pathname;
    const cookies = parseCookies(req.headers.cookie);
    const user = local
      ? { id: 'local', login: 'Local user' }
      : verifySession(cookies.inkwell_session, env.SESSION_SECRET || '');
    try {
      if (req.method === 'GET' && STATIC.has(pathname)) {
        const [path, type] = STATIC.get(pathname);
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
        res.end(readFileSync(resolve(BASE_DIR, path)));
        return;
      }
      if (req.method === 'GET' && pathname === '/healthz') return json(res, 200, { ok: true });
      if (req.method === 'GET' && pathname === '/api/me') {
        return json(res, 200, { signedIn: Boolean(user), login: user?.login || null,
          local, app: 'spellcheck-pony' });
      }
      if (req.method === 'GET' && pathname === '/login' && authEnabled && !local) {
        const state = newOAuthState();
        const args = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, state });
        redirect(res, `https://github.com/login/oauth/authorize?${args}`,
          [cookie('inkwell_oauth_state', state, secure, 600)]);
        return;
      }
      if (req.method === 'GET' && pathname === '/auth/callback' && authEnabled && !local) {
        if (!matchOAuthState(cookies.inkwell_oauth_state, url.searchParams.get('state')) ||
            !url.searchParams.get('code')) return fail(res, 400, 'Invalid sign-in state');
        const signedIn = await githubSignIn(url.searchParams.get('code'), env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET);
        redirect(res, '/', [
          cookie('inkwell_oauth_state', '', secure, 0),
          cookie('inkwell_session', signedSession(signedIn, env.SESSION_SECRET), secure, 604800)
        ]);
        return;
      }
      if (req.method === 'POST' && pathname === '/api/github/webhook' && githubWebhook) {
        return await githubWebhook(req, res, { store, provider });
      }
      if (req.method === 'GET' && pathname === '/api/preferences') {
        if (!user) return fail(res, 401, 'Sign in with GitHub first');
        return json(res, 200, store.get(user.id));
      }
      if (req.method === 'POST' && ['/api/preferences', '/api/spellcheck', '/logout'].includes(pathname)) {
        // A custom request header cannot be sent by cross-origin HTML forms;
        // SameSite cookies plus no CORS further restrict CSRF.
        if (req.headers['x-inkwell-request'] !== '1' ||
            (req.headers.origin && req.headers.origin !== base.origin)) {
          return fail(res, 403, 'Invalid request origin');
        }
        if (!user) return fail(res, 401, 'Sign in with GitHub first');
        if (pathname === '/logout') {
          res.writeHead(204, { 'Set-Cookie': cookie('inkwell_session', '', secure, 0) }); res.end(); return;
        }
        const payload = await receiveJson(req);
        if (pathname === '/api/preferences') {
          return json(res, 200, store.set(user.id, normalizePreferences(payload)));
        }
        if (typeof payload?.text !== 'string') throw new TypeError('text must be a string');
        return json(res, 200, await spellcheckText(payload.text, store.get(user.id), provider));
      }
      fail(res, 404, 'Not found');
    } catch (error) {
      if (error instanceof TypeError) return fail(res, 400, error.message);
      console.error('Inkwell request failed:', error.message);
      return fail(res, 502, 'Request failed; check server configuration and logs');
    }
  };
}

export function startServer(options = {}) {
  const env = options.env || process.env;
  const handler = makeHandler(options);
  const host = env.HOST || '127.0.0.1', port = Number(env.PORT || 3000);
  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      console.error('Unhandled server error', error);
      if (!res.headersSent) fail(res, 500, 'Unexpected server error');
    });
  });
  server.listen(port, host, () => console.log(`Inkwell SO listening on http://${host}:${port}`));
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startServer();
