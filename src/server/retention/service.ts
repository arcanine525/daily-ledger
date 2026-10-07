import { z } from "zod";
import { HttpError } from "../auth/session";
import { database } from "../db/client";
import { indexMeeting } from "../search/index";
import { invalidateChats, recomputeContext } from "./context";
import { ownedMeeting, purgeTx, retentionMilliseconds } from "./purge";

export async function listTrash(ownerId: string) {
  return database().meeting.findMany({
    where: { project: { ownerId }, deletedAt: { not: null } },
    select: {
      id: true,
      title: true,
      deletedAt: true,
      projectId: true,
      occurredAt: true,
    },
    orderBy: [{ deletedAt: "asc" }, { id: "asc" }],
  });
}
export async function trashMeeting(
  ownerId: string,
  id: string,
  now = new Date(),
) {
  return database().$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ownerId},2))`;
      const meeting = await ownedMeeting(tx, ownerId, id);
      const saved = await tx.meeting.update({
        where: { id },
        data: { deletedAt: meeting.deletedAt ?? now },
      });
      await tx.searchDocument.deleteMany({ where: { meetingId: id } });
      await tx.analysisRun.updateMany({
        where: {
          meetingId: id,
          state: { in: ["READY", "RUNNING", "PAUSED_RETRYABLE"] },
        },
        data: {
          state: "CANCELLED",
          leaseUntil: null,
          fencingVersion: { increment: 1 },
        },
      });
      await tx.citation.updateMany({
        where: { revision: { meetingId: id } },
        data: { sourceDeleted: true },
      });
      await tx.taskEvidence.updateMany({
        where: { sourceMeetingId: id },
        data: { sourceDeleted: true },
      });
      const revision = meeting.revisions[0];
      if (revision)
        await invalidateChats(tx, {
          ownerId,
          meetingId: id,
          revisionId: revision.id,
          title: meeting.title,
          permanent: false,
        });
      return { id: saved.id, deletedAt: saved.deletedAt };
    },
    { timeout: 60000 },
  );
}
export async function restoreMeeting(
  ownerId: string,
  id: string,
  now = new Date(),
) {
  return database().$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ownerId},2))`;
      const meeting = await ownedMeeting(tx, ownerId, id);
      if (
        meeting.deletedAt &&
        meeting.deletedAt.getTime() + retentionMilliseconds <= now.getTime()
      )
        throw new HttpError(409, "RESTORE_WINDOW_EXPIRED");
      await tx.meeting.update({ where: { id }, data: { deletedAt: null } });
      await tx.citation.updateMany({
        where: { revision: { meetingId: id } },
        data: { sourceDeleted: false },
      });
      await tx.taskEvidence.updateMany({
        where: { sourceMeetingId: id },
        data: { sourceDeleted: false },
      });
      await indexMeeting(tx, id);
      await recomputeContext(tx, ownerId);
      return { id, restored: true };
    },
    { timeout: 60000 },
  );
}
export async function purgeMeeting(
  ownerId: string,
  id: string,
  input: unknown,
) {
  const parsed = z
    .object({ confirmationTitle: z.string().min(1) })
    .safeParse(input);
  if (!parsed.success) throw new HttpError(422, "PURGE_CONFIRMATION_REQUIRED");
  return database().$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ownerId},2))`;
      const meeting = await ownedMeeting(tx, ownerId, id);
      if (parsed.data.confirmationTitle !== meeting.title)
        throw new HttpError(422, "PURGE_CONFIRMATION_REQUIRED");
      await purgeTx(tx, ownerId, meeting);
      return { id, purged: true, chatHistoryPreserved: true };
    },
    { timeout: 60000 },
  );
}
export async function purgeExpired(ownerId: string, now = new Date()) {
  return database().$transaction(
    async (tx) => {
      const lock = await tx.$queryRaw<
        { acquired: boolean }[]
      >`SELECT pg_try_advisory_xact_lock(hashtextextended(${ownerId},2)) AS acquired`;
      if (!lock[0]?.acquired) return { purged: 0, hasMore: true, busy: true };
      const where = {
          project: { ownerId },
          deletedAt: { lte: new Date(now.getTime() - retentionMilliseconds) },
        },
        meetings = await tx.meeting.findMany({
          where,
          select: { id: true },
          orderBy: [{ deletedAt: "asc" as const }, { id: "asc" as const }],
          take: 10,
        });
      for (const meeting of meetings)
        await purgeTx(tx, ownerId, await ownedMeeting(tx, ownerId, meeting.id));
      return {
        purged: meetings.length,
        hasMore: (await tx.meeting.count({ where })) > 0,
        busy: false,
      };
    },
    { timeout: 60000 },
  );
}
