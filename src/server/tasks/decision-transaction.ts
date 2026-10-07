import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { evidenceSchema } from "../analysis/pipeline-contracts";
import { HttpError } from "../auth/session";
import { type decisionInput, proposalChanges } from "./contracts";
import { addEvidence } from "./links";
import { replayDecision } from "./receipts";
import { createTaskTx, event, hash, ownedTask } from "./transaction";
import { editTaskTx } from "./write";

export async function decideTx(
  tx: Prisma.TransactionClient,
  input: {
    readonly ownerId: string;
    readonly proposalId: string;
    readonly choice: z.infer<typeof decisionInput>;
    readonly key: string;
    readonly bulk: boolean;
  },
) {
  const receiptKey = `${input.ownerId}:${input.key}`,
    bodyHash = hash({
      proposalId: input.proposalId,
      choice: input.choice,
      bulk: input.bulk,
    });
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${receiptKey},3))`;
  const receipt = await replayDecision(
    tx,
    { kind: "KEY", value: receiptKey },
    bodyHash,
  );
  if (receipt) return receipt;
  await tx.$queryRaw`SELECT m.id FROM "Meeting" m JOIN "MeetingAction" a ON a."meetingId"=m.id JOIN "TaskProposal" p ON p."actionId"=a.id WHERE p.id=${input.proposalId}::uuid FOR UPDATE OF m`;
  const initial = await tx.taskProposal.findFirst({
    where: {
      id: input.proposalId,
      action: {
        meeting: { project: { ownerId: input.ownerId }, deletedAt: null },
      },
    },
  });
  if (!initial) throw new HttpError(404, "PROPOSAL_NOT_FOUND");
  const targetId = input.choice.targetTaskId ?? initial.taskId;
  if (targetId)
    await tx.$queryRaw`SELECT id FROM "Task" WHERE id=${targetId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "TaskProposal" WHERE id=${initial.id}::uuid FOR UPDATE`;
  const proposal = await tx.taskProposal.findUniqueOrThrow({
    where: { id: initial.id },
    include: { action: { include: { meeting: true } } },
  });
  if (proposal.state !== "PENDING") {
    const cached = await replayDecision(
      tx,
      { kind: "PROPOSAL", value: proposal.id },
      bodyHash,
    );
    if (cached) return cached;
    throw new HttpError(409, "PROPOSAL_NOT_PENDING");
  }
  const changes = proposalChanges.parse(proposal.changes),
    source = evidenceSchema.parse(proposal.evidence);
  const revision = await tx.transcriptRevision.findFirst({
    where: { id: source.revisionId, meetingId: proposal.action.meetingId },
  });
  if (
    !revision ||
    revision.number !== proposal.action.meeting.currentRevisionNumber
  )
    throw new HttpError(409, "SOURCE_CHANGED");
  if (
    input.bulk &&
    (proposal.kind !== "CREATE" || changes.requiresReconciliation)
  )
    throw new HttpError(422, "BULK_CREATE_ONLY");
  let taskId: string | null = null;
  if (input.choice.decision === "ACCEPT") {
    if (changes.requiresReconciliation && !input.choice.resolution)
      throw new HttpError(422, "RECONCILIATION_REQUIRED");
    const separate = input.choice.resolution === "CREATE_SEPARATE";
    const kind = separate
      ? "CREATE"
      : input.choice.resolution === "LINK_EXISTING"
        ? "LINK"
        : proposal.kind;
    let action = proposal.action;
    if (separate) {
      const occurrence = changes.occurrenceId
        ? await tx.todoOccurrence.findFirst({
            where: {
              id: changes.occurrenceId,
              analysis: { meetingId: action.meetingId },
            },
          })
        : null;
      if (!occurrence || occurrence.kind !== "ACTION")
        throw new HttpError(422, "ACTION_SOURCE_REQUIRED");
      action = await tx.meetingAction.create({
        data: {
          meetingId: action.meetingId,
          title: occurrence.title,
          assignees: z
            .array(
              z.object({
                id: z.string(),
                name: z.string(),
                isSelf: z.boolean(),
                mappingVersion: z.number().optional(),
              }),
            )
            .parse(occurrence.assignees),
          dueDate: occurrence.dueDate,
        },
        include: { meeting: true },
      });
      await tx.meetingActionOccurrence.create({
        data: { actionId: action.id, occurrenceId: occurrence.id },
      });
    }
    switch (kind) {
      case "CREATE": {
        if (action.taskId) throw new HttpError(409, "ACTION_ALREADY_LINKED");
        const people = z
            .array(z.object({ id: z.string() }))
            .parse(action.assignees),
          override = input.choice.overrides;
        const task = await createTaskTx(tx, {
          ownerId: input.ownerId,
          projectId: action.meeting.projectId,
          title: override?.title ?? action.title,
          status: input.bulk ? "TODO" : (override?.status ?? "TODO"),
          deadline:
            override?.deadline !== undefined
              ? override.deadline
              : (action.dueDate?.toISOString().slice(0, 10) ?? null),
          assigneeIds: override?.assigneeIds ?? people.map((p) => p.id),
          origin: "APPROVED_TODO",
          ...(override?.assigneeIds === undefined
            ? { source: action.assignees }
            : {}),
        });
        await event(tx, {
          task,
          kind: "CREATE",
          before: {},
          fields: ["title", "status", "deadline", "assigneeIds"],
          sourceAt: proposal.sourceOccurredAt,
        });
        await addEvidence(tx, {
          ownerId: input.ownerId,
          taskId: task.id,
          actionId: action.id,
          evidence: proposal.evidence,
          sourceAt: proposal.sourceOccurredAt,
          recordEvent: false,
        });
        taskId = task.id;
        break;
      }
      case "LINK": {
        const id = targetId ?? action.taskId;
        if (!id) throw new HttpError(422, "TARGET_TASK_REQUIRED");
        await addEvidence(tx, {
          ownerId: input.ownerId,
          taskId: id,
          actionId: action.id,
          evidence: proposal.evidence,
          sourceAt: proposal.sourceOccurredAt,
        });
        taskId = id;
        break;
      }
      case "UPDATE": {
        if (!proposal.taskId || input.choice.overrides)
          throw new HttpError(422, "INVALID_UPDATE_DECISION");
        const task = await ownedTask(tx, input.ownerId, proposal.taskId);
        if (task.projectId !== action.meeting.projectId)
          throw new HttpError(422, "CROSS_PROJECT_LINK");
        const current = z
            .record(z.string(), z.number().int())
            .parse(task.fieldVersions),
          base = z
            .record(z.string(), z.number().int())
            .parse(proposal.baseFieldVersions);
        if (
          [...proposal.readFields, ...proposal.writeFields].some(
            (field) => (current[field] ?? 1) !== (base[field] ?? 1),
          )
        )
          throw new HttpError(409, "PROPOSAL_STALE");
        if (changes.after.status) {
          const latest = await tx.taskEvent.findFirst({
            where: { taskId: task.id, changedFields: { has: "status" } },
            orderBy: { recordedAt: "desc" },
          });
          if (
            (latest?.recordedAt ?? task.createdAt) > proposal.sourceOccurredAt
          )
            throw new HttpError(409, "OLDER_STATUS_EVIDENCE");
        }
        await editTaskTx(tx, {
          ownerId: input.ownerId,
          taskId: task.id,
          patch: { ...changes.after, expectedVersion: task.version },
          sourceAt: proposal.sourceOccurredAt,
        });
        await addEvidence(tx, {
          ownerId: input.ownerId,
          taskId: task.id,
          actionId: action.id,
          evidence: proposal.evidence,
          sourceAt: proposal.sourceOccurredAt,
        });
        taskId = task.id;
        break;
      }
    }
    if (changes.requiresReconciliation && changes.occurrenceId && !separate) {
      await tx.meetingActionOccurrence.upsert({
        where: {
          actionId_occurrenceId: {
            actionId: action.id,
            occurrenceId: changes.occurrenceId,
          },
        },
        create: { actionId: action.id, occurrenceId: changes.occurrenceId },
        update: {},
      });
      await tx.meetingAction.update({
        where: { id: action.id },
        data: { retainedMissing: false },
      });
    }
  }
  const outcome = input.choice.decision === "ACCEPT" ? "ACCEPTED" : "REJECTED";
  await tx.taskProposal.update({
    where: { id: proposal.id },
    data: { state: outcome },
  });
  if (outcome === "REJECTED" && proposal.kind === "CREATE")
    await tx.meetingAction.update({
      where: { id: proposal.actionId },
      data: { reviewState: "REJECTED" },
    });
  const result = { taskId, decision: input.choice.decision };
  await tx.proposalDecision.create({
    data: {
      idempotencyKey: receiptKey,
      fingerprint: proposal.fingerprint,
      outcome,
      ...(input.choice.reason ? { reason: input.choice.reason } : {}),
      payload: {
        proposalId: proposal.id,
        meetingId: proposal.action.meetingId,
        inputHash: bodyHash,
        result,
      },
    },
  });
  return result;
}
