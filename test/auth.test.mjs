import test from 'node:test';
import assert from 'node:assert/strict';
import { matchOAuthState, newOAuthState, parseCookies, signedSession, verifySession } from '../src/auth.mjs';

test('session is signed and expires', () => {
  const secret = 'a'.repeat(64);
  const token = signedSession({ id: 42, login: 'pony' }, secret);
  assert.deepEqual(verifySession(token, secret), { id: 42, login: 'pony' });
  assert.equal(verifySession(token + 'a', secret), null);
  assert.equal(verifySession(token, 'b'.repeat(64)), null);
  assert.equal(verifySession(signedSession({ id: 42, login: 'pony' }, secret, -1), secret), null);
});

test('OAuth state comparison prevents mismatches', () => {
  const state = newOAuthState();
  assert.equal(matchOAuthState(state, state), true);
  assert.equal(matchOAuthState(state, newOAuthState()), false);
  assert.equal(matchOAuthState(state, undefined), false);
});

test('cookie parsing includes first equals sign only', () => {
  assert.deepEqual(parseCookies('a=abc; session=payload.signature; x=hello%3Dworld'),
    { a: 'abc', session: 'payload.signature', x: 'hello%3Dworld' });
});
