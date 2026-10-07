import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { HttpError } from "../auth/session";

export type TaskRow = Prisma.TaskGetPayload<{ include: { assignments: true } }>;
export const hash = (input: unknown) =>
  createHash("sha256").update(JSON.stringify(input)).digest("hex");
export function snapshot(task: TaskRow) {
  return {
    title: task.title,
    status: task.status,
    deadline: task.dueDate?.toISOString().slice(0, 10) ?? null,
    assigneeIds: task.assignments.map((a) => a.participantId).sort(),
    assignees: task.assignments.map((a) => ({
      id: a.participantId,
      name: a.nameSnapshot,
      mappingVersion: a.mappingVersion,
      isSelf: a.isSelfSnapshot,
    })),
    version: task.version,
  };
}
export async function ownedTask(
  tx: Prisma.TransactionClient,
  ownerId: string,
  id: string,
) {
  if (!z.uuid().safeParse(id).success)
    throw new HttpError(422, "INVALID_TASK_ID");
  const task = await tx.task.findFirst({
    where: { id, project: { ownerId } },
    include: { assignments: true },
  });
  if (!task) throw new HttpError(404, "TASK_NOT_FOUND");
  return task;
}
export async function assignments(
  tx: Prisma.TransactionClient,
  input: {
    readonly projectId: string;
    readonly ids: readonly string[];
    readonly source?: Prisma.JsonValue;
  },
) {
  const ids = [...new Set(input.ids)],
    rows = await tx.projectParticipant.findMany({
      where: { id: { in: ids }, projectId: input.projectId },
    });
  if (rows.length !== ids.length) throw new HttpError(422, "INVALID_ASSIGNEES");
  const source = z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        isSelf: z.boolean(),
        mappingVersion: z.number().optional(),
      }),
    )
    .safeParse(input.source);
  return rows.map((person) => {
    const old = source.success
      ? source.data.find((p) => p.id === person.id)
      : undefined;
    return {
      participantId: person.id,
      nameSnapshot: old?.name ?? person.displayName,
      mappingVersion: old?.mappingVersion ?? person.mappingVersion,
      isSelfSnapshot: old?.isSelf ?? person.isSelf,
    };
  });
}
export async function event(
  tx: Prisma.TransactionClient,
  input: {
    readonly task: TaskRow;
    readonly kind: string;
    readonly before: Prisma.InputJsonValue;
    readonly fields: readonly string[];
    readonly sourceAt?: Date;
    readonly receipt?: { key: string; hash: string };
  },
) {
  const now = new Date();
  return tx.taskEvent.create({
    data: {
      taskId: input.task.id,
      kind: input.kind,
      before: input.before,
      after: snapshot(input.task),
      changedFields: [...input.fields],
      recordedAt: now,
      effectiveAt: now,
      ...(input.sourceAt ? { sourceOccurredAt: input.sourceAt } : {}),
      ...(input.receipt
        ? { idempotencyKey: input.receipt.key, inputHash: input.receipt.hash }
        : {}),
    },
  });
}
export async function createTaskTx(
  tx: Prisma.TransactionClient,
  input: {
    readonly ownerId: string;
    readonly projectId: string;
    readonly title: string;
    readonly status: TaskRow["status"];
    readonly deadline: string | null;
    readonly assigneeIds: readonly string[];
    readonly origin: string;
    readonly source?: Prisma.JsonValue;
  },
) {
  const project = await tx.project.findFirst({
    where: { id: input.projectId, ownerId: input.ownerId },
  });
  if (!project) throw new HttpError(422, "INVALID_PROJECT");
  return tx.task.create({
    data: {
      projectId: input.projectId,
      title: input.title,
      status: input.status,
      dueDate: input.deadline ? new Date(`${input.deadline}T00:00:00Z`) : null,
      origin: input.origin,
      assignments: {
        create: await assignments(tx, {
          projectId: input.projectId,
          ids: input.assigneeIds,
          ...(input.source !== undefined ? { source: input.source } : {}),
        }),
      },
    },
    include: { assignments: true },
  });
}
