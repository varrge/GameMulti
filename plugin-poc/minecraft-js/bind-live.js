const { MinecraftPluginPoCService } = require('./src/plugin_service');

async function main() {
  const plugin = new MinecraftPluginPoCService({
    apiBaseUrl: process.env.GM_API_BASE_URL || 'http://127.0.0.1:8080',
    serverCode: process.env.GM_SERVER_CODE || 'cn-mc-01',
    pluginClientKey: process.env.GM_PLUGIN_CLIENT_KEY || 'demo-client',
    pluginClientSecret: process.env.GM_PLUGIN_CLIENT_SECRET || 'demo-secret',
  });

  const result = await plugin.requestBindingSession({
    playerUuid: process.env.GM_PLAYER_UUID || `poc-player-${Date.now()}`,
    displayName: process.env.GM_PLAYER_NAME || 'Steve',
  });

  console.log(JSON.stringify({
    endpoint: result.endpoint,
    pairCode: result.response.pairCode,
    bindUrl: `${plugin.apiBaseUrl}${result.response.bindUrl}`,
    playerMessage: result.playerMessage,
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
