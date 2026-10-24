import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PREFERENCES, normalizePreferences, maskProtectedText,
  buildInstructions, spellcheckText, MAX_INPUT_LENGTH
} from '../src/core.mjs';

test('defaults and per-user preferences are normalized', () => {
  assert.deepEqual(normalizePreferences(), DEFAULT_PREFERENCES);
  const prefs = normalizePreferences({ dialect: 'en-GB', customWords: ['Sweetiebot', 'Sweetiebot'] });
  assert.deepEqual(prefs.customWords, ['Sweetiebot']);
  assert.match(buildInstructions(prefs), /en-GB/);
  assert.throws(() => normalizePreferences({ dialect: 'invalid' }), /dialect/);
  assert.throws(() => normalizePreferences({ customWords: Array(101).fill('word') }), /customWords/);
  assert.throws(() => normalizePreferences({ extraInstructions: 'x'.repeat(1501) }), /extraInstructions/);
});

test('protects code, links, references and custom words', () => {
  const input = 'Pleese check `mispelled`, https://example.org/mispelled, @pony-bot and Sweetiebot.';
  const guard = maskProtectedText(input, { customWords: ['Sweetiebot'] });
  assert.ok(!guard.masked.includes('example.org'));
  assert.ok(!guard.masked.includes('Sweetiebot'));
  const output = guard.restore(guard.masked.replace('Pleese', 'Please'));
  assert.equal(output, 'Please check `mispelled`, https://example.org/mispelled, @pony-bot and Sweetiebot.');
});

test('rejects removed, altered or reordered protected markers', () => {
  const { masked, restore } = maskProtectedText('See `one` and `two`.');
  assert.equal(restore(masked.replace('ZINKWELLTOKEN00000Z', 'lost')), null);
  assert.equal(restore(masked.replace('00000', '00099')), null);
  assert.equal(restore(masked.replace('00000', 'XXXXX')), null);
});

test('spellchecks ordinary prose and preserves newline boundaries', async () => {
  const result = await spellcheckText('Pleese reveiw this.\n- Adn this.', {}, async ({text}) =>
    text.replace('Pleese', 'Please').replace('reveiw', 'review').replace('Adn', 'And'));
  assert.equal(result.corrected, 'Please review this.\n- And this.');
  assert.equal(result.changed, true);
});

test('fails closed when a model changes list markup', async () => {
  const result = await spellcheckText('- Pleese see.', {}, async () => 'Please see.');
  assert.equal(result.corrected, '- Pleese see.');
  assert.equal(result.rejected, true);
});

test('enforces length and leaves blank text unchanged', async () => {
  assert.equal((await spellcheckText('  ', {}, async () => { throw Error('unexpected'); })).changed, false);
  await assert.rejects(() => spellcheckText('x'.repeat(MAX_INPUT_LENGTH + 1), {}, async () => ''), /at most/);
});
