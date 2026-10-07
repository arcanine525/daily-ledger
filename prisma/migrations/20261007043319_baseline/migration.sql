-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RunState" AS ENUM ('READY', 'RUNNING', 'PAUSED_RETRYABLE', 'FAILED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProposalState" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', 'STALE');

-- CreateEnum
CREATE TYPE "ProposalKind" AS ENUM ('CREATE', 'LINK', 'UPDATE');

-- CreateTable
CREATE TABLE "Owner" (
    "id" UUID NOT NULL,
    "singleton" INTEGER NOT NULL DEFAULT 1,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "ownerId" UUID NOT NULL,
    "uiLocale" TEXT NOT NULL DEFAULT 'vi',
    "outputLocale" TEXT NOT NULL DEFAULT 'vi',
    "timezone" TEXT,
    "displayName" TEXT NOT NULL DEFAULT '',
    "analysisProfileId" UUID,
    "chatProfileId" UUID,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("ownerId")
);

-- CreateTable
CREATE TABLE "IdentityAlias" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,

    CONSTRAINT "IdentityAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderProfile" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ProviderProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderProfileRevision" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "contextBudget" INTEGER NOT NULL DEFAULT 32000,
    "capabilities" JSONB NOT NULL DEFAULT '{}',
    "ciphertext" TEXT,
    "nonce" TEXT,
    "tag" TEXT,
    "keyId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderProfileRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectParticipant" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "isSelf" BOOLEAN NOT NULL DEFAULT false,
    "mappingVersion" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ProjectParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipantAlias" (
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "normalized" TEXT NOT NULL,

    CONSTRAINT "ParticipantAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "meetingTimezone" TEXT NOT NULL,
    "currentRevisionNumber" INTEGER NOT NULL DEFAULT 1,
    "activeAnalysisId" UUID,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptRevision" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "rawText" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptSegment" (
    "id" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "speaker" TEXT,
    "timestamp" TEXT,

    CONSTRAINT "TranscriptSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingIdentityOverride" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "speaker" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "isSharedSpeaker" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MeetingIdentityOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisRun" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "profileRevisionId" UUID NOT NULL,
    "state" "RunState" NOT NULL DEFAULT 'READY',
    "snapshot" JSONB NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "leaseUntil" TIMESTAMPTZ(3),
    "fencingVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisStep" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "stepKey" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "checkpoint" JSONB,
    "error" JSONB,
    "usage" JSONB,

    CONSTRAINT "AnalysisStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisVersion" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "summary" JSONB NOT NULL,
    "locale" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TodoOccurrence" (
    "id" UUID NOT NULL,
    "analysisId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assignees" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "dueDate" DATE,
    "reportedStatus" "TaskStatus",

    CONSTRAINT "TodoOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAction" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "taskId" UUID,
    "title" TEXT NOT NULL,
    "assignees" JSONB NOT NULL,
    "dueDate" DATE,
    "reviewState" "ProposalState" NOT NULL DEFAULT 'PENDING',
    "manuallyEditedAt" TIMESTAMPTZ(3),
    "sourceChanged" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "MeetingAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingActionOccurrence" (
    "actionId" UUID NOT NULL,
    "occurrenceId" UUID NOT NULL,

    CONSTRAINT "MeetingActionOccurrence_pkey" PRIMARY KEY ("actionId","occurrenceId")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "origin" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" DATE,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldVersions" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAssignment" (
    "taskId" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "mappingVersion" INTEGER NOT NULL,

    CONSTRAINT "TaskAssignment_pkey" PRIMARY KEY ("taskId","participantId")
);

-- CreateTable
CREATE TABLE "TaskEvent" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "changedFields" TEXT[],
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceOccurredAt" TIMESTAMPTZ(3),

    CONSTRAINT "TaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskEvidence" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "sourceMeetingId" UUID,
    "sourceRevisionId" UUID,
    "quote" TEXT,
    "sourceChanged" BOOLEAN NOT NULL DEFAULT false,
    "sourceDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TaskEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskProposal" (
    "id" UUID NOT NULL,
    "actionId" UUID NOT NULL,
    "taskId" UUID,
    "kind" "ProposalKind" NOT NULL,
    "state" "ProposalState" NOT NULL DEFAULT 'PENDING',
    "expectedTaskVersion" INTEGER,
    "baseFieldVersions" JSONB NOT NULL,
    "readFields" TEXT[],
    "writeFields" TEXT[],
    "changes" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "sourceOccurredAt" TIMESTAMPTZ(3) NOT NULL,
    "fingerprint" TEXT NOT NULL,

    CONSTRAINT "TaskProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalDecision" (
    "id" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "outcome" "ProposalState" NOT NULL,
    "reason" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchDocument" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "meetingId" UUID,
    "sourceId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "englishVector" tsvector,
    "simpleVector" tsvector,

    CONSTRAINT "SearchDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "contextEligible" BOOLEAN NOT NULL DEFAULT true,
    "filters" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessageDependency" (
    "messageId" UUID NOT NULL,
    "contextMessageId" UUID NOT NULL,

    CONSTRAINT "ChatMessageDependency_pkey" PRIMARY KEY ("messageId","contextMessageId")
);

-- CreateTable
CREATE TABLE "Citation" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "revisionId" UUID,
    "taskId" UUID,
    "eventId" UUID,
    "label" TEXT NOT NULL,
    "quote" TEXT,
    "startOffset" INTEGER,
    "endOffset" INTEGER,
    "sourceDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Citation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRun" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "profileRevisionId" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "state" "RunState" NOT NULL DEFAULT 'READY',
    "leaseUntil" TIMESTAMPTZ(3),
    "fencingVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChatRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatStep" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "stepKey" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "checkpoint" JSONB,
    "attempt" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChatStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Owner_singleton_key" ON "Owner"("singleton");

-- CreateIndex
CREATE UNIQUE INDEX "Owner_email_key" ON "Owner"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityAlias_ownerId_normalized_key" ON "IdentityAlias"("ownerId", "normalized");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderProfileRevision_profileId_number_key" ON "ProviderProfileRevision"("profileId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ParticipantAlias_participantId_normalized_key" ON "ParticipantAlias"("participantId", "normalized");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_activeAnalysisId_key" ON "Meeting"("activeAnalysisId");

-- CreateIndex
CREATE INDEX "Meeting_projectId_occurredAt_idx" ON "Meeting"("projectId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptRevision_meetingId_number_key" ON "TranscriptRevision"("meetingId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptSegment_revisionId_ordinal_key" ON "TranscriptSegment"("revisionId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingIdentityOverride_meetingId_speaker_key" ON "MeetingIdentityOverride"("meetingId", "speaker");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisStep_runId_stepKey_key" ON "AnalysisStep"("runId", "stepKey");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisVersion_runId_key" ON "AnalysisVersion"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisVersion_meetingId_number_key" ON "AnalysisVersion"("meetingId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalDecision_idempotencyKey_key" ON "ProposalDecision"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ProposalDecision_fingerprint_idx" ON "ProposalDecision"("fingerprint");

-- CreateIndex
CREATE INDEX "SearchDocument_sourceId_idx" ON "SearchDocument"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatStep_runId_stepKey_key" ON "ChatStep"("runId", "stepKey");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_analysisProfileId_fkey" FOREIGN KEY ("analysisProfileId") REFERENCES "ProviderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_chatProfileId_fkey" FOREIGN KEY ("chatProfileId") REFERENCES "ProviderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityAlias" ADD CONSTRAINT "IdentityAlias_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderProfile" ADD CONSTRAINT "ProviderProfile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderProfileRevision" ADD CONSTRAINT "ProviderProfileRevision_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectParticipant" ADD CONSTRAINT "ProjectParticipant_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantAlias" ADD CONSTRAINT "ParticipantAlias_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "ProjectParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_activeAnalysisId_fkey" FOREIGN KEY ("activeAnalysisId") REFERENCES "AnalysisVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptRevision" ADD CONSTRAINT "TranscriptRevision_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptSegment" ADD CONSTRAINT "TranscriptSegment_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "TranscriptRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingIdentityOverride" ADD CONSTRAINT "MeetingIdentityOverride_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "TranscriptRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_profileRevisionId_fkey" FOREIGN KEY ("profileRevisionId") REFERENCES "ProviderProfileRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisStep" ADD CONSTRAINT "AnalysisStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisVersion" ADD CONSTRAINT "AnalysisVersion_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisVersion" ADD CONSTRAINT "AnalysisVersion_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "TranscriptRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisVersion" ADD CONSTRAINT "AnalysisVersion_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodoOccurrence" ADD CONSTRAINT "TodoOccurrence_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "AnalysisVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAction" ADD CONSTRAINT "MeetingAction_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAction" ADD CONSTRAINT "MeetingAction_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingActionOccurrence" ADD CONSTRAINT "MeetingActionOccurrence_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "MeetingAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingActionOccurrence" ADD CONSTRAINT "MeetingActionOccurrence_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "TodoOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "ProjectParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvidence" ADD CONSTRAINT "TaskEvidence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskProposal" ADD CONSTRAINT "TaskProposal_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "MeetingAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskProposal" ADD CONSTRAINT "TaskProposal_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchDocument" ADD CONSTRAINT "SearchDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchDocument" ADD CONSTRAINT "SearchDocument_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageDependency" ADD CONSTRAINT "ChatMessageDependency_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageDependency" ADD CONSTRAINT "ChatMessageDependency_contextMessageId_fkey" FOREIGN KEY ("contextMessageId") REFERENCES "ChatMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "TranscriptRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TaskEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRun" ADD CONSTRAINT "ChatRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRun" ADD CONSTRAINT "ChatRun_profileRevisionId_fkey" FOREIGN KEY ("profileRevisionId") REFERENCES "ProviderProfileRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatStep" ADD CONSTRAINT "ChatStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ChatRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
