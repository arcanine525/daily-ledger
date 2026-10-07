import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { HttpError } from "../auth/session";
import { database } from "../db/client";
import { createInput, editInput } from "./contracts";
import {
  assignments,
  createTaskTx,
  event,
  hash,
  ownedTask,
  snapshot,
} from "./transaction";

export async function createTask(ownerId: string, input: unknown, key: string) {
  const parsed = createInput.safeParse(input);
  if (!parsed.success || !key || key.length > 120)
    throw new HttpError(422, "INVALID_TASK");
  const bodyHash = hash(parsed.data),
    receiptKey = `${ownerId}:${key}`;
  return database().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${receiptKey},2))`;
    const old = await tx.taskEvent.findUnique({
      where: { idempotencyKey: receiptKey },
      include: { task: { include: { assignments: true } } },
    });
    if (old) {
      if (old.inputHash !== bodyHash)
        throw new HttpError(409, "IDEMPOTENCY_CONFLICT");
      return old.task;
    }
    const task = await createTaskTx(tx, {
      ownerId,
      ...parsed.data,
      origin: "MANUAL",
    });
    await event(tx, {
      task,
      kind: "CREATE",
      before: {},
      fields: ["title", "status", "deadline", "assigneeIds"],
      receipt: { key: receiptKey, hash: bodyHash },
    });
    return task;
  });
}
export async function editTaskTx(
  tx: Prisma.TransactionClient,
  input: {
    readonly ownerId: string;
    readonly taskId: string;
    readonly patch: z.infer<typeof editInput>;
    readonly sourceAt?: Date;
  },
) {
  await tx.$queryRaw`SELECT id FROM "Task" WHERE id=${input.taskId}::uuid FOR UPDATE`;
  const previous = await ownedTask(tx, input.ownerId, input.taskId);
  if (previous.version !== input.patch.expectedVersion)
    throw new HttpError(409, "TASK_VERSION_CONFLICT");
  const before = snapshot(previous),
    patch = input.patch;
  const fields: string[] = [];
  if (patch.title !== undefined && patch.title !== before.title)
    fields.push("title");
  if (patch.status !== undefined && patch.status !== before.status)
    fields.push("status");
  if (patch.deadline !== undefined && patch.deadline !== before.deadline)
    fields.push("deadline");
  if (
    patch.assigneeIds !== undefined &&
    JSON.stringify([...new Set(patch.assigneeIds)].sort()) !==
      JSON.stringify(before.assigneeIds)
  )
    fields.push("assigneeIds");
  if (!fields.length) return previous;
  const version = previous.version + 1,
    versions = z
      .record(z.string(), z.number().int())
      .parse(previous.fieldVersions);
  for (const field of fields) versions[field] = version;
  const updated = await tx.task.update({
    where: { id: previous.id },
    data: {
      version,
      fieldVersions: versions,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.deadline !== undefined
        ? {
            dueDate: patch.deadline
              ? new Date(`${patch.deadline}T00:00:00Z`)
              : null,
          }
        : {}),
      ...(fields.includes("assigneeIds") && patch.assigneeIds !== undefined
        ? {
            assignments: {
              deleteMany: {},
              create: await assignments(tx, {
                projectId: previous.projectId,
                ids: patch.assigneeIds,
              }),
            },
          }
        : {}),
    },
    include: { assignments: true },
  });
  const pending = await tx.taskProposal.findMany({
    where: { taskId: previous.id, state: "PENDING" },
  });
  const stale = pending
    .filter((p) =>
      [...p.readFields, ...p.writeFields].some((field) =>
        fields.includes(field),
      ),
    )
    .map((p) => p.id);
  await tx.taskProposal.updateMany({
    where: { id: { in: stale } },
    data: { state: "STALE" },
  });
  await event(tx, {
    task: updated,
    kind: "EDIT",
    before,
    fields,
    ...(input.sourceAt ? { sourceAt: input.sourceAt } : {}),
  });
  return updated;
}
export async function editTask(ownerId: string, id: string, input: unknown) {
  const parsed = editInput.safeParse(input);
  if (!parsed.success || !z.uuid().safeParse(id).success)
    throw new HttpError(422, "INVALID_TASK_EDIT");
  return database().$transaction((tx) =>
    editTaskTx(tx, { ownerId, taskId: id, patch: parsed.data }),
  );
}
