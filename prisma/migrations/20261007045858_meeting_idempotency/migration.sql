-- CreateTable
CREATE TABLE "RequestRecord" (
    "ownerId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "meetingId" UUID NOT NULL,

    CONSTRAINT "RequestRecord_pkey" PRIMARY KEY ("ownerId","key")
);

-- AddForeignKey
ALTER TABLE "RequestRecord" ADD CONSTRAINT "RequestRecord_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS search_english_gin ON "SearchDocument" USING gin ("englishVector");
CREATE INDEX IF NOT EXISTS search_simple_gin ON "SearchDocument" USING gin ("simpleVector");
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='evidence_meeting_fk') THEN
ALTER TABLE "TaskEvidence" ADD CONSTRAINT evidence_meeting_fk FOREIGN KEY ("sourceMeetingId") REFERENCES "Meeting" (id) ON DELETE SET NULL;
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='evidence_revision_fk') THEN
ALTER TABLE "TaskEvidence" ADD CONSTRAINT evidence_revision_fk FOREIGN KEY ("sourceRevisionId") REFERENCES "TranscriptRevision" (id) ON DELETE SET NULL;
END IF;
END $$;
