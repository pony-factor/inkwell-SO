import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { runSpellcheck } = require('../vscode/extension.cjs');

function setup(text = 'Pleese reveiw this.') {
  const messages = [];
  const document = { text, version: 1, getText: () => document.text };
  const editor = {
    document,
    selection: { isEmpty: false },
    edit: async (callback, options) => {
      assert.deepEqual(options, { undoStopBefore: true, undoStopAfter: true });
      callback({ replace: (_selection, corrected) => { document.text = corrected; document.version++; } });
      return true;
    }
  };
  const vscode = {
    ProgressLocation: { Window: 10 },
    workspace: { getConfiguration: () => ({ get: (key, fallback) => key === 'ollama.model' ? 'custom-spelling' : fallback }) },
    window: {
      withProgress: (_options, callback) => callback(),
      showInformationMessage: (message) => messages.push(message),
      showWarningMessage: (message) => messages.push(message),
      showErrorMessage: (message) => messages.push(message),
      setStatusBarMessage: (message) => messages.push(message)
    }
  };
  return { editor, vscode, document, messages };
}

test('editor command applies selected correction as one undoable edit', async () => {
  const { editor, vscode, document, messages } = setup();
  let model;
  await runSpellcheck(vscode, editor, {
    makeOllamaComplete: ({ env }) => { model = env.OLLAMA_MODEL; return async () => 'Please review this.'; },
    spellcheckText: async (_input, _prefs, complete) => ({
      corrected: await complete(), changed: true, rejected: false
    })
  });
  assert.equal(model, 'custom-spelling');
  assert.equal(document.text, 'Please review this.');
  assert.deepEqual(messages, []);
});

test('editor command never overwrites an intervening document edit', async () => {
  const { editor, vscode, document, messages } = setup();
  await runSpellcheck(vscode, editor, {
    makeOllamaComplete: () => async () => '',
    spellcheckText: async () => {
      document.text = 'User edited this.';
      document.version++;
      return { corrected: 'Please review this.', changed: true, rejected: false };
    }
  });
  assert.equal(document.text, 'User edited this.');
  assert.match(messages[0], /Document changed/);
});

test('editor command leaves unchanged or rejected text alone', async () => {
  const { editor, vscode, document, messages } = setup();
  await runSpellcheck(vscode, editor, {
    makeOllamaComplete: () => async () => '',
    spellcheckText: async () => ({ corrected: 'anything', changed: false, rejected: true })
  });
  assert.equal(document.text, 'Pleese reveiw this.');
  assert.match(messages[0], /Unsafe formatting/);
  editor.selection.isEmpty = true;
  await runSpellcheck(vscode, editor);
  assert.match(messages[1], /Select prose/);
});
