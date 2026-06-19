import { PrismaClient } from '@prisma/client';
import { encryptSecret } from '../src/security/secret-vault';

const prisma = new PrismaClient();
const appSecret = process.env.APP_SECRET || 'replace-with-a-long-random-secret';
const demoPluginSecret = 'demo-secret';

async function main() {
  const game = await prisma.game.upsert({
    where: { code: 'minecraft' },
    update: {},
    create: {
      code: 'minecraft',
      name: 'Minecraft',
      status: 'active',
    },
  });

  const server = await prisma.gameServer.upsert({
    where: { serverCode: 'cn-mc-01' },
    update: {},
    create: {
      gameId: game.id,
      serverCode: 'cn-mc-01',
      serverName: 'CN MC 01',
      region: 'cn',
      adapterType: 'minecraft-js-poc',
      status: 'active',
    },
  });

  await prisma.serverPluginClient.upsert({
    where: { clientKey: 'demo-client' },
    update: {
      clientSecretHash: encryptSecret(demoPluginSecret, appSecret),
    },
    create: {
      serverId: server.id,
      clientKey: 'demo-client',
      clientSecretHash: encryptSecret(demoPluginSecret, appSecret),
      pluginVersion: '0.1.0',
      protocolVersion: '2026-06-mvp',
      status: 'active',
    },
  });

  await prisma.invitationCode.upsert({
    where: { code: 'ABCD1234' },
    update: {},
    create: {
      code: 'ABCD1234',
      createdBy: 'seed',
      maxUses: 20,
      status: 'active',
      remark: 'Local MVP seed invite',
    },
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
