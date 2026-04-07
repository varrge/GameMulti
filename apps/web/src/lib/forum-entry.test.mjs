import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_FORUM_ORIGIN = 'https://bbs.gamemulti.example';
process.env.NEXT_PUBLIC_FORUM_ENTRY_PATH = '/latest';

const { getDefaultPostLoginRedirect, getNavbarForumHref, getForumEntryUrl } = await import('./forum-entry.ts');

test('navbar forum entry points to configured forum url', () => {
  assert.equal(getNavbarForumHref(), 'https://bbs.gamemulti.example/latest');
});

test('default post-login redirect points to configured forum url', () => {
  assert.equal(getDefaultPostLoginRedirect(), 'https://bbs.gamemulti.example/latest');
});

test('forum entry url is assembled from origin and path', () => {
  assert.equal(getForumEntryUrl(), 'https://bbs.gamemulti.example/latest');
});
