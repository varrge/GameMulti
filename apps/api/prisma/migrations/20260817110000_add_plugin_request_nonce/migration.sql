-- Historical schema change from de1190a: persist plugin request nonces.
CREATE TABLE "PluginRequestNonce" (
    "id" TEXT NOT NULL,
    "pluginClientId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PluginRequestNonce_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PluginRequestNonce_pluginClientId_nonce_key"
    ON "PluginRequestNonce"("pluginClientId", "nonce");

CREATE INDEX "PluginRequestNonce_expiresAt_idx"
    ON "PluginRequestNonce"("expiresAt");

ALTER TABLE "PluginRequestNonce"
    ADD CONSTRAINT "PluginRequestNonce_pluginClientId_fkey"
    FOREIGN KEY ("pluginClientId") REFERENCES "ServerPluginClient"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
