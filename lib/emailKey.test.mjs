// Tests for lib/emailKey.ts (how a team photo finds its one person). Run: npm test (in client/).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emailKey } from './emailKey.ts';

test('a photo key belongs to one email: the same however it is typed, different for anyone else', () => {
  assert.equal(emailKey('riya.sharma@example.com'), emailKey('  Riya.Sharma@Example.COM '));
  assert.match(emailKey('riya.sharma@example.com'), /^[0-9a-z]{6,11}$/);
  // Two people with the same first name never share a key.
  const keys = ['riya.sharma@example.com', 'riya.t@example.com', 'riya@example.com', 'riya.sharma@example.in'].map(emailKey);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(emailKey('riya.sharma@example.com'), emailKey('riya.sharma@example.com'), 'always the same key');
});
