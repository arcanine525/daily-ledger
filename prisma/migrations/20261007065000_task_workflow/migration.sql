ALTER TABLE "TaskAssignment" ADD COLUMN "isSelfSnapshot" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TaskEvent" ADD COLUMN "idempotencyKey" TEXT, ADD COLUMN "inputHash" TEXT;
CREATE UNIQUE INDEX "TaskEvent_idempotencyKey_key" ON "TaskEvent" ("idempotencyKey");
ALTER TABLE "TaskEvidence" ADD COLUMN "startOffset" INTEGER, ADD COLUMN "endOffset" INTEGER;
ALTER TABLE "TaskEvidence" ADD COLUMN "actionId" UUID;
ALTER TABLE "TaskEvidence" ADD CONSTRAINT "TaskEvidence_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "MeetingAction"(id) ON DELETE SET NULL ON UPDATE CASCADE;
