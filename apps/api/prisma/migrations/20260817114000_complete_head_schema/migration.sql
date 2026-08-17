-- DropForeignKey
ALTER TABLE "UserGameBinding" DROP CONSTRAINT "UserGameBinding_userId_fkey";

-- AlterTable
ALTER TABLE "ServerPluginClient" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PluginInstallToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "gameCode" TEXT NOT NULL DEFAULT 'minecraft',
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedByServerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PluginInstallToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PluginInstallToken_tokenHash_key" ON "PluginInstallToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PluginInstallToken_status_expiresAt_idx" ON "PluginInstallToken"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "ServerPluginClient_status_expiresAt_idx" ON "ServerPluginClient"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "UserGameBinding" ADD CONSTRAINT "UserGameBinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
