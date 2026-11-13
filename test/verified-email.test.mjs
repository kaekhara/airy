import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './load-ts.mjs';

const { hasVerifiedEmail } = loadTsModule('../lib/verified-email.ts');

test('AI authorization requires an explicit verified email claim', () => {
  assert.equal(hasVerifiedEmail({ email_verified: true }), true);
  assert.equal(hasVerifiedEmail({ email_verified: false }), false);
  assert.equal(hasVerifiedEmail({}), false);
  assert.equal(hasVerifiedEmail(null), false);
  assert.equal(hasVerifiedEmail(undefined), false);
});
