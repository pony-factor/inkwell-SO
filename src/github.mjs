import { createHmac, createSign, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { MAX_INPUT_LENGTH, spellcheckText } from './core.mjs';

export function verifyWebhookSignature(body, signature, secret) {
  if (!secret || !Buffer.isBuffer(body) || typeof signature !== 'string' ||
      !/^sha256=[a-f\d]{64}$/.test(signature)) return false;
  const actual = Buffer.from(signature.slice(7), 'hex');
  const expected = createHmac('sha256', secret).update(body).digest();
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function appJWT(appId, key, now = Date.now()) {
  if (!/^\d+$/.test(String(appId)) || !key) throw new Error('GitHub App credentials required');
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const iat = Math.floor(now / 1000) - 60;
  const claims = Buffer.from(JSON.stringify({ iat, exp: iat + 540, iss: String(appId) })).toString('base64url');
  const data = `${header}.${claims}`;
  return `${data}.${createSign('RSA-SHA256').update(data).end().sign(key, 'base64url')}`;
}

function privateKey(env) {
  return env.GITHUB_PRIVATE_KEY_PATH ? readFileSync(env.GITHUB_PRIVATE_KEY_PATH, 'utf8') :
    (env.GITHUB_PRIVATE_KEY || '').replace(/\\n/g, '\n');
}

async function api(path, token, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(`https://api.github.com${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'inkwell-so',
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  });
  if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}`);
  return response.status === 204 ? {} : response.json();
}

export async function installationToken(installationId, repositoryName, env, fetchImpl = fetch) {
  const response = await api(`/app/installations/${installationId}/access_tokens`,
    appJWT(env.GITHUB_APP_ID, privateKey(env)),
    { method: 'POST', body: { repositories: [repositoryName] } }, fetchImpl);
  if (typeof response.token !== 'string') throw new Error('Missing installation token');
  return response.token;
}

export function commandText(body, fallback = '') {
  if (typeof body !== 'string') return null;
  const match = body.match(/^\/spellcheck(?:[ \t]+|\r?\n|$)([\s\S]*)$/i);
  return match ? ((match[1] || '').trim() || fallback || '') : null;
}

function fenced(text, language) {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map(m => m[0].length));
  const fence = '`'.repeat(Math.max(4, longest + 1));
  return `${fence}${language}\n${text}\n${fence}`;
}

export function formatReply(result, style) {
  if (result.rejected) return '✒️ **Spellcheck Pony:** Formatting protection prevented a safe correction.';
  if (!result.changed) return '✒️ **Spellcheck Pony:** No clear spelling errors found.';
  if (style === 'diff') {
    const previous = result.original.split('\n');
    const changed = result.corrected.split('\n');
    const lines = changed.flatMap((line, i) =>
      line === previous[i] ? [' ' + line] : ['-' + previous[i], '+' + line]).join('\n');
    return '✒️ **Spellcheck Pony** · spelling suggestions only\n\n' + fenced(lines, 'diff');
  }
  return '✒️ **Spellcheck Pony** · spelling suggestions only\n\n' + fenced(result.corrected, 'text');
}

export async function processGitHubEvent(name, event, { store, provider, env = process.env,
  fetchImpl = fetch, getToken = installationToken }) {
  const issue = name === 'issue_comment' && event.action === 'created';
  const review = name === 'pull_request_review_comment' && event.action === 'created';
  if (!issue && !review) return false;
  const user = event.comment?.user;
  if (!user || user.type === 'Bot' || !Number.isSafeInteger(user.id)) return false;
  const fullName = event.repository?.full_name;
  const installationId = event.installation?.id;
  if (!/^[\w.-]+\/[\w.-]+$/.test(fullName || '') ||
    !Number.isSafeInteger(installationId)) return false;
  const number = issue ? event.issue?.number : event.pull_request?.number;
  if (!Number.isSafeInteger(number) || (review && !Number.isSafeInteger(event.comment.id))) return false;
  const text = commandText(event.comment.body, issue ? event.issue.body : '');
  if (text === null || !text.trim() || text.length > MAX_INPUT_LENGTH) return false;
  const prefs = store.get(user.id);
  const result = await spellcheckText(text, prefs, provider);
  const [owner, repo] = fullName.split('/');
  const token = await getToken(installationId, repo, env, fetchImpl);
  const path = issue
    ? `/repos/${owner}/${repo}/issues/${number}/comments`
    : `/repos/${owner}/${repo}/pulls/${number}/comments/${event.comment.id}/replies`;
  await api(path, token, { method: 'POST', body: { body: formatReply(result, prefs.githubReplyMode) } }, fetchImpl);
  return true;
}

export function createGitHubWebhookHandler(env = process.env) {
  const inFlight = new Set(), finished = new Set();
  return async (req, res, { store, provider }) => {
    if (!env.GITHUB_APP_ID || !env.GITHUB_WEBHOOK_SECRET || !privateKey(env)) {
      res.writeHead(503); res.end('GitHub App not configured'); return;
    }
    let size = 0;
    const parts = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1_048_576) { res.writeHead(413); res.end('Too large'); return; }
      parts.push(chunk);
    }
    const body = Buffer.concat(parts);
    if (!verifyWebhookSignature(body, req.headers['x-hub-signature-256'], env.GITHUB_WEBHOOK_SECRET)) {
      res.writeHead(401); res.end('Signature invalid'); return;
    }
    let event;
    try { event = JSON.parse(body.toString('utf8')); }
    catch { res.writeHead(400); res.end('Invalid JSON'); return; }
    const id = req.headers['x-github-delivery'], name = req.headers['x-github-event'];
    if (typeof id !== 'string' || !/^[\w-]{16,100}$/.test(id) || typeof name !== 'string') {
      res.writeHead(400); res.end('Missing delivery headers'); return;
    }
    res.writeHead(202); res.end('Accepted');
    if (inFlight.has(id) || finished.has(id)) return;
    inFlight.add(id);
    queueMicrotask(async () => {
      try {
        await processGitHubEvent(name, event, { store, provider, env });
        finished.add(id);
        if (finished.size > 1000) finished.delete(finished.values().next().value);
      } catch (error) { console.error('GitHub spellcheck failed:', error.message); }
      finally { inFlight.delete(id); }
    });
  };
}
