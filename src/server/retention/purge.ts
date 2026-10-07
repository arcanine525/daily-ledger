import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { HttpError, tokenHash } from "../auth/session";
import { invalidateChats } from "./context";

export const retentionMilliseconds = 30 * 86400000;
export async function ownedMeeting(
  tx: Prisma.TransactionClient,
  ownerId: string,
  id: string,
) {
  if (!z.uuid().safeParse(id).success)
    throw new HttpError(422, "INVALID_MEETING_ID");
  await tx.$queryRaw`SELECT id FROM "Meeting" WHERE id=${id}::uuid FOR UPDATE`;
  const meeting = await tx.meeting.findFirst({
    where: { id, project: { ownerId } },
    include: { revisions: { orderBy: { number: "desc" }, take: 1 } },
  });
  if (!meeting) throw new HttpError(404, "MEETING_NOT_FOUND");
  return meeting;
}
export async function purgeTx(
  tx: Prisma.TransactionClient,
  ownerId: string,
  meeting: Awaited<ReturnType<typeof ownedMeeting>>,
) {
  await tx.citation.updateMany({
    where: { revision: { meetingId: meeting.id } },
    data: { sourceDeleted: true },
  });
  const revision = meeting.revisions[0];
  if (revision)
    await invalidateChats(tx, {
      ownerId,
      meetingId: meeting.id,
      revisionId: revision.id,
      title: meeting.title,
      permanent: true,
    });
  await tx.taskEvidence.updateMany({
    where: { sourceMeetingId: meeting.id },
    data: {
      sourceDeleted: true,
      quote: null,
      startOffset: null,
      endOffset: null,
      sourceMeetingId: null,
      sourceRevisionId: null,
      actionId: null,
    },
  });
  const decisions = await tx.proposalDecision.findMany({
    where: { payload: { path: ["meetingId"], equals: meeting.id } },
  });
  for (const decision of decisions) {
    const receipt = z
      .object({ inputHash: z.string().optional(), result: z.json().optional() })
      .parse(decision.payload);
    await tx.proposalDecision.update({
      where: { id: decision.id },
      data: {
        reason: null,
        fingerprint: tokenHash(decision.fingerprint),
        payload: {
          sourceDeleted: true,
          ...(receipt.inputHash ? { inputHash: receipt.inputHash } : {}),
          ...(receipt.result !== undefined ? { result: receipt.result } : {}),
        },
      },
    });
  }
  await tx.meeting.delete({ where: { id: meeting.id } });
}
