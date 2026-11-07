import test from 'node:test';
import assert from 'node:assert/strict';
import { makeOllamaComplete, ollamaEndpoint, selectCompletionProvider } from '../src/ollama.mjs';
import { spellcheckText } from '../src/core.mjs';

test('Ollama requests local non-streaming, non-thinking chat completions', async () => {
  let call;
  const complete = makeOllamaComplete({
    env: { OLLAMA_MODEL: 'qwen3:4b', OLLAMA_URL: 'http://localhost:11434', OLLAMA_TIMEOUT_MS: '1000' },
    fetchImpl: async (url, options) => {
      call = { url, options };
      return { ok: true, json: async () => ({ message: { content: 'Please review this.' } }) };
    }
  });
  const result = await spellcheckText('Pleese reveiw this.', {}, complete);
  assert.equal(result.corrected, 'Please review this.');
  assert.equal(call.url, 'http://localhost:11434/api/chat');
  const body = JSON.parse(call.options.body);
  assert.equal(body.model, 'qwen3:4b');
  assert.equal(body.stream, false);
  assert.equal(body.think, false);
  assert.equal(body.options.temperature, 0);
  assert.equal(body.keep_alive, '15m');
  assert.match(body.messages[0].content, /minimal-edit spellchecker/);
  assert.equal(body.messages[1].content, 'Pleese reveiw this.');
});

test('Ollama provider rejects remote and credential-bearing URLs', () => {
  assert.equal(ollamaEndpoint(), 'http://127.0.0.1:11434/api/chat');
  for (const value of ['https://localhost:11434', 'http://example.com:11434',
    'http://127.0.0.1:11434/private', 'http://user:pass@localhost:11434']) {
    assert.throws(() => ollamaEndpoint(value), /loopback/);
  }
  assert.throws(() => makeOllamaComplete({ env: { OLLAMA_TIMEOUT_MS: '-1' } }), /TIMEOUT/);
  assert.throws(() => selectCompletionProvider({ MODEL_PROVIDER: 'not-valid' }), /MODEL_PROVIDER/);
  assert.equal(typeof selectCompletionProvider({ MODEL_PROVIDER: 'openai' }), 'function');
});

test('Ollama failures do not silently return invented corrected text', async () => {
  const failed = makeOllamaComplete({ fetchImpl: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(() => failed({ instructions: 'x', text: 'y' }), /HTTP 503/);
  const empty = makeOllamaComplete({ fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });
  await assert.rejects(() => empty({ instructions: 'x', text: 'y' }), /no text/);
});
