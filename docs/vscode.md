# VS Code local spellchecking

Inkwell SO includes a VS Code extension in the **repository root**. It
reuses the same spelling and formatting safeguards as the existing web app,
but calls your local Ollama instance directly. No Inkwell HTTP server or
OpenAI API key is required.

1. Install Ollama and run `ollama pull qwen3:4b`.
2. Open this repository in VS Code and press **F5** to open an Extension
   Development Host, or run **Extensions: Install from VSIX** after packaging.
3. Select text in the editor, then invoke **Inkwell SO: Spellcheck Selection**
   from the Command Palette or use **Cmd+Option+Shift+S** on macOS
   (**Ctrl+Alt+Shift+S** elsewhere).
4. Set `inkwell.ollama.model` to your Ollama model, including any later
   custom fine-tune. Your selections stay on the local machine.

To package from a checkout, run `npx @vscode/vsce package --no-dependencies`
(the packaging tool may need to be installed). The extension source is
`vscode/extension.cjs`; the root `package.json` is also the extension
manifest. The extension uses VS Code's UI extension host so localhost
normally refers to your own computer.

Only explicitly selected text is changed. The replacement is a single
undoable edit. If the document changes while the model is responding,
the result is discarded. Protected code, URLs, Markdown layout, and
custom words use the same safeguards as the web application.

Preferences available in VS Code settings: `inkwell.ollama.url`,
`inkwell.ollama.model`, `inkwell.ollama.timeoutMs`,
`inkwell.spellcheck.dialect`, `inkwell.spellcheck.sensitivity`,
and `inkwell.spellcheck.customWords`.

An active Ollama installation and the named downloaded model are required.
No claim is made that a custom spellchecking model has already been trained.
