import { Prisma } from "../../generated/prisma/client";
import { contextSchema, snapshotSchema } from "../chat/contracts";

export async function recomputeContext(
  tx: Prisma.TransactionClient,
  ownerId: string,
) {
  await tx.$executeRaw`WITH RECURSIVE unavailable(id) AS (
    SELECT m.id FROM "ChatMessage" m JOIN "Conversation" c ON c.id=m."conversationId"
    WHERE c."ownerId"=${ownerId}::uuid AND (m.state<>'complete' OR EXISTS (
      SELECT 1 FROM "Citation" x LEFT JOIN "TranscriptRevision" r ON r.id=x."revisionId"
      LEFT JOIN "Meeting" meeting ON meeting.id=r."meetingId"
      WHERE x."messageId"=m.id AND (x."sourceDeleted" OR meeting."deletedAt" IS NOT NULL)))
    UNION SELECT d."messageId" FROM "ChatMessageDependency" d JOIN unavailable u ON u.id=d."contextMessageId"
  ) UPDATE "ChatMessage" m SET "contextEligible"=NOT EXISTS(SELECT 1 FROM unavailable u WHERE u.id=m.id)
    FROM "Conversation" c WHERE c.id=m."conversationId" AND c."ownerId"=${ownerId}::uuid`;
}
export async function invalidateChats(
  tx: Prisma.TransactionClient,
  input: {
    readonly ownerId: string;
    readonly meetingId: string;
    readonly revisionId: string;
    readonly title: string;
    readonly permanent: boolean;
  },
) {
  const runs = await tx.chatRun.findMany({
    where: { conversation: { ownerId: input.ownerId } },
    include: { steps: true },
  });
  const directlyAffected: string[] = [];
  for (const run of runs) {
    const context = contextSchema.safeParse(
        run.steps.find((step) => step.stepKey === "retrieve")?.checkpoint,
      ),
      snapshot = snapshotSchema.parse(run.snapshot);
    if (
      snapshot.filters.meetingId === input.meetingId ||
      (context.success &&
        context.data.coverage.meetingIds.includes(input.meetingId))
    ) {
      directlyAffected.push(run.id);
      if (
        !(await tx.citation.findFirst({
          where: {
            messageId: snapshot.assistantMessageId,
            revision: { meetingId: input.meetingId },
          },
        }))
      )
        await tx.citation.create({
          data: {
            messageId: snapshot.assistantMessageId,
            revisionId: input.revisionId,
            label: input.title,
            sourceDeleted: true,
          },
        });
    }
  }
  await recomputeContext(tx, input.ownerId);
  const excluded = await tx.chatMessage.findMany({
      where: {
        conversation: { ownerId: input.ownerId },
        contextEligible: false,
      },
      select: { id: true },
    }),
    ids = new Set(excluded.map((message) => message.id));
  for (const run of runs) {
    const snapshot = snapshotSchema.parse(run.snapshot);
    if (
      !directlyAffected.includes(run.id) &&
      !ids.has(snapshot.userMessageId) &&
      !snapshot.contextMessageIds.some((id) => ids.has(id))
    )
      continue;
    if (input.permanent) {
      await tx.chatRun.update({
        where: { id: run.id },
        data: {
          state: "CANCELLED",
          leaseUntil: null,
          fencingVersion: { increment: 1 },
          snapshot: {
            ...snapshot,
            question: "",
            filters: { scope: "ALL" },
            contextMessageIds: [],
          },
        },
      });
      await tx.chatStep.updateMany({
        where: { runId: run.id },
        data: { checkpoint: Prisma.DbNull, state: "cancelled" },
      });
    } else if (["READY", "RUNNING", "PAUSED_RETRYABLE"].includes(run.state))
      await tx.chatRun.update({
        where: { id: run.id },
        data: {
          state: "CANCELLED",
          leaseUntil: null,
          fencingVersion: { increment: 1 },
        },
      });
    await tx.chatMessage.updateMany({
      where: { id: snapshot.assistantMessageId, state: { not: "complete" } },
      data: { state: "cancelled", contextEligible: false },
    });
  }
  await recomputeContext(tx, input.ownerId);
}
