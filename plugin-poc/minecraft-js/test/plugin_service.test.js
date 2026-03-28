const test = require('node:test');
const assert = require('node:assert/strict');

const { MinecraftPluginPoCService } = require('../src/plugin_service');

function createFixedClock(startIso = '2026-03-28T02:00:00.000Z') {
  let current = new Date(startIso).getTime();
  return {
    now: () => new Date(current),
    advanceMs(ms) {
      current += ms;
    },
  };
}

test('binding command returns expected payload and confirmation info', () => {
  const clock = createFixedClock();
  const plugin = new MinecraftPluginPoCService({
    apiBaseUrl: 'https://gamemulti.local',
    serverCode: 'cn-mc-01',
    pluginClientKey: 'demo-client',
    now: clock.now,
  });

  const result = plugin.createBindingCommand({
    playerUuid: '550e8400-e29b-41d4-a716-446655440000',
    displayName: 'Steve',
  });

  assert.equal(result.endpoint, 'https://gamemulti.local/api/plugin/bindings/session');
  assert.equal(result.payload.gameUserId, '550e8400-e29b-41d4-a716-446655440000');
  assert.equal(result.payload.displayName, 'Steve');
  assert.equal(result.response.expiresIn, 300);
  assert.match(result.response.pairCode, /^\d{6}$/);
  assert.match(result.response.bindUrl, /^https:\/\/gamemulti\.local\/bind\/confirm\?token=/);
  assert.equal(plugin.bindingRequests.length, 1);
});

test('join duration heartbeat quit builds a minimal runtime loop', () => {
  const clock = createFixedClock();
  const plugin = new MinecraftPluginPoCService({
    apiBaseUrl: 'https://gamemulti.local',
    serverId: 'mc-poc-01',
    serverCode: 'cn-mc-01',
    pluginClientKey: 'demo-client',
    now: clock.now,
  });

  const joinEvent = plugin.recordPlayerJoin({
    playerUuid: '550e8400-e29b-41d4-a716-446655440000',
    displayName: 'Steve',
  });
  assert.equal(joinEvent.payload.eventType, 'player_join');
  assert.equal(plugin.onlinePlayers.size, 1);

  clock.advanceMs(10 * 60 * 1000);
  const durationEvent = plugin.recordDurationTick({
    playerUuid: '550e8400-e29b-41d4-a716-446655440000',
    durationMinutes: 10,
  });
  assert.equal(durationEvent.payload.eventType, 'online_duration');
  assert.equal(durationEvent.payload.metadata.rewardWindow, '10m');

  const heartbeat = plugin.reportStatus();
  assert.equal(heartbeat.endpoint, 'https://gamemulti.local/api/game-servers/heartbeat');
  assert.equal(heartbeat.payload.onlineCount, 1);
  assert.equal(heartbeat.payload.queueDepth, 2);

  clock.advanceMs(45 * 1000);
  const quitEvent = plugin.recordPlayerQuit({
    playerUuid: '550e8400-e29b-41d4-a716-446655440000',
  });
  assert.equal(quitEvent.payload.eventType, 'player_quit');
  assert.equal(quitEvent.payload.metadata.sessionDurationSeconds, 645);
  assert.equal(plugin.onlinePlayers.size, 0);
  assert.equal(plugin.eventQueue.length, 3);
});

test('duration reporting requires player online first', () => {
  const plugin = new MinecraftPluginPoCService();

  assert.throws(
    () => plugin.recordDurationTick({
      playerUuid: '550e8400-e29b-41d4-a716-446655440000',
      durationMinutes: 10,
    }),
    (error) => {
      assert.equal(error.code, 'PLAYER_NOT_ONLINE');
      return true;
    },
  );
});
