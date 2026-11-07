import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInstructions, MAX_INPUT_LENGTH } from '../src/core.mjs';

export function parsePairs(jsonl) {
  if (typeof jsonl !== 'string') throw new TypeError('Expected JSONL text');
  const seen = new Set();
  const rows = [];
  for (const [index, line] of jsonl.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let pair;
    try { pair = JSON.parse(line); }
    catch { throw new TypeError('Invalid JSON on line ' + (index + 1)); }
    if (!pair || typeof pair.input !== 'string' || typeof pair.output !== 'string' ||
        !pair.input.trim() || !pair.output.trim() ||
        pair.input.length > MAX_INPUT_LENGTH || pair.output.length > MAX_INPUT_LENGTH) {
      throw new TypeError('Invalid input/output pair on line ' + (index + 1));
    }
    if (seen.has(pair.input)) throw new TypeError('Duplicate input on line ' + (index + 1));
    if (pair.input.split('\n').length !== pair.output.split('\n').length) {
      throw new TypeError('Line count changed on line ' + (index + 1));
    }
    seen.add(pair.input);
    rows.push({ input: pair.input, output: pair.output });
  }
  return rows;
}

export function splitPairs(rows, seed = 42) {
  if (!Array.isArray(rows) || rows.length < 10) {
    throw new TypeError('At least 10 reviewed pairs are needed for train/valid/test splits');
  }
  if (!Number.isSafeInteger(seed)) throw new TypeError('Seed must be an integer');
  const shuffled = [...rows];
  let state = seed >>> 0;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 2 ** 32;
  };
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const holdout = Math.max(1, Math.round(shuffled.length / 10));
  return {
    train: shuffled.slice(2 * holdout),
    valid: shuffled.slice(holdout, 2 * holdout),
    test: shuffled.slice(0, holdout)
  };
}

export function toChatRecords(rows) {
  const instructions = buildInstructions();
  return rows.map(({ input, output }) => ({
    messages: [
      { role: 'system', content: instructions },
      { role: 'user', content: input },
      { role: 'assistant', content: output }
    ]
  }));
}

export function prepareDataset(inputPath, outputDir) {
  const rows = parsePairs(readFileSync(inputPath, 'utf8'));
  const splits = splitPairs(rows);
  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  const counts = {};
  for (const [name, subset] of Object.entries(splits)) {
    const content = toChatRecords(subset).map((row) => JSON.stringify(row)).join('\n') + '\n';
    writeFileSync(resolve(outputDir, name + '.jsonl'), content, { mode: 0o600 });
    counts[name] = subset.length;
  }
  return counts;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [inputPath, outputDir] = process.argv.slice(2);
  if (!inputPath || !outputDir) {
    console.error('Usage: node train/prepare.mjs INPUT_PAIRS.jsonl OUTPUT_DIRECTORY');
    process.exitCode = 2;
  } else {
    try { console.log('Prepared dataset:', prepareDataset(inputPath, outputDir)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
