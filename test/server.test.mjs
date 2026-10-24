import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { makeHandler } from '../src/server.mjs';

test('local interface persists preferences and uses them for spelling', async (t) => {
  let prefs = {};
  const store = {
    get: () => ({ githubReplyMode: 'corrected', ...prefs }),
    set: (_id, value) => { prefs = value; return prefs; }
  };
  const env = { HOST: '127.0.0.1', PORT: '3000', LOCAL_DEV_MODE: '1',
    APP_BASE_URL: 'http://127.0.0.1:3000' };
  let handler;
  const server = http.createServer((req, res) => handler(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  env.PORT = String(port);
  env.APP_BASE_URL = `http://127.0.0.1:${port}`;
  handler = makeHandler({
    env, store, provider: async ({ text }) => text.replace('Pleese', 'Please')
  });
  const request = (path, options = {}) => fetch(env.APP_BASE_URL + path, options);
  const me = await (await request('/api/me')).json();
  assert.equal(me.login, 'Local user');
  assert.equal(me.signedIn, true);

  const homepage = await request('/');
  assert.equal(homepage.status, 200);
  assert.match(await homepage.text(), /Inkwell SO/);

  const headers = { 'Content-Type': 'application/json', 'X-Inkwell-Request': '1',
    Origin: env.APP_BASE_URL };
  const body = { dialect: 'en-GB', sensitivity: 'conservative',
    customWords: ['Sweetiebot'], extraInstructions: '',
    githubReplyMode: 'diff' };
  const saved = await request('/api/preferences', {
    method: 'POST', headers, body: JSON.stringify(body)
  });
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).customWords, ['Sweetiebot']);

  const result = await request('/api/spellcheck', {
    method: 'POST', headers,
    body: JSON.stringify({ text: 'Pleese check `mispelled` for Sweetiebot.' })
  });
  assert.equal(result.status, 200);
  const spellcheck = await result.json();
  assert.equal(spellcheck.corrected, 'Please check `mispelled` for Sweetiebot.');
  assert.equal(spellcheck.changed, true);

  const csrf = await request('/api/preferences', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  assert.equal(csrf.status, 403);
});

test('public server cannot start without GitHub OAuth credentials', () => {
  assert.throws(() => makeHandler({ env: {
    HOST: '0.0.0.0', APP_BASE_URL: 'https://example.test', PORT: '3000'
  }}), /GitHub OAuth/);
  assert.throws(() => makeHandler({ env: {
    HOST: '0.0.0.0', LOCAL_DEV_MODE: '1'
  }}), /loopback/);
});
