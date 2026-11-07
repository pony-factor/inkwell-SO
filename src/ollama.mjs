import { openAIComplete } from './core.mjs';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function ollamaEndpoint(value = 'http://127.0.0.1:11434') {
  let url;
  try { url = new URL(value); }
  catch { throw new TypeError('OLLAMA_URL must be a valid local URL'); }
  if (url.protocol !== 'http:' || !LOCAL_HOSTS.has(url.hostname) ||
      url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new TypeError('OLLAMA_URL must be an HTTP loopback origin without credentials or a path');
  }
  return new URL('/api/chat', url).href;
}

export function makeOllamaComplete({ env = process.env, fetchImpl = fetch } = {}) {
  const endpoint = ollamaEndpoint(env.OLLAMA_URL || 'http://127.0.0.1:11434');
  const model = env.OLLAMA_MODEL || 'qwen3:4b';
  if (typeof model !== 'string' || !model.trim()) throw new TypeError('OLLAMA_MODEL is required');
  const timeoutMs = Number(env.OLLAMA_TIMEOUT_MS || 30_000);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    throw new TypeError('OLLAMA_TIMEOUT_MS must be between 1000 and 120000');
  }
  return async ({ instructions, text }) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          keep_alive: '15m',
          options: { temperature: 0 },
          messages: [
            { role: 'system', content: instructions },
            { role: 'user', content: text }
          ]
        })
      });
      if (!response.ok) throw new Error('Ollama request failed (HTTP ' + response.status + ')');
      const result = await response.json();
      if (typeof result?.message?.content !== 'string') throw new Error('Ollama returned no text');
      return result.message.content;
    } finally {
      clearTimeout(timeout);
    }
  };
}

export function selectCompletionProvider(env = process.env) {
  switch (env.MODEL_PROVIDER || 'openai') {
    case 'openai': return openAIComplete;
    case 'ollama': return makeOllamaComplete({ env });
    default: throw new TypeError('MODEL_PROVIDER must be openai or ollama');
  }
}
