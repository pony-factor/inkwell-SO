import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePairs, splitPairs, toChatRecords } from '../train/prepare.mjs';
import { evaluate } from '../train/evaluate.mjs';

const sample = readFileSync(new URL('../train/examples.sample.jsonl', import.meta.url), 'utf8');

test('preparation splits pairs deterministically without leakage', () => {
  const rows = parsePairs(sample);
  assert.equal(rows.length, 12);
  const first = splitPairs(rows);
  const second = splitPairs(rows);
  assert.deepEqual(first, second);
  assert.equal(first.train.length + first.valid.length + first.test.length, 12);
  const inputs = Object.values(first).flat().map((row) => row.input);
  assert.equal(new Set(inputs).size, 12);
  const chat = toChatRecords(first.train);
  assert.equal(chat[0].messages[2].role, 'assistant');
  assert.match(chat[0].messages[0].content, /minimal-edit spellchecker/);
});

test('preparation rejects duplicate, invalid and destructive examples', () => {
  assert.throws(() => parsePairs('{"input":"x","output":"y"}\n{"input":"x","output":"z"}'), /Duplicate/);
  assert.throws(() => parsePairs('{"input":"x","output":"x\\ny"}'), /Line count/);
  assert.throws(() => parsePairs('{"input":1,"output":"x"}'), /Invalid/);
  assert.throws(() => splitPairs([]), /At least 10/);
});

test('evaluation counts exact matches and unwanted edits without printing text', async () => {
  const rows = toChatRecords([
    { input: 'Pleese', output: 'Please' },
    { input: 'Already correct.', output: 'Already correct.' }
  ]);
  const result = await evaluate(rows, async ({ text }) =>
    text === 'Pleese' ? 'Please' : 'Changed unnecessarily.');
  assert.equal(result.samples, 2);
  assert.equal(result.exact, 1);
  assert.equal(result.unwantedChanges, 1);
  assert.equal(result.alreadyCorrect, 1);
});
