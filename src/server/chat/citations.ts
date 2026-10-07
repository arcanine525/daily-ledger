import type { Prisma } from "../../generated/prisma/client";
import { HttpError } from "../auth/session";
import { database } from "../db/client";
import type { ChatSource } from "./contracts";
import { unavailableMessages } from "./history";

export async function validateSources(
  tx: Prisma.TransactionClient,
  ownerId: string,
  sources: readonly ChatSource[],
) {
  for (const source of sources) {
    if (
      source.kind === "PENDING" &&
      !(await tx.meetingAction.findFirst({
        where: {
          id: source.id,
          version: source.version ?? 0,
          reviewState: "PENDING",
          taskId: null,
        },
      }))
    )
      throw new HttpError(409, "CHAT_PENDING_CHANGED");
    if (
      source.meetingId &&
      !(await tx.meeting.findFirst({
        where: { id: source.meetingId, deletedAt: null, project: { ownerId } },
      }))
    )
      throw new HttpError(409, "CHAT_SOURCE_UNAVAILABLE");
    if (
      source.revisionId &&
      !(await tx.transcriptRevision.findFirst({
        where: {
          id: source.revisionId,
          meetingId: source.meetingId ?? "",
          meeting: { deletedAt: null, project: { ownerId } },
        },
      }))
    )
      throw new HttpError(409, "CHAT_SOURCE_UNAVAILABLE");
    if (source.taskId) {
      const task = await tx.task.findFirst({
        where: { id: source.taskId, project: { ownerId } },
      });
      if (!task || (source.version !== null && task.version !== source.version))
        throw new HttpError(409, "CHAT_TASK_CHANGED");
    }
  }
}
export async function saveCitations(
  tx: Prisma.TransactionClient,
  input: {
    readonly ownerId: string;
    readonly messageId: string;
    readonly sources: readonly ChatSource[];
    readonly citations: readonly { sourceId: string; quote: string }[];
  },
) {
  await validateSources(tx, input.ownerId, input.sources);
  for (const citation of input.citations) {
    const source = input.sources.find(
      (value) => value.id === citation.sourceId,
    );
    if (!source) throw new HttpError(502, "INVALID_CHAT_CITATION");
    let start: number | null = null,
      end: number | null = null;
    if (source.kind === "TRANSCRIPT") {
      const offset = source.text.indexOf(citation.quote);
      if (
        !citation.quote ||
        offset < 0 ||
        source.text.indexOf(citation.quote, offset + 1) >= 0
      )
        throw new HttpError(502, "INVALID_CHAT_CITATION");
      start = (source.start ?? 0) + offset;
      end = start + citation.quote.length;
      const revision = await tx.transcriptRevision.findUnique({
        where: { id: source.revisionId ?? "" },
      });
      if (!revision || revision.rawText.slice(start, end) !== citation.quote)
        throw new HttpError(502, "INVALID_CHAT_CITATION");
    } else if (citation.quote && !source.text.includes(citation.quote))
      throw new HttpError(502, "INVALID_CHAT_CITATION");
    await tx.citation.create({
      data: {
        messageId: input.messageId,
        revisionId: source.revisionId,
        taskId: source.taskId,
        eventId: source.eventId,
        label: source.label,
        quote: citation.quote,
        startOffset: start,
        endOffset: end,
      },
    });
  }
  for (const source of input.sources) {
    if (
      !source.revisionId ||
      input.citations.some((c) => c.sourceId === source.id)
    )
      continue;
    await tx.citation.create({
      data: {
        messageId: input.messageId,
        revisionId: source.revisionId,
        label: source.label,
      },
    });
  }
}
export async function eligibleHistory(ownerId: string, conversationId: string) {
  const excluded = await unavailableMessages(ownerId);
  return database().chatMessage.findMany({
    where: {
      conversationId,
      conversation: { ownerId },
      state: "complete",
      contextEligible: true,
      id: { notIn: excluded.map((row) => row.id) },
      citations: { none: { sourceDeleted: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
}
