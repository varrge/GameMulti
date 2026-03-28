const { ForumSsoService } = require('../examples/forum_sso_service');
const { DiscourseForumAdapter } = require('../adapters/discourse_forum_adapter');

function buildConfigFromEnv() {
  return {
    baseUrl: process.env.FORUM_SSO_BASE_URL,
    consumePath: process.env.FORUM_SSO_CONSUME_PATH,
  };
}

function main() {
  const adapter = new DiscourseForumAdapter(buildConfigFromEnv());
  const service = new ForumSsoService({ adapter });
  service.seed();

  const entry = service.issueForumEntry({
    userId: 'user_1',
    forumProvider: process.env.FORUM_SSO_PROVIDER || 'discourse',
    redirectUrl: process.env.FORUM_SSO_LOGIN_REDIRECT_URL || 'https://forum.example.com/',
    requestIp: '127.0.0.1',
    requestUserAgent: 'forum-sso-verify-script/1.0',
  });

  const consumed = service.consumeTicket(entry.ticket);
  const syncResults = service.processPendingSyncJobs();

  console.log(JSON.stringify({
    provider: process.env.FORUM_SSO_PROVIDER || 'discourse',
    entry,
    consumed,
    syncResults,
    forumAccounts: service.forumAccounts,
    forumSyncJobs: service.forumSyncJobs,
  }, null, 2));
}

main();
