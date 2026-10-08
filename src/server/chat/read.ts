import { z } from "zod";
import { HttpError } from "../auth/session";
import { database } from "../db/client";

export async function conversationForOwner(ownerId: string, id: string) {
  if (!z.uuid().safeParse(id).success)
    throw new HttpError(422, "INVALID_CONVERSATION_ID");
  const conversation = await database().conversation.findFirst({
    where: { id, ownerId },
    select: {
      id: true,
      title: true,
      runs: {
        where: { state: { in: ["READY", "RUNNING", "PAUSED_RETRYABLE"] } },
        take: 1,
        select: {
          id: true,
          state: true,
          snapshot: true,
          leaseUntil: true,
          steps: { select: { stepKey: true, state: true, attempt: true } },
        },
      },
    },
  });
  if (!conversation) throw new HttpError(404, "CONVERSATION_NOT_FOUND");
  return {
    id: conversation.id,
    title: conversation.title,
    run: conversation.runs[0] ?? null,
  };
}
export async function citationForOwner(ownerId: string, id: string) {
  if (!z.uuid().safeParse(id).success)
    throw new HttpError(422, "INVALID_CITATION_ID");
  const db = database(),
    citation = await db.citation.findFirst({
      where: { id, message: { conversation: { ownerId } } },
      include: { revision: { include: { meeting: true } } },
    });
  if (!citation) throw new HttpError(404, "CITATION_NOT_FOUND");
  if (citation.sourceDeleted || citation.revision?.meeting.deletedAt)
    throw new HttpError(410, "CHAT_SOURCE_UNAVAILABLE");
  if (citation.revision)
    return {
      kind: "TRANSCRIPT" as const,
      label: citation.label,
      meetingId: citation.revision.meetingId,
      revisionId: citation.revision.id,
      revisionNumber: citation.revision.number,
      quote: citation.quote,
      start: citation.startOffset,
      end: citation.endOffset,
      rawText: citation.revision.rawText,
    };
  if (citation.taskId) {
    const task = await db.task.findFirst({
      where: { id: citation.taskId, project: { ownerId } },
    });
    if (!task) throw new HttpError(410, "CHAT_SOURCE_UNAVAILABLE");
    const event = citation.eventId
      ? await db.taskEvent.findFirst({
          where: { id: citation.eventId, taskId: task.id },
        })
      : null;
    return {
      kind: event ? ("TASK_EVENT" as const) : ("TASK" as const),
      label: citation.label,
      taskId: task.id,
      eventId: event?.id ?? null,
      recordedAt: event?.recordedAt ?? task.createdAt,
      state: event?.after ?? {
        title: task.title,
        status: task.status,
        deadline: task.dueDate,
      },
    };
  }
  throw new HttpError(410, "CHAT_SOURCE_UNAVAILABLE");
}
