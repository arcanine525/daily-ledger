import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { evidenceSchema } from "../analysis/pipeline-contracts";
import { HttpError } from "../auth/session";
import { database } from "../db/client";
import { event, ownedTask, snapshot } from "./transaction";

export async function addEvidence(
  tx: Prisma.TransactionClient,
  input: {
    readonly ownerId: string;
    readonly taskId: string;
    readonly actionId: string;
    readonly evidence: Prisma.JsonValue;
    readonly sourceAt: Date;
    readonly recordEvent?: boolean;
  },
) {
  const task = await ownedTask(tx, input.ownerId, input.taskId),
    action = await tx.meetingAction.findFirst({
      where: {
        id: input.actionId,
        meeting: { deletedAt: null, project: { ownerId: input.ownerId } },
      },
      include: { meeting: true },
    });
  if (!action || action.meeting.projectId !== task.projectId)
    throw new HttpError(422, "CROSS_PROJECT_LINK");
  const source = evidenceSchema.parse(input.evidence),
    revision = await tx.transcriptRevision.findFirst({
      where: { id: source.revisionId, meetingId: action.meetingId },
    });
  if (
    !revision ||
    revision.rawText.slice(source.start, source.end) !== source.quote
  )
    throw new HttpError(422, "INVALID_LINK_EVIDENCE");
  const existing = await tx.taskEvidence.findFirst({
    where: {
      taskId: task.id,
      actionId: action.id,
      sourceRevisionId: revision.id,
      startOffset: source.start,
      endOffset: source.end,
    },
  });
  if (
    existing &&
    action.taskId === task.id &&
    action.reviewState === "ACCEPTED"
  )
    return task;
  if (!existing) {
    await tx.taskEvidence.create({
      data: {
        taskId: task.id,
        actionId: action.id,
        sourceMeetingId: action.meetingId,
        sourceRevisionId: revision.id,
        quote: source.quote,
        startOffset: source.start,
        endOffset: source.end,
        sourceChanged: revision.number !== action.meeting.currentRevisionNumber,
      },
    });
    if (input.recordEvent !== false)
      await event(tx, {
        task,
        kind: "LINK",
        before: snapshot(task),
        fields: [],
        sourceAt: input.sourceAt,
      });
  }
  await tx.meetingAction.update({
    where: { id: action.id },
    data: {
      taskId: task.id,
      reviewState: "ACCEPTED",
      version: { increment: 1 },
    },
  });
  return task;
}
export async function linkAction(
  ownerId: string,
  actionId: string,
  input: unknown,
) {
  const parsed = z.object({ taskId: z.uuid() }).safeParse(input);
  if (!parsed.success) throw new HttpError(422, "INVALID_LINK");
  return database().$transaction(async (tx) => {
    const action = await tx.meetingAction.findFirst({
      where: {
        id: actionId,
        meeting: { project: { ownerId }, deletedAt: null },
      },
      include: {
        meeting: true,
        occurrences: {
          include: { occurrence: true },
          orderBy: { occurrence: { analysis: { number: "desc" } } },
        },
      },
    });
    if (!action) throw new HttpError(404, "ACTION_NOT_FOUND");
    if (action.taskId && action.taskId !== parsed.data.taskId)
      throw new HttpError(409, "UNLINK_FIRST");
    const occurrence = action.occurrences[0]?.occurrence;
    if (!occurrence) throw new HttpError(422, "SOURCE_REQUIRED");
    return addEvidence(tx, {
      ownerId,
      taskId: parsed.data.taskId,
      actionId,
      evidence: occurrence.evidence,
      sourceAt: action.meeting.occurredAt,
    });
  });
}
export async function unlinkAction(ownerId: string, actionId: string) {
  return database().$transaction(async (tx) => {
    const action = await tx.meetingAction.findFirst({
      where: { id: actionId, meeting: { project: { ownerId } } },
      include: { meeting: true },
    });
    if (!action?.taskId) throw new HttpError(409, "ACTION_NOT_LINKED");
    const task = await ownedTask(tx, ownerId, action.taskId);
    await tx.taskEvidence.deleteMany({
      where: { taskId: task.id, actionId: action.id },
    });
    await tx.meetingAction.update({
      where: { id: actionId },
      data: {
        taskId: null,
        reviewState: "ACCEPTED",
        version: { increment: 1 },
      },
    });
    await event(tx, {
      task,
      kind: "UNLINK",
      before: snapshot(task),
      fields: [],
      sourceAt: action.meeting.occurredAt,
    });
    return { unlinked: true };
  });
}
