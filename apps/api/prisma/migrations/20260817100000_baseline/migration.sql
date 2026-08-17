-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'disabled', 'banned');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('password', 'steam', 'discord');

-- CreateEnum
CREATE TYPE "InvitationCodeStatus" AS ENUM ('active', 'disabled', 'expired', 'exhausted');

-- CreateEnum
CREATE TYPE "BindingSessionStatus" AS ENUM ('pending', 'confirmed', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "UserGameBindingStatus" AS ENUM ('active', 'unbinding', 'unbound', 'blocked');

-- CreateEnum
CREATE TYPE "ForumAccountSyncStatus" AS ENUM ('pending_initial_sync', 'active', 'syncing', 'sync_failed', 'disabled');

-- CreateEnum
CREATE TYPE "ForumSsoTicketStatus" AS ENUM ('issued', 'consumed', 'expired', 'cancelled');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL DEFAULT 'invite_register',
    "invitedByUserId" TEXT,
    "invitationCodeId" TEXT,
    "registerIp" TEXT,
    "registerUserAgent" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAuthAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "passwordHash" TEXT,
    "email" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvitationCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "batchId" TEXT,
    "maxUses" INTEGER NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "status" "InvitationCodeStatus" NOT NULL DEFAULT 'active',
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvitationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvitationCodeUsage" (
    "id" TEXT NOT NULL,
    "invitationCodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inviterUserId" TEXT,
    "usedIp" TEXT,
    "usedUserAgent" TEXT,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvitationCodeUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameServer" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "serverCode" TEXT NOT NULL,
    "serverName" TEXT NOT NULL,
    "region" TEXT,
    "endpointHost" TEXT,
    "endpointPort" INTEGER,
    "adapterType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerPluginClient" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "clientSecretHash" TEXT NOT NULL,
    "pluginVersion" TEXT,
    "protocolVersion" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerPluginClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameAccount" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "gameUserId" TEXT NOT NULL,
    "normalizedGameUserId" TEXT NOT NULL,
    "displayName" TEXT,
    "extraMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BindingSession" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "pluginClientId" TEXT NOT NULL,
    "gameUserId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "displayName" TEXT,
    "bindMode" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "pairCode" TEXT NOT NULL,
    "status" "BindingSessionStatus" NOT NULL DEFAULT 'pending',
    "gameAccountSnapshot" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedByUserId" TEXT,
    "confirmedBindingId" TEXT,
    "confirmedGameAccountId" TEXT,
    "createdIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BindingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGameBinding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameAccountId" TEXT NOT NULL,
    "serverId" TEXT,
    "bindStatus" "UserGameBindingStatus" NOT NULL DEFAULT 'active',
    "bindSource" TEXT NOT NULL,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "unbindRequestedAt" TIMESTAMP(3),
    "unbindApprovedAt" TIMESTAMP(3),
    "unbindCooldownUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserGameBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "forumProvider" TEXT NOT NULL,
    "forumUserId" TEXT NOT NULL,
    "forumUsername" TEXT NOT NULL,
    "forumEmail" TEXT,
    "externalUid" TEXT NOT NULL,
    "syncStatus" "ForumAccountSyncStatus" NOT NULL DEFAULT 'pending_initial_sync',
    "mappingSource" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForumAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumSsoTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "forumAccountId" TEXT NOT NULL,
    "forumProvider" TEXT NOT NULL,
    "ticket" TEXT NOT NULL,
    "redirectUrl" TEXT,
    "status" "ForumSsoTicketStatus" NOT NULL DEFAULT 'issued',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "requestIp" TEXT,
    "requestUserAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForumSsoTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "requestIp" TEXT,
    "requestUserAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_status_createdAt_idx" ON "User"("status", "createdAt");

-- CreateIndex
CREATE INDEX "User_invitedByUserId_idx" ON "User"("invitedByUserId");

-- CreateIndex
CREATE INDEX "UserAuthAccount_userId_provider_idx" ON "UserAuthAccount"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "UserAuthAccount_provider_providerAccountId_key" ON "UserAuthAccount"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "InvitationCode_code_key" ON "InvitationCode"("code");

-- CreateIndex
CREATE INDEX "InvitationCode_status_expiresAt_idx" ON "InvitationCode"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "InvitationCode_batchId_idx" ON "InvitationCode"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "InvitationCodeUsage_userId_key" ON "InvitationCodeUsage"("userId");

-- CreateIndex
CREATE INDEX "InvitationCodeUsage_invitationCodeId_usedAt_idx" ON "InvitationCodeUsage"("invitationCodeId", "usedAt");

-- CreateIndex
CREATE INDEX "InvitationCodeUsage_inviterUserId_usedAt_idx" ON "InvitationCodeUsage"("inviterUserId", "usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Game_code_key" ON "Game"("code");

-- CreateIndex
CREATE UNIQUE INDEX "GameServer_serverCode_key" ON "GameServer"("serverCode");

-- CreateIndex
CREATE INDEX "GameServer_gameId_status_idx" ON "GameServer"("gameId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ServerPluginClient_clientKey_key" ON "ServerPluginClient"("clientKey");

-- CreateIndex
CREATE INDEX "ServerPluginClient_serverId_status_idx" ON "ServerPluginClient"("serverId", "status");

-- CreateIndex
CREATE INDEX "GameAccount_gameId_platform_gameUserId_idx" ON "GameAccount"("gameId", "platform", "gameUserId");

-- CreateIndex
CREATE UNIQUE INDEX "GameAccount_gameId_platform_normalizedGameUserId_key" ON "GameAccount"("gameId", "platform", "normalizedGameUserId");

-- CreateIndex
CREATE UNIQUE INDEX "BindingSession_token_key" ON "BindingSession"("token");

-- CreateIndex
CREATE UNIQUE INDEX "BindingSession_pairCode_key" ON "BindingSession"("pairCode");

-- CreateIndex
CREATE INDEX "BindingSession_token_idx" ON "BindingSession"("token");

-- CreateIndex
CREATE INDEX "BindingSession_pairCode_idx" ON "BindingSession"("pairCode");

-- CreateIndex
CREATE INDEX "BindingSession_status_expiresAt_idx" ON "BindingSession"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "BindingSession_gameId_platform_gameUserId_idx" ON "BindingSession"("gameId", "platform", "gameUserId");

-- CreateIndex
CREATE INDEX "UserGameBinding_userId_bindStatus_idx" ON "UserGameBinding"("userId", "bindStatus");

-- CreateIndex
CREATE INDEX "UserGameBinding_gameAccountId_bindStatus_idx" ON "UserGameBinding"("gameAccountId", "bindStatus");

-- CreateIndex
CREATE UNIQUE INDEX "UserGameBinding_userId_gameAccountId_key" ON "UserGameBinding"("userId", "gameAccountId");

-- CreateIndex
CREATE INDEX "ForumAccount_forumProvider_syncStatus_idx" ON "ForumAccount"("forumProvider", "syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ForumAccount_userId_forumProvider_key" ON "ForumAccount"("userId", "forumProvider");

-- CreateIndex
CREATE UNIQUE INDEX "ForumAccount_forumProvider_forumUserId_key" ON "ForumAccount"("forumProvider", "forumUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ForumAccount_forumProvider_externalUid_key" ON "ForumAccount"("forumProvider", "externalUid");

-- CreateIndex
CREATE UNIQUE INDEX "ForumSsoTicket_ticket_key" ON "ForumSsoTicket"("ticket");

-- CreateIndex
CREATE INDEX "ForumSsoTicket_status_expiresAt_idx" ON "ForumSsoTicket"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "ForumSsoTicket_forumProvider_status_idx" ON "ForumSsoTicket"("forumProvider", "status");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_invitationCodeId_fkey" FOREIGN KEY ("invitationCodeId") REFERENCES "InvitationCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAuthAccount" ADD CONSTRAINT "UserAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitationCodeUsage" ADD CONSTRAINT "InvitationCodeUsage_invitationCodeId_fkey" FOREIGN KEY ("invitationCodeId") REFERENCES "InvitationCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitationCodeUsage" ADD CONSTRAINT "InvitationCodeUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameServer" ADD CONSTRAINT "GameServer_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerPluginClient" ADD CONSTRAINT "ServerPluginClient_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "GameServer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameAccount" ADD CONSTRAINT "GameAccount_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BindingSession" ADD CONSTRAINT "BindingSession_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BindingSession" ADD CONSTRAINT "BindingSession_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "GameServer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BindingSession" ADD CONSTRAINT "BindingSession_pluginClientId_fkey" FOREIGN KEY ("pluginClientId") REFERENCES "ServerPluginClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BindingSession" ADD CONSTRAINT "BindingSession_usedByUserId_fkey" FOREIGN KEY ("usedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGameBinding" ADD CONSTRAINT "UserGameBinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGameBinding" ADD CONSTRAINT "UserGameBinding_gameAccountId_fkey" FOREIGN KEY ("gameAccountId") REFERENCES "GameAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGameBinding" ADD CONSTRAINT "UserGameBinding_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "GameServer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumAccount" ADD CONSTRAINT "ForumAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumSsoTicket" ADD CONSTRAINT "ForumSsoTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumSsoTicket" ADD CONSTRAINT "ForumSsoTicket_forumAccountId_fkey" FOREIGN KEY ("forumAccountId") REFERENCES "ForumAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
