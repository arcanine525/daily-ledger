import { createHash } from "node:crypto";
import { z } from "zod";
import { HttpError } from "../auth/session";
import { database } from "../db/client";
import { transcriptSegments } from "./parser";

const meetingInput = z.object({
  projectId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  occurredAt: z.iso.datetime(),
  meetingTimezone: z.string().min(1),
  rawText: z.string(),
  confirmDuplicate: z.boolean().default(false),
});
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function assertRaw(raw: string) {
  if (raw.length > 240000 || Buffer.byteLength(raw, "utf8") > 2 * 1024 * 1024)
    throw new HttpError(413, "TRANSCRIPT_TOO_LARGE");
  if (!raw.trim()) throw new HttpError(422, "TRANSCRIPT_EMPTY");
}
export async function meetingForOwner(ownerId: string, id: string) {
  const meeting = await database().meeting.findFirst({
    where: { id, deletedAt: null, project: { ownerId } },
    include: {
      revisions: { orderBy: { number: "desc" } },
      identity: true,
      analyses: { orderBy: { number: "desc" } },
    },
  });
  if (!meeting) throw new HttpError(404, "MEETING_NOT_FOUND");
  return meeting;
}
export async function createMeeting(
  ownerId: string,
  input: unknown,
  key: string,
) {
  const result = meetingInput.safeParse(input);
  if (!result.success || !key || key.length > 128)
    throw new HttpError(422, "INVALID_MEETING");
  const data = result.data;
  assertRaw(data.rawText);
  try {
    new Intl.DateTimeFormat("en", { timeZone: data.meetingTimezone });
  } catch (error) {
    if (error instanceof RangeError)
      throw new HttpError(422, "INVALID_TIMEZONE");
    throw error;
  }
  const bodyHash = digest(JSON.stringify(data));
  return database().$transaction(async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ownerId}, 0))`;
    const previous = await db.requestRecord.findUnique({
      where: { ownerId_key: { ownerId, key } },
    });
    if (previous) {
      if (previous.bodyHash !== bodyHash)
        throw new HttpError(409, "IDEMPOTENCY_CONFLICT");
      return db.meeting.findUniqueOrThrow({
        where: { id: previous.meetingId },
      });
    }
    const project = await db.project.findFirst({
      where: { id: data.projectId, ownerId },
    });
    if (!project) throw new HttpError(404, "PROJECT_NOT_FOUND");
    if (project.archivedAt) throw new HttpError(409, "PROJECT_ARCHIVED");
    const sha256 = digest(data.rawText);
    if (
      !data.confirmDuplicate &&
      (await db.transcriptRevision.findFirst({
        where: {
          sha256,
          meeting: { projectId: data.projectId, deletedAt: null },
        },
      }))
    )
      throw new HttpError(409, "DUPLICATE_TRANSCRIPT");
    const meeting = await db.meeting.create({
      data: {
        projectId: data.projectId,
        title: data.title,
        occurredAt: new Date(data.occurredAt),
        meetingTimezone: data.meetingTimezone,
        revisions: {
          create: {
            number: 1,
            rawText: data.rawText,
            sha256,
            segments: { create: transcriptSegments(data.rawText) },
          },
        },
      },
    });
    await db.requestRecord.create({
      data: { ownerId, key, bodyHash, meetingId: meeting.id },
    });
    return meeting;
  });
}
export async function reviseMeeting(
  ownerId: string,
  id: string,
  input: unknown,
) {
  const result = z
    .object({
      rawText: z.string(),
      expectedRevision: z.number().int().positive(),
    })
    .safeParse(input);
  if (!result.success) throw new HttpError(422, "INVALID_REVISION");
  assertRaw(result.data.rawText);
  return database().$transaction(async (db) => {
    await db.$queryRaw`SELECT id FROM "Meeting" WHERE id=${id}::uuid FOR UPDATE`;
    const meeting = await db.meeting.findFirst({
      where: { id, deletedAt: null, project: { ownerId } },
    });
    if (!meeting) throw new HttpError(404, "MEETING_NOT_FOUND");
    if (meeting.currentRevisionNumber !== result.data.expectedRevision)
      throw new HttpError(409, "REVISION_CONFLICT");
    const revision = await db.transcriptRevision.create({
      data: {
        meetingId: id,
        number: meeting.currentRevisionNumber + 1,
        rawText: result.data.rawText,
        sha256: digest(result.data.rawText),
        segments: { create: transcriptSegments(result.data.rawText) },
      },
    });
    await db.meeting.update({
      where: { id },
      data: { currentRevisionNumber: revision.number, activeAnalysisId: null },
    });
    await db.analysisRun.updateMany({
      where: {
        meetingId: id,
        state: { in: ["READY", "RUNNING", "PAUSED_RETRYABLE"] },
      },
      data: { state: "CANCELLED", fencingVersion: { increment: 1 } },
    });
    await db.taskEvidence.updateMany({
      where: { sourceMeetingId: id },
      data: { sourceChanged: true },
    });
    await db.meetingAction.updateMany({
      where: { meetingId: id },
      data: { sourceChanged: true },
    });
    return revision;
  });
}
export async function saveMeetingIdentity(
  ownerId: string,
  id: string,
  input: unknown,
) {
  const mapping = z
    .array(
      z.object({
        speaker: z.string().trim().min(1).max(80),
        isSharedSpeaker: z.boolean(),
        participantIds: z.array(z.uuid()),
      }),
    )
    .max(100)
    .safeParse(input);
  if (!mapping.success) throw new HttpError(422, "INVALID_MAPPING");
  const meeting = await meetingForOwner(ownerId, id);
  const ids = [...new Set(mapping.data.flatMap((item) => item.participantIds))];
  if (
    (await database().projectParticipant.count({
      where: {
        id: { in: ids },
        projectId: meeting.projectId,
        archivedAt: null,
      },
    })) !== ids.length
  )
    throw new HttpError(422, "INVALID_PARTICIPANT");
  await database().$transaction(async (db) => {
    await db.meetingIdentityOverride.deleteMany({ where: { meetingId: id } });
    await db.meetingIdentityOverride.createMany({
      data: mapping.data.map((item) => ({
        meetingId: id,
        speaker: item.speaker,
        isSharedSpeaker: item.isSharedSpeaker,
        mapping: { participantIds: item.participantIds },
      })),
    });
  });
  return { saved: true };
}
