import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { database } from "../db/client";
import { taskWhere } from "../tasks/read";
import type { ChatFilters, ChatSource, planSchema } from "./contracts";

const stateSchema = z.object({
  title: z.string(),
  status: z.string(),
  deadline: z.string().nullable(),
  assignees: z.array(
    z.object({ id: z.string(), name: z.string(), isSelf: z.boolean() }),
  ),
});

export async function taskContext(
  ownerId: string,
  filters: ChatFilters,
  plan: z.infer<typeof planSchema>,
  meetingIds: readonly string[],
) {
  const db = database(),
    historical = plan.intent === "TASK_HISTORY",
    sources: ChatSource[] = [];
  const range = await taskWhere(ownerId, {
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(!historical
      ? {
          scope: filters.scope,
          ...(filters.dueFrom ? { dueFrom: filters.dueFrom } : {}),
          ...(filters.dueTo ? { dueTo: filters.dueTo } : {}),
        }
      : {}),
  });
  const where: Prisma.TaskWhereInput = {
    ...range.where,
    ...(filters.meetingId || filters.from || filters.to
      ? {
          evidence: {
            some: {
              sourceDeleted: false,
              sourceMeetingId: { in: [...meetingIds] },
            },
          },
        }
      : {}),
  };
  const tasks = await db.task.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        assignments: true,
        events: { orderBy: [{ recordedAt: "desc" }, { id: "desc" }] },
      },
    }),
    app = [];
  for (const task of tasks) {
    const cutoff = historical && plan.asOf ? new Date(plan.asOf) : null;
    if (cutoff && task.createdAt > cutoff) continue;
    const event = task.events.find(
      (event) => !cutoff || event.recordedAt <= cutoff,
    );
    if (cutoff && !event) continue;
    const state = stateSchema.parse(
      event?.after ?? {
        title: task.title,
        status: task.status,
        deadline: task.dueDate?.toISOString().slice(0, 10) ?? null,
        assignees: task.assignments.map((person) => ({
          id: person.participantId,
          name: person.nameSnapshot,
          isSelf: person.isSelfSnapshot,
        })),
      },
    );
    if (
      historical &&
      ((filters.scope === "MINE" && !state.assignees.some((p) => p.isSelf)) ||
        (filters.scope === "UNASSIGNED" && state.assignees.length) ||
        (filters.dueFrom &&
          (!state.deadline || state.deadline < filters.dueFrom)) ||
        (filters.dueTo && (!state.deadline || state.deadline > filters.dueTo)))
    )
      continue;
    if (!historical && ["DONE", "CANCELLED"].includes(state.status)) continue;
    const id = event?.id ?? task.id;
    sources.push({
      id,
      kind: event ? "TASK_EVENT" : "TASK",
      label: `${state.title} · ${event?.kind ?? "current"}`,
      text: JSON.stringify(state),
      meetingId: null,
      revisionId: null,
      taskId: task.id,
      eventId: event?.id ?? null,
      version: cutoff ? null : task.version,
      start: null,
      end: null,
    });
    app.push({ taskId: task.id, sourceId: id, state });
  }
  const pending = historical
      ? []
      : await db.meetingAction.findMany({
          where: {
            meetingId: { in: [...meetingIds] },
            reviewState: "PENDING",
            taskId: null,
            retainedMissing: false,
            occurrences: {
              some: {
                occurrence: { analysis: { activeFor: { isNot: null } } },
              },
            },
          },
          include: {
            meeting: {
              include: { revisions: { orderBy: { number: "desc" }, take: 1 } },
            },
            proposals: {
              where: { state: "PENDING" },
              select: { changes: true },
            },
          },
        }),
    waiting = [];
  for (const item of pending) {
    const assignees = z
      .array(
        z.object({
          id: z.string().optional(),
          name: z.string(),
          isSelf: z.boolean().optional(),
        }),
      )
      .parse(item.assignees);
    if (
      (filters.scope === "UNASSIGNED" && assignees.length) ||
      (filters.scope === "MINE" && !assignees.some((p) => p.isSelf)) ||
      (filters.dueFrom &&
        (!item.dueDate || item.dueDate < new Date(filters.dueFrom))) ||
      (filters.dueTo &&
        (!item.dueDate || item.dueDate > new Date(filters.dueTo)))
    )
      continue;
    const suspectDuplicate = item.proposals.some(
      (p) =>
        z
          .object({ requiresReconciliation: z.boolean().optional() })
          .parse(p.changes).requiresReconciliation === true,
    );
    const row = {
      id: item.id,
      title: item.title,
      assignees,
      deadline: item.dueDate?.toISOString().slice(0, 10) ?? null,
      suspectDuplicate,
    };
    waiting.push(row);
    sources.push({
      id: item.id,
      kind: "PENDING",
      label: item.title,
      text: JSON.stringify(row),
      meetingId: item.meetingId,
      revisionId: item.meeting.revisions[0]?.id ?? null,
      taskId: null,
      eventId: null,
      version: item.version,
      start: null,
      end: null,
    });
  }
  return {
    sources,
    sections: { appState: app, pendingTodos: waiting },
    totals: {
      confirmed: await db.task.count({
        where: { id: { in: app.map((row) => row.taskId) } },
      }),
      pending: await db.meetingAction.count({
        where: { id: { in: waiting.map((row) => row.id) } },
      }),
    },
  };
}
