-- Historical schema change from 77e6dd9: support Discourse-first binding.
ALTER TABLE "BindingSession"
    ADD COLUMN "usedByDiscourseUserId" TEXT,
    ADD COLUMN "usedByDiscourseUsername" TEXT;

CREATE INDEX "BindingSession_usedByDiscourseUserId_status_idx"
    ON "BindingSession"("usedByDiscourseUserId", "status");

ALTER TABLE "UserGameBinding"
    ALTER COLUMN "userId" DROP NOT NULL,
    ADD COLUMN "discourseUserId" TEXT,
    ADD COLUMN "discourseUsername" TEXT,
    ADD COLUMN "discourseEmail" TEXT;

CREATE UNIQUE INDEX "UserGameBinding_discourseUserId_gameAccountId_key"
    ON "UserGameBinding"("discourseUserId", "gameAccountId");

CREATE INDEX "UserGameBinding_discourseUserId_bindStatus_idx"
    ON "UserGameBinding"("discourseUserId", "bindStatus");
