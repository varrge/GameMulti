-- Persist a credential-scoped create-session idempotency key and request fingerprint.
ALTER TABLE "BindingSession"
  ADD COLUMN "requestId" TEXT,
  ADD COLUMN "requestPayloadHash" TEXT;

-- Historical sessions predate request IDs. Their own immutable IDs make the backfill unique.
UPDATE "BindingSession"
  SET "requestId" = "id", "requestPayloadHash" = ''
  WHERE "requestId" IS NULL;

ALTER TABLE "BindingSession"
  ALTER COLUMN "requestId" SET NOT NULL,
  ALTER COLUMN "requestPayloadHash" SET NOT NULL;

CREATE UNIQUE INDEX "BindingSession_pluginClientId_requestId_key"
  ON "BindingSession"("pluginClientId", "requestId");
