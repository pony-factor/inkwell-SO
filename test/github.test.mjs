import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync, verify } from 'node:crypto';
import { appJWT, commandText, formatReply, processGitHubEvent, verifyWebhookSignature } from '../src/github.mjs';

test('authenticates valid GitHub signatures only', () => {
  const body = Buffer.from('{"action":"created"}');
  const sig = 'sha256=' + createHmac('sha256', 'secret').update(body).digest('hex');
  assert.equal(verifyWebhookSignature(body, sig, 'secret'), true);
  assert.equal(verifyWebhookSignature(Buffer.from('altered'), sig, 'secret'), false);
  assert.equal(verifyWebhookSignature(body, 'sha1=unsafe', 'secret'), false);
});

test('installation JWT is signed with the supplied private key', () => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwt = appJWT(17, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const parts = jwt.split('.');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  assert.equal(parts.length, 3);
  assert.equal(claims.iss, '17');
  assert.ok(claims.exp - claims.iat <= 600);
  assert.equal(verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]),
    pair.publicKey, Buffer.from(parts[2], 'base64url')), true);
});

test('only explicit commands are recognized', () => {
  assert.equal(commandText('/spellcheck\nPleese help.'), 'Pleese help.');
  assert.equal(commandText('/spellcheck', 'Issue descriptin'), 'Issue descriptin');
  assert.equal(commandText('/spellchecker text'), null);
  assert.equal(commandText('hello /spellcheck'), null);
});

test('corrected comments safely quote embedded backticks', () => {
  const result = { original: 'Plese ````', corrected: 'Please ````', changed: true, rejected: false };
  assert.match(formatReply(result), /`````text/);
  assert.match(formatReply(result, 'diff'), /diff/);
});

test('uses author preferences to spellcheck only opted-in issue comments', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 201, json: async () => ({ id: 1 }) };
  };
  const event = {
    action: 'created',
    installation: { id: 123 },
    repository: { full_name: 'pony-factor/inkwell-SO' },
    issue: { number: 7, body: 'Issue descriptin' },
    comment: { id: 40, user: { id: 9, type: 'User' }, body: '/spellcheck\nPleese fix.' }
  };
  const store = { get: () => ({ githubReplyMode: 'diff' }) };
  const provider = async ({ text }) => text.replace('Pleese', 'Please');
  const getToken = async (id, repo) => {
    assert.equal(id, 123);
    assert.equal(repo, 'inkwell-SO');
    return 'test-token';
  };
  const deps = { store, provider, fetchImpl, getToken };
  assert.equal(await processGitHubEvent('issue_comment', event, deps), true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /issues\/7\/comments$/);
  assert.match(JSON.parse(calls[0].options.body).body, /-Pleese fix\./);
  event.comment.user.type = 'Bot';
  assert.equal(await processGitHubEvent('issue_comment', event, deps), false);
  assert.equal(calls.length, 1);
});
