import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_OLLAMA_MODEL, makeOllamaComplete } from '../src/ollama.mjs';

const repoText = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('Inkwell model naming is consistent between server, editor and Modelfile', async () => {
  assert.equal(DEFAULT_OLLAMA_MODEL, 'inkwell:0.1.0');
  const manifest = JSON.parse(repoText('package.json'));
  assert.equal(manifest.contributes.configuration.properties['inkwell.ollama.model'].default,
    DEFAULT_OLLAMA_MODEL);
  assert.match(repoText('.env.example'), /^OLLAMA_MODEL=inkwell:0\.1\.0$/m);
  assert.match(repoText('vscode/extension.cjs'), /config\.get\('ollama\.model', 'inkwell:0\.1\.0'\)/);
  const modelfile = repoText('models/Modelfile');
  assert.match(modelfile, /^FROM qwen3:4b$/m);
  assert.match(modelfile, /^SYSTEM """You are Inkwell 0\.1\.0,/m);
  let requestedModel;
  const complete = makeOllamaComplete({
    env: {},
    fetchImpl: async (_url, request) => {
      requestedModel = JSON.parse(request.body).model;
      return { ok: true, json: async () => ({ message: { content: 'Please check.' } }) };
    }
  });
  assert.equal(await complete({ instructions: 'Only spelling', text: 'Pleese check.' }), 'Please check.');
  assert.equal(requestedModel, DEFAULT_OLLAMA_MODEL);
});
