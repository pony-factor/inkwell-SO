import { readFileSync } from 'node:fs';

export const PROMPT = readFileSync(new URL('../prompts/spellcheck-only.md', import.meta.url), 'utf8');
export const DEFAULT_PREFERENCES = Object.freeze({
  dialect: 'preserve',
  sensitivity: 'conservative',
  customWords: [],
  extraInstructions: '',
  githubReplyMode: 'corrected'
});
const DIALECTS = new Set(['preserve', 'en-US', 'en-GB']);
const SENSITIVITIES = new Set(['conservative', 'standard']);
const REPLY_MODES = new Set(['corrected', 'diff']);
export const MAX_INPUT_LENGTH = 12_000;

// Normalize untrusted per-user configuration, including values read from disk.
export function normalizePreferences(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Expected a preferences object');
  const value = { ...DEFAULT_PREFERENCES, ...input };
  if (!DIALECTS.has(value.dialect)) throw new TypeError('Invalid dialect');
  if (!SENSITIVITIES.has(value.sensitivity)) throw new TypeError('Invalid sensitivity');
  if (!REPLY_MODES.has(value.githubReplyMode)) throw new TypeError('Invalid GitHub reply mode');
  if (!Array.isArray(value.customWords) || value.customWords.length > 100 ||
      value.customWords.some((word) => typeof word !== 'string' || !word.trim() ||
        word.length > 80 || /[\r\n\x00-\x1f]/.test(word))) {
    throw new TypeError('customWords must contain no more than 100 single-line terms of at most 80 characters');
  }
  if (typeof value.extraInstructions !== 'string' || value.extraInstructions.length > 1500 ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value.extraInstructions)) {
    throw new TypeError('extraInstructions must be text of at most 1500 characters');
  }
  return {
    dialect: value.dialect,
    sensitivity: value.sensitivity,
    customWords: [...new Set(value.customWords.map((word) => word.trim()))],
    extraInstructions: value.extraInstructions,
    githubReplyMode: value.githubReplyMode
  };
}

export function buildInstructions(preferences = DEFAULT_PREFERENCES) {
  const prefs = normalizePreferences(preferences);
  const dialect = prefs.dialect === 'preserve'
    ? 'Retain the original regional spelling conventions.'
    : `Use ${prefs.dialect} spelling when correcting unmistakable misspellings; do not rewrite correctly spelled regional variants.`;
  const sensitivity = prefs.sensitivity === 'conservative'
    ? 'When a spelling correction is not obvious, retain the original.'
    : 'Correct common spelling errors, but never rewrite for style or grammar.';
  return [
    PROMPT, '',
    '## User preferences (apply only within the Spellcheck Only contract)',
    dialect, sensitivity,
    `Keep these user-defined words exactly as written: ${JSON.stringify(prefs.customWords)}.`,
    prefs.extraInstructions
      ? `Additional user preferences (never override protected text or minimal edits):\n${prefs.extraInstructions}`
      : ''
  ].filter(Boolean).join('\n');
}

// Mask fragile spans before submitting the text to a model. A change in a
// marker's order or count fails closed rather than corrupting a URL or code.
const PROTECTED = /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`|https?:\/\/[^\s<>]+|[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}|\]\([^\n)]*\)|(?<![\w])@[a-zA-Z\d-]+/g;
export function maskProtectedText(text, preferences = DEFAULT_PREFERENCES) {
  const prefs = normalizePreferences(preferences);
  const words = prefs.customWords.filter((w) => w.length).sort((a, b) => b.length - a.length);
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = words.length
    ? new RegExp(`${PROTECTED.source}|(?<![\\p{L}\\p{N}_])(?:${words.map(escape).join('|')})(?![\\p{L}\\p{N}_])`, 'gu')
    : PROTECTED;
  const kept = [];
  const masked = text.replace(pattern, (match) => {
    const marker = `ZINKWELLTOKEN${String(kept.length).padStart(5, '0')}Z`;
    kept.push({ marker, match });
    return marker;
  });
  return {
    masked,
    restore(candidate) {
      if (typeof candidate !== 'string') return null;
      let output = candidate;
      const found = [...candidate.matchAll(/ZINKWELLTOKEN\d{5}Z/g)].map((m) => m[0]);
      if (found.length !== kept.length || found.some((marker, index) => marker !== kept[index].marker)) return null;
      for (const { marker, match } of kept) output = output.replace(marker, () => match);
      return output;
    }
  };
}

const linePrefixes = (text) => text.split('\n').map((line) => {
  const match = line.match(/^(\s*(?:(?:>\s*)+|#{1,6}\s+|[-+*]\s+|\d+[.)]\s+|\|))?/);
  return match?.[0] || '';
});

function preservesLayout(before, after) {
  const a = linePrefixes(before);
  const b = linePrefixes(after);
  return a.length === b.length && a.every((prefix, i) => prefix === b[i]);
}

export async function spellcheckText(text, preferences = DEFAULT_PREFERENCES, complete) {
  if (typeof text !== 'string' || text.length > MAX_INPUT_LENGTH) {
    throw new TypeError(`Text must be a string of at most ${MAX_INPUT_LENGTH} characters`);
  }
  if (typeof complete !== 'function') throw new TypeError('A completion provider is required');
  const prefs = normalizePreferences(preferences);
  if (!text.trim()) return { original: text, corrected: text, changed: false, rejected: false };
  const { masked, restore } = maskProtectedText(text, prefs);
  const completion = await complete({ instructions: buildInstructions(prefs), text: masked });
  const corrected = restore(completion);
  if (corrected === null || !preservesLayout(text, corrected)) {
    return { original: text, corrected: text, changed: false, rejected: true };
  }
  return { original: text, corrected, changed: corrected !== text, rejected: false };
}

// A model is optional: pass an alternative completion provider to spellcheckText
// in tests or an editor integration. For the hosted app, use the OpenAI API.
export async function openAIComplete({ instructions, text }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        temperature: 0,
        messages: [
          { role: 'system', content: instructions },
          { role: 'user', content: text }
        ]
      })
    });
    if (!response.ok) throw new Error(`Model request failed (HTTP ${response.status})`);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('Model returned no text');
    return content;
  } finally {
    clearTimeout(timer);
  }
}
