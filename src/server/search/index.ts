import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
export function normalizeSearch(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}
export async function indexMeeting(
  tx: Prisma.TransactionClient,
  meetingId: string,
) {
  const meeting = await tx.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    include: {
      revisions: {
        where: { meetingId },
        include: { segments: true },
        orderBy: { number: "desc" },
        take: 1,
      },
      activeAnalysis: true,
    },
  });
  await tx.searchDocument.deleteMany({ where: { meetingId } });
  if (meeting.deletedAt) return;
  const revision = meeting.revisions[0];
  if (!revision) return;
  const data = revision.segments.map((segment) => {
    const text = revision.rawText.slice(segment.startOffset, segment.endOffset);
    return {
      id: randomUUID(),
      projectId: meeting.projectId,
      meetingId,
      sourceId: segment.id,
      kind: "TRANSCRIPT",
      text,
      normalizedText: normalizeSearch(text),
    };
  });
  if (meeting.activeAnalysis?.revisionId === revision.id) {
    const text = JSON.stringify(meeting.activeAnalysis.summary);
    data.push({
      id: randomUUID(),
      projectId: meeting.projectId,
      meetingId,
      sourceId: meeting.activeAnalysis.id,
      kind: "SUMMARY",
      text,
      normalizedText: normalizeSearch(text),
    });
  }
  await tx.searchDocument.createMany({ data });
}
export async function indexTask(tx: Prisma.TransactionClient, taskId: string) {
  const task = await tx.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { assignments: true },
  });
  const text = `${task.title}\n${task.id}\n${task.assignments.map((person) => person.nameSnapshot).join(" ")}`;
  await tx.searchDocument.deleteMany({
    where: { sourceId: taskId, kind: "TASK" },
  });
  await tx.searchDocument.create({
    data: {
      projectId: task.projectId,
      sourceId: taskId,
      kind: "TASK",
      text,
      normalizedText: normalizeSearch(text),
    },
  });
}
