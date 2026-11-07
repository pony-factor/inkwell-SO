# Run Inkwell SO locally with Ollama

The existing web UI and GitHub integration use the same spellchecking core. Set
`MODEL_PROVIDER=ollama` to use a model running on this computer instead of
sending text to OpenAI. The default provider remains `openai` for backwards
compatibility.

1. Install [Ollama](https://ollama.com/) and start its local service.
2. Download the base model with `ollama pull qwen3:4b`.
3. Create the first version of **Inkwell** with `ollama create inkwell:0.1.0 -f models/Modelfile` (run from the repository root).
4. In this repository run:

```sh
export LOCAL_DEV_MODE=1
export MODEL_PROVIDER=ollama
export OLLAMA_MODEL=inkwell:0.1.0
npm start
```

5. Open http://127.0.0.1:3000 and check a paragraph.

Ollama listens on http://127.0.0.1:11434 by default. Set `OLLAMA_URL` if
your local instance uses a different port. For privacy, Inkwell deliberately
only accepts HTTP loopback addresses, not remote Ollama endpoints. No API
key is required for the local model. `OLLAMA_TIMEOUT_MS` defaults to 30000
and can be increased for cold starts; the model is kept in memory for 15
minutes after each request.

The displayed model name is **Inkwell 0.1.0**; its Ollama tag is
`inkwell:0.1.0`. The initial Modelfile creates a *prompt-configured Qwen3
model*, not a fine-tuned one. Future trained releases should use distinct
versioned tags, such as `inkwell:0.2.0`, rather than overwrite the first
version.

The local integration disables model thinking and streaming for a predictable
single corrected-text response. This is *not* a trained spellchecking model
yet: its spelling behavior still depends on the base model and the existing
strict prompt. Benchmarking and fine-tuning can follow after collecting
approved before/after examples.

When enabling GitHub webhooks on a publicly deployed server, remember that
`127.0.0.1` means *the server host*, not your own laptop.
