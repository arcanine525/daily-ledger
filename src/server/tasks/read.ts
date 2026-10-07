import { z } from "zod";
import { Prisma } from "../../generated/prisma/client";
import { HttpError } from "../auth/session";
import { database } from "../db/client";
import { statuses } from "./contracts";

export const filterSchema = z.object({
  projectId: z.uuid().optional(),
  status: z.enum(statuses).optional(),
  scope: z.enum(["ALL", "MINE", "UNASSIGNED"]).default("ALL"),
  meetingFrom: z.iso.date().optional(),
  meetingTo: z.iso.date().optional(),
  dueFrom: z.iso.date().optional(),
  dueTo: z.iso.date().optional(),
  overdue: z.enum(["true", "false"]).optional(),
  cursor: z.uuid().optional(),
});
export async function taskWhere(ownerId: string, input: unknown) {
  const result = filterSchema.safeParse(input);
  if (!result.success) throw new HttpError(422, "INVALID_TASK_FILTER");
  const filter = result.data;
  const db = database();
  let sourceIds: string[] | null = null;
  if (filter.meetingFrom || filter.meetingTo) {
    const rows = await db.$queryRaw<
      { id: string }[]
    >`SELECT m.id FROM "Meeting" m JOIN "Project" p ON p.id=m."projectId" WHERE p."ownerId"=${ownerId}::uuid AND m."deletedAt" IS NULL ${filter.meetingFrom ? Prisma.sql`AND (m."occurredAt" AT TIME ZONE m."meetingTimezone")::date >= ${filter.meetingFrom}::date` : Prisma.empty} ${filter.meetingTo ? Prisma.sql`AND (m."occurredAt" AT TIME ZONE m."meetingTimezone")::date <= ${filter.meetingTo}::date` : Prisma.empty}`;
    sourceIds = rows.map((row) => row.id);
  }
  const settings = await db.userSettings.findUnique({ where: { ownerId } }),
    today = new Intl.DateTimeFormat("sv-SE", {
      timeZone: settings?.timezone ?? "UTC",
    }).format(new Date());
  const where: Prisma.TaskWhereInput = {
    project: { ownerId },
    ...(filter.projectId ? { projectId: filter.projectId } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.scope === "MINE"
      ? { assignments: { some: { isSelfSnapshot: true } } }
      : filter.scope === "UNASSIGNED"
        ? { assignments: { none: {} } }
        : {}),
    ...(sourceIds
      ? {
          evidence: {
            some: { sourceDeleted: false, sourceMeetingId: { in: sourceIds } },
          },
        }
      : {}),
  };
  const dates: Prisma.DateTimeNullableFilter = {
    ...(filter.dueFrom ? { gte: new Date(`${filter.dueFrom}T00:00:00Z`) } : {}),
    ...(filter.dueTo ? { lte: new Date(`${filter.dueTo}T00:00:00Z`) } : {}),
    ...(filter.overdue === "true"
      ? { lt: new Date(`${today}T00:00:00Z`) }
      : {}),
  };
  if (Object.keys(dates).length) where.dueDate = dates;
  if (filter.overdue === "true")
    where.AND = [{ status: { notIn: ["DONE", "CANCELLED"] } }];
  return { where, filter };
}
export async function listTasks(ownerId: string, input: unknown) {
  const { where, filter } = await taskWhere(ownerId, input);
  const rows = await database().task.findMany({
    where,
    include: { assignments: true, evidence: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 101,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
  });
  const items = rows.slice(0, 100);
  return {
    items,
    total: await database().task.count({ where }),
    nextCursor: rows.length > 100 ? (items.at(-1)?.id ?? null) : null,
  };
}
export async function getTask(ownerId: string, id: string) {
  if (!z.uuid().safeParse(id).success)
    throw new HttpError(422, "INVALID_TASK_ID");
  const task = await database().task.findFirst({
    where: { id, project: { ownerId } },
    include: {
      assignments: true,
      evidence: true,
      events: { orderBy: [{ recordedAt: "desc" }, { id: "desc" }] },
      actions: { include: { meeting: true } },
    },
  });
  if (!task) throw new HttpError(404, "TASK_NOT_FOUND");
  return task;
}
export async function pendingProposals(ownerId: string) {
  return database().taskProposal.findMany({
    where: {
      state: { in: ["PENDING", "STALE"] },
      action: { meeting: { deletedAt: null, project: { ownerId } } },
    },
    include: {
      action: {
        include: {
          meeting: { include: { project: true } },
          occurrences: { include: { occurrence: true } },
        },
      },
      task: { include: { assignments: true } },
    },
    orderBy: { id: "asc" },
  });
}
