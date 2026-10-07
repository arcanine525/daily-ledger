import { createConversation } from "../../src/server/chat/service";
import { database } from "../../src/server/db/client";
import { createMeeting } from "../../src/server/meetings/archive";
import { saveProfile } from "../../src/server/providers/profiles";
export const retentionNow = new Date("2026-10-07T12:00:00Z");
export type RetentionFixture = {
  readonly ownerId: string;
  readonly projectId: string;
  readonly conversationId: string;
};
export async function setupRetention(email: string): Promise<RetentionFixture> {
  const db = database(),
    ownerId = (
      await db.owner.create({ data: { email, passwordHash: "fixture" } })
    ).id,
    projectId = (
      await db.project.create({ data: { ownerId, name: "Retention" } })
    ).id;
  const profile = await saveProfile(ownerId, {
    name: "Mock",
    type: "openai-compatible",
    baseUrl: "https://example.com",
    model: "fixture",
    token: "fixture",
  });
  await db.userSettings.create({
    data: { ownerId, analysisProfileId: profile.id, chatProfileId: profile.id },
  });
  const conversationId = (
    await createConversation(ownerId, { title: "Retained history" })
  ).id;
  return { ownerId, projectId, conversationId };
}
export async function cleanupRetention({
  ownerId,
  projectId,
}: RetentionFixture) {
  const db = database();
  await db.chatMessageDependency.deleteMany({
    where: { message: { conversation: { ownerId } } },
  });
  await db.conversation.deleteMany({ where: { ownerId } });
  await db.task.deleteMany({ where: { projectId } });
  await db.meeting.deleteMany({ where: { projectId } });
  await db.project.delete({ where: { id: projectId } });
  await db.owner.delete({ where: { id: ownerId } });
  await db.proposalDecision.deleteMany({
    where: { idempotencyKey: { startsWith: `${ownerId}:` } },
  });
  await db.$disconnect();
}
export async function retentionMeeting(
  { ownerId, projectId, conversationId }: RetentionFixture,
  label: string,
) {
  const db = database(),
    meeting = await createMeeting(
      ownerId,
      {
        projectId,
        title: label,
        occurredAt: retentionNow.toISOString(),
        meetingTimezone: "UTC",
        rawText: `Mai: ${label} migration evidence.`,
      },
      `retention-${label}`,
    ),
    revision = await db.transcriptRevision.findFirstOrThrow({
      where: { meetingId: meeting.id },
    }),
    message = await db.chatMessage.create({
      data: {
        conversationId,
        role: "assistant",
        body: `Saved ${label} evidence`,
        state: "complete",
        filters: {},
      },
    });
  await db.citation.create({
    data: {
      messageId: message.id,
      revisionId: revision.id,
      label,
      quote: revision.rawText,
      startOffset: 0,
      endOffset: revision.rawText.length,
    },
  });
  return { meeting, revision, message };
}
