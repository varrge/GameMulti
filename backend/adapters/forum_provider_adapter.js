/**
 * ForumProviderAdapter contract.
 *
 * Concrete implementations (Discourse / Flarum / NodeBB / custom) should expose the same shape
 * so the main site keeps a stable SSO orchestration flow while only the adapter changes.
 */
class ForumProviderAdapter {
  constructor(config = {}) {
    this.config = config;
  }

  get providerName() {
    return this.config.provider || 'unknown';
  }

  findUserByExternalUid(_externalUid) {
    throw new Error('findUserByExternalUid must be implemented by the concrete adapter');
  }

  findUserByEmail(_email) {
    throw new Error('findUserByEmail must be implemented by the concrete adapter');
  }

  createUser(_payload) {
    throw new Error('createUser must be implemented by the concrete adapter');
  }

  syncProfile(_payload) {
    throw new Error('syncProfile must be implemented by the concrete adapter');
  }

  syncBanState(_payload) {
    throw new Error('syncBanState must be implemented by the concrete adapter');
  }

  buildConsumeUrl(_ticket, _redirectUrl) {
    throw new Error('buildConsumeUrl must be implemented by the concrete adapter');
  }
}

module.exports = { ForumProviderAdapter };
