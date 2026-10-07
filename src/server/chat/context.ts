import type { z } from "zod";
import { Prisma } from "../../generated/prisma/client";
import { chunks } from "../analysis/chunking";
import { database } from "../db/client";
import { search } from "../search/retrieve";
import type { ChatFilters, ChatSource, planSchema } from "./contracts";
import { taskContext } from "./task-context";

export async function scopedMeetings(
  ownerId: string,
  filters: ChatFilters,
  asOf?: string | null,
) {
  return database().$queryRaw<
    { id: string }[]
  >`SELECT m.id FROM "Meeting" m JOIN "Project" p ON p.id=m."projectId" WHERE p."ownerId"=${ownerId}::uuid AND m."deletedAt" IS NULL ${filters.projectId ? Prisma.sql`AND m."projectId"=${filters.projectId}::uuid` : Prisma.empty} ${filters.meetingId ? Prisma.sql`AND m.id=${filters.meetingId}::uuid` : Prisma.empty} ${filters.from ? Prisma.sql`AND (m."occurredAt" AT TIME ZONE m."meetingTimezone")::date>=${filters.from}::date` : Prisma.empty} ${filters.to ? Prisma.sql`AND (m."occurredAt" AT TIME ZONE m."meetingTimezone")::date<=${filters.to}::date` : Prisma.empty} ${asOf ? Prisma.sql`AND m."occurredAt"<=${new Date(asOf)}` : Prisma.empty} ORDER BY m."occurredAt",m.id`;
}
export async function retrieveContext(
  ownerId: string,
  filters: ChatFilters,
  plan: z.infer<typeof planSchema>,
) {
  const db = database(),
    sources: ChatSource[] = [],
    meetingIds: string[] = [];
  let sections: Prisma.InputJsonValue = {},
    totals: { confirmed: number; pending: number } | null = null;
  if (plan.intent === "CLARIFY")
    return {
      sources,
      sections,
      totals,
      coverage: { exhaustive: true, meetingIds },
    };
  if (plan.intent === "LOOKUP") {
    const rows = await search(ownerId, {
      query: plan.englishQuery,
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.meetingId ? { meetingId: filters.meetingId } : {}),
      ...(filters.from ? { from: filters.from } : {}),
      ...(filters.to ? { to: filters.to } : {}),
      limit: 100,
    });
    const perMeeting = new Map<string, number>();
    for (const hit of rows.items) {
      if (sources.length >= 12) break;
      if (
        hit.kind !== "TRANSCRIPT" ||
        !hit.revisionId ||
        hit.startOffset === null ||
        hit.endOffset === null
      )
        continue;
      const key = hit.meetingId ?? "";
      if ((perMeeting.get(key) ?? 0) >= 3) continue;
      perMeeting.set(key, (perMeeting.get(key) ?? 0) + 1);
      sources.push({
        id: hit.sourceId,
        kind: "TRANSCRIPT",
        label: hit.meetingTitle ?? "Meeting",
        text: hit.text,
        meetingId: hit.meetingId,
        revisionId: hit.revisionId,
        taskId: null,
        eventId: null,
        version: null,
        start: hit.startOffset,
        end: hit.endOffset,
      });
    }
    return {
      sources,
      sections,
      totals,
      coverage: { exhaustive: false, meetingIds: [...perMeeting.keys()] },
    };
  }
  if (["LIST_TASKS", "TASK_COUNTS", "TASK_HISTORY"].includes(plan.intent)) {
    const allowed = await scopedMeetings(ownerId, filters);
    const tasks = await taskContext(
      ownerId,
      filters,
      plan,
      allowed.map((m) => m.id),
    );
    sources.push(...tasks.sources);
    sections = tasks.sections;
    totals = tasks.totals;
    if (plan.intent !== "TASK_HISTORY")
      return {
        sources,
        sections,
        totals,
        coverage: { exhaustive: true, meetingIds: allowed.map((m) => m.id) },
      };
  }
  const meetings = await scopedMeetings(
    ownerId,
    filters,
    plan.intent === "TASK_HISTORY" ? plan.asOf : null,
  );
  const briefings = [];
  for (let offset = 0; offset < meetings.length; offset += 20) {
    const batch = await db.meeting.findMany({
      where: {
        id: { in: meetings.slice(offset, offset + 20).map((m) => m.id) },
      },
      include: {
        revisions: { orderBy: { number: "desc" }, take: 1 },
        activeAnalysis: true,
      },
    });
    for (const meeting of batch) {
      meetingIds.push(meeting.id);
      const revision = meeting.revisions[0];
      if (!revision) continue;
      briefings.push({
        meetingId: meeting.id,
        title: meeting.title,
        occurredAt: meeting.occurredAt.toISOString(),
        summary:
          meeting.activeAnalysis?.revisionId === revision.id
            ? meeting.activeAnalysis.summary
            : null,
      });
      for (const [index, chunk] of chunks(revision.rawText, 6000).entries())
        sources.push({
          id: `${revision.id}:${index}`,
          kind: "TRANSCRIPT",
          label: meeting.title,
          text: chunk.text,
          meetingId: meeting.id,
          revisionId: revision.id,
          taskId: null,
          eventId: null,
          version: null,
          start: chunk.start,
          end: chunk.end,
        });
    }
  }
  sections = {
    ...(typeof sections === "object" && !Array.isArray(sections)
      ? sections
      : {}),
    meetingEvidence: briefings,
  };
  return {
    sources,
    sections,
    totals,
    coverage: { exhaustive: true, meetingIds },
  };
}
