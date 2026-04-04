const { ForumProviderAdapter } = require('./forum_provider_adapter');

/**
 * Discourse-oriented adapter skeleton.
 *
 * This file intentionally stops short of issuing real HTTP requests so it can live in the repo as
 * a safe integration guide. Replace the TODO sections with your own request client / auth handling.
 */
class DiscourseForumAdapter extends ForumProviderAdapter {
  constructor(config = {}) {
    super({ provider: 'discourse', ...config });
  }

  findUserByExternalUid(externalUid) {
    return null;
  }

  findUserByEmail(email) {
    return null;
  }

  createUser({ externalUid, email, username, displayName }) {
    return {
      id: `discourse_${externalUid}`,
      externalUid,
      email,
      username,
      displayName,
      source: 'adapter_stub',
    };
  }

  syncProfile({ forumUserId, username, email, status }) {
    return {
      ok: true,
      action: 'sync_profile',
      forumUserId,
      username,
      email,
      status,
    };
  }

  syncBanState({ forumUserId, status }) {
    return {
      ok: true,
      action: 'sync_ban_state',
      forumUserId,
      status,
      suspended: status !== 'active',
    };
  }

  buildConsumeUrl(ticket, redirectUrl) {
    const baseUrl = this.config.baseUrl || 'https://forum.example.com';
    const consumePath = this.config.consumePath || '/session/sso_login';
    const url = new URL(consumePath, baseUrl);
    url.searchParams.set('ticket', ticket);
    if (redirectUrl) {
      url.searchParams.set('return_path', redirectUrl);
    }
    return url.toString();
  }
}

module.exports = { DiscourseForumAdapter };
