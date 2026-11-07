// The extension runs on the UI extension host, so localhost targets the user's
// local Ollama service even when editing through a remote VS Code workspace.
async function runSpellcheck(vscode, editor, dependencies = {}) {
  if (!editor || editor.selection.isEmpty) {
    vscode.window.showInformationMessage('Inkwell SO: Select prose to spellcheck.');
    return;
  }
  const document = editor.document;
  const selection = editor.selection;
  const original = document.getText(selection);
  const version = document.version;
  const config = vscode.workspace.getConfiguration('inkwell');
  const preferences = {
    dialect: config.get('spellcheck.dialect', 'preserve'),
    sensitivity: config.get('spellcheck.sensitivity', 'conservative'),
    customWords: config.get('spellcheck.customWords', [])
  };
  const env = {
    OLLAMA_URL: config.get('ollama.url', 'http://127.0.0.1:11434'),
    OLLAMA_MODEL: config.get('ollama.model', 'inkwell:0.1.0'),
    OLLAMA_TIMEOUT_MS: String(config.get('ollama.timeoutMs', 30_000))
  };
  try {
    const spellcheckText = dependencies.spellcheckText ||
      (await import('../src/core.mjs')).spellcheckText;
    const makeOllamaComplete = dependencies.makeOllamaComplete ||
      (await import('../src/ollama.mjs')).makeOllamaComplete;
    const complete = makeOllamaComplete({ env });
    const result = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Window,
      title: 'Inkwell SO: Checking selected text'
    }, () => spellcheckText(original, preferences, complete));

    // Never write over edits made during a slow model response.
    if (document.version !== version || editor.document !== document ||
        document.getText(selection) !== original) {
      vscode.window.showWarningMessage('Inkwell SO: Document changed; no correction applied.');
      return;
    }
    if (result.rejected) {
      vscode.window.showWarningMessage('Inkwell SO: Unsafe formatting change rejected.');
      return;
    }
    if (!result.changed) {
      vscode.window.setStatusBarMessage('Inkwell SO: No clear spelling errors.', 2500);
      return;
    }
    const updated = await editor.edit((edit) => edit.replace(selection, result.corrected), {
      undoStopBefore: true,
      undoStopAfter: true
    });
    if (!updated) vscode.window.showWarningMessage('Inkwell SO: Could not apply the correction.');
  } catch (error) {
    vscode.window.showErrorMessage('Inkwell SO: ' + error.message + '. Check that Ollama is running and the model is installed.');
  }
}

function activate(context) {
  const vscode = require('vscode');
  const command = vscode.commands.registerTextEditorCommand(
    'inkwell.spellcheckSelection', (editor) => runSpellcheck(vscode, editor)
  );
  context.subscriptions.push(command);
}
function deactivate() {}

module.exports = { activate, deactivate, runSpellcheck };
