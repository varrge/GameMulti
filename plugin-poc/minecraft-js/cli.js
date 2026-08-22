const readline = require('node:readline/promises');
const fs = require('node:fs');
const { stdin: input, stdout: output } = require('node:process');
const { MinecraftPluginPoCService } = require('./src/plugin_service');

async function main() {
  const plugin = new MinecraftPluginPoCService({
    apiBaseUrl: process.env.GM_API_BASE_URL || 'http://127.0.0.1:8080',
    serverCode: process.env.GM_SERVER_CODE || 'cn-mc-01',
    pluginClientKey: process.env.GM_PLUGIN_CLIENT_KEY || 'demo-client',
    pluginClientSecret: process.env.GM_PLUGIN_CLIENT_SECRET || 'demo-secret',
    protocolVersion: process.env.GM_PROTOCOL_VERSION || '2026-06-mvp',
  });

  console.log('GameMulti Minecraft PoC CLI');
  console.log('Commands: /gm bind <name>, /gm join <name>, /gm quit <name>, /gm heartbeat, exit');

  if (!input.isTTY) {
    const lines = fs.readFileSync(0, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const command = line.trim();
      if (!command) {
        continue;
      }
      if (command === 'exit' || command === 'quit') {
        break;
      }
      await runCommand(plugin, command);
    }
    return;
  }

  const rl = readline.createInterface({ input, output });
  try {
    while (true) {
      const line = await rl.question('> ');
      const command = line.trim();
      if (command === 'exit' || command === 'quit') {
        break;
      }

      await runCommand(plugin, command);
    }
  } finally {
    rl.close();
  }
}

async function runCommand(plugin, command) {
  try {
    const result = await plugin.handleCommand(command);
    console.log(result.message);
  } catch (error) {
    console.error(error.message);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
