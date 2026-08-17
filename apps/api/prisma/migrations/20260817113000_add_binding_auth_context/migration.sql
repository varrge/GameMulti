-- Extend binding outcomes used by the Discourse confirmation flow.
ALTER TYPE "BindingSessionStatus" ADD VALUE IF NOT EXISTS 'conflict';
ALTER TYPE "BindingSessionStatus" ADD VALUE IF NOT EXISTS 'revoked';
ALTER TYPE "BindingSessionStatus" ADD VALUE IF NOT EXISTS 'denied';
ALTER TYPE "BindingSessionStatus" ADD VALUE IF NOT EXISTS 'unavailable';

-- Persist the one-time authentication context and its consumed identity.
ALTER TABLE "BindingSession"
ADD COLUMN "authNonceHash" TEXT,
ADD COLUMN "authExpiresAt" TIMESTAMP(3),
ADD COLUMN "authPurpose" TEXT,
ADD COLUMN "authBindingSessionId" TEXT,
ADD COLUMN "authServerId" TEXT,
ADD COLUMN "authenticatedAt" TIMESTAMP(3),
ADD COLUMN "authenticatedDiscourseUserId" TEXT,
ADD COLUMN "authenticatedServerId" TEXT;

CREATE UNIQUE INDEX "BindingSession_authNonceHash_key" ON "BindingSession"("authNonceHash");
