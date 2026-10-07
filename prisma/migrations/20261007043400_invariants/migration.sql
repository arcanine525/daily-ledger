ALTER TABLE "Owner" ADD CONSTRAINT owner_singleton CHECK (singleton = 1);
ALTER TABLE "UserSettings" ADD CONSTRAINT locales_supported CHECK ("uiLocale" IN ('vi','en') AND "outputLocale" IN ('vi','en'));
ALTER TABLE "TranscriptSegment" ADD CONSTRAINT valid_offsets CHECK ("startOffset" >= 0 AND "endOffset" > "startOffset");
ALTER TABLE "TaskEvent" ADD CONSTRAINT app_time_history CHECK ("effectiveAt" = "recordedAt");
ALTER TABLE "ProviderProfile" ADD CONSTRAINT provider_type CHECK (type IN ('openai-compatible','anthropic','gemini'));
CREATE UNIQUE INDEX one_active_analysis_per_meeting ON "AnalysisRun" ("meetingId") WHERE state IN ('READY','RUNNING','PAUSED_RETRYABLE');
ALTER TABLE "SearchDocument" DROP COLUMN "englishVector", DROP COLUMN "simpleVector";
ALTER TABLE "SearchDocument" ADD COLUMN "englishVector" tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, text)) STORED;
ALTER TABLE "SearchDocument" ADD COLUMN "simpleVector" tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, "normalizedText")) STORED;
CREATE INDEX search_english_gin ON "SearchDocument" USING gin ("englishVector");
CREATE INDEX search_simple_gin ON "SearchDocument" USING gin ("simpleVector");
ALTER TABLE "TaskEvidence" ADD CONSTRAINT evidence_meeting_fk FOREIGN KEY ("sourceMeetingId") REFERENCES "Meeting" (id) ON DELETE SET NULL;
ALTER TABLE "TaskEvidence" ADD CONSTRAINT evidence_revision_fk FOREIGN KEY ("sourceRevisionId") REFERENCES "TranscriptRevision" (id) ON DELETE SET NULL;

CREATE FUNCTION immutable_transcript() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Transcript revisions are immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER preserve_transcript BEFORE UPDATE ON "TranscriptRevision" FOR EACH ROW EXECUTE FUNCTION immutable_transcript();

CREATE FUNCTION validate_analysis_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "TranscriptRevision" WHERE id = NEW."revisionId" AND "meetingId" = NEW."meetingId") THEN
    RAISE EXCEPTION 'Analysis source belongs to another meeting' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER analysis_source BEFORE INSERT OR UPDATE ON "AnalysisRun" FOR EACH ROW EXECUTE FUNCTION validate_analysis_source();
