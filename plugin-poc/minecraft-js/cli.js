const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');
const { MinecraftPluginPoCService } = require('./src/plugin_service');

async function main() {
  const plugin = new MinecraftPluginPoCService({
    apiBaseUrl: process.env.GM_API_BASE_URL || 'http://127.0.0.1:8080',
    serverCode: process.env.GM_SERVER_CODE || 'cn-mc-01',
    pluginClientKey: process.env.GM_PLUGIN_CLIENT_KEY || 'demo-client',
    pluginClientSecret: process.env.GM_PLUGIN_CLIENT_SECRET || 'demo-secret',
  });
  const rl = readline.createInterface({ input, output });

  console.log('GameMulti Minecraft PoC CLI');
  console.log('Commands: /gm bind <name>, /gm join <name>, /gm quit <name>, /gm heartbeat, exit');

  try {
    while (true) {
      const line = await rl.question('> ');
      const command = line.trim();
      if (command === 'exit' || command === 'quit') {
        break;
      }

      try {
        const result = await plugin.handleCommand(command);
        console.log(result.message);
      } catch (error) {
        console.error(error.message);
      }
    }
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
