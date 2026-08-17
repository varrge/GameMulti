-- Historical schema change from 470ac36: ingest plugin events and server heartbeats.
CREATE TABLE "PluginEvent" (
    "id" TEXT NOT NULL,
    "pluginClientId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "playerUuid" TEXT NOT NULL,
    "displayName" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PluginEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PluginEvent_pluginClientId_eventId_key"
    ON "PluginEvent"("pluginClientId", "eventId");

CREATE INDEX "PluginEvent_serverId_eventType_occurredAt_idx"
    ON "PluginEvent"("serverId", "eventType", "occurredAt");

CREATE INDEX "PluginEvent_playerUuid_occurredAt_idx"
    ON "PluginEvent"("playerUuid", "occurredAt");

CREATE TABLE "GameServerHeartbeat" (
    "id" TEXT NOT NULL,
    "pluginClientId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "healthy" BOOLEAN NOT NULL,
    "onlineCount" INTEGER NOT NULL,
    "queueDepth" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameServerHeartbeat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GameServerHeartbeat_pluginClientId_statusId_key"
    ON "GameServerHeartbeat"("pluginClientId", "statusId");

CREATE INDEX "GameServerHeartbeat_serverId_sentAt_idx"
    ON "GameServerHeartbeat"("serverId", "sentAt");

ALTER TABLE "PluginEvent"
    ADD CONSTRAINT "PluginEvent_pluginClientId_fkey"
    FOREIGN KEY ("pluginClientId") REFERENCES "ServerPluginClient"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PluginEvent"
    ADD CONSTRAINT "PluginEvent_serverId_fkey"
    FOREIGN KEY ("serverId") REFERENCES "GameServer"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GameServerHeartbeat"
    ADD CONSTRAINT "GameServerHeartbeat_pluginClientId_fkey"
    FOREIGN KEY ("pluginClientId") REFERENCES "ServerPluginClient"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GameServerHeartbeat"
    ADD CONSTRAINT "GameServerHeartbeat_serverId_fkey"
    FOREIGN KEY ("serverId") REFERENCES "GameServer"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
