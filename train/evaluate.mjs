import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spellcheckText } from '../src/core.mjs';
import { makeOllamaComplete } from '../src/ollama.mjs';

// Evaluate without logging users' source text, which may be private.
export async function evaluate(records, complete) {
  if (!Array.isArray(records)) throw new TypeError('Expected MLX chat records');
  let exact = 0, rejected = 0, unnecessary = 0, unchanged = 0;
  for (const record of records) {
    const messages = record.messages || [];
    if (messages.length !== 3 || messages[1].role !== 'user' || messages[2].role !== 'assistant') {
      throw new TypeError('Invalid chat record');
    }
    const input = messages[1].content, expected = messages[2].content;
    const result = await spellcheckText(input, {}, complete);
    if (result.corrected === expected) exact++;
    if (result.rejected) rejected++;
    if (input === expected) {
      unchanged++;
      if (result.corrected !== input) unnecessary++;
    }
  }
  return { samples: records.length, exact, exactRate: records.length ? exact / records.length : 0,
    rejected, alreadyCorrect: unchanged, unwantedChanges: unnecessary };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: node train/evaluate.mjs train/data/test.jsonl');
    process.exitCode = 2;
  } else {
    try {
      const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean);
      const records = lines.map((line) => JSON.parse(line));
      console.log(JSON.stringify(await evaluate(records, makeOllamaComplete()), null, 2));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
