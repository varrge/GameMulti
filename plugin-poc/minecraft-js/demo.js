const { MinecraftPluginPoCService } = require('./src/plugin_service');

function main() {
  const plugin = new MinecraftPluginPoCService({
    apiBaseUrl: 'https://gamemulti.local',
    serverId: 'mc-poc-01',
    serverCode: 'cn-mc-01',
    pluginClientKey: 'demo-client',
  });

  const bind = plugin.createBindingCommand({
    playerUuid: '550e8400-e29b-41d4-a716-446655440000',
    displayName: 'Steve',
  });
  console.log('bind =>', bind);

  const joinEvent = plugin.recordPlayerJoin({
    playerUuid: '550e8400-e29b-41d4-a716-446655440000',
    displayName: 'Steve',
  });
  console.log('joinEvent =>', joinEvent);

  const durationEvent = plugin.recordDurationTick({
    playerUuid: '550e8400-e29b-41d4-a716-446655440000',
    durationMinutes: 10,
  });
  console.log('durationEvent =>', durationEvent);

  const heartbeat = plugin.reportStatus();
  console.log('heartbeat =>', heartbeat);

  const quitEvent = plugin.recordPlayerQuit({
    playerUuid: '550e8400-e29b-41d4-a716-446655440000',
  });
  console.log('quitEvent =>', quitEvent);

  console.log('queueDepth =>', plugin.eventQueue.length);
}

if (require.main === module) {
  main();
}
