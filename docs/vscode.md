# VS Code local spellchecking

Inkwell SO includes a VS Code extension in the **repository root**. It
reuses the same spelling and formatting safeguards as the existing web app,
but calls your local Ollama instance directly. No Inkwell HTTP server or
OpenAI API key is required.

1. Install Ollama, run `ollama pull qwen3:4b`, then from the repository root run
   `ollama create inkwell:0.1.0 -f models/Modelfile` to register **Inkwell 0.1.0**.
2. Open this repository in VS Code and press **F5** to open an Extension
   Development Host, or run **Extensions: Install from VSIX** after packaging.
3. Select text in the editor, then invoke **Inkwell SO: Spellcheck Selection**
   from the Command Palette or use **Cmd+Option+Shift+S** on macOS
   (**Ctrl+Alt+Shift+S** elsewhere).
4. The default model is **Inkwell 0.1.0** (`inkwell:0.1.0`). Set
   `inkwell.ollama.model` to a different versioned Inkwell tag when you
   train a newer model. Your selections stay on the local machine.

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
