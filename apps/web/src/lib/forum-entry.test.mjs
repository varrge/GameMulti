import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultPostLoginRedirect, getNavbarForumHref } from './forum-entry.ts';

test('navbar forum entry points to /forums', () => {
  assert.equal(getNavbarForumHref(), '/forums');
});

test('default post-login redirect points to /forums', () => {
  assert.equal(getDefaultPostLoginRedirect(), '/forums');
});
