import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { HttpError } from "../auth/session";
import { indexMeeting } from "../search/index";
import type { Extraction } from "./contracts";
import type { NormalizedItem } from "./pipeline-contracts";
import { mapCheckpoint, matchSchema } from "./pipeline-contracts";
import { proposalPatch } from "./proposal-policy";
import { reconcile } from "./reconciliation";
import type { RunSnapshot } from "./run-snapshot";

const normalized = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();
function fingerprint(input: {
  meetingId: string;
  quote: string;
  kind: string;
  targetId: string | null;
  patch: unknown;
  before: unknown;
}) {
  return createHash("sha256")
    .update(JSON.stringify({ ...input, quote: normalized(input.quote) }))
    .digest("hex");
}
export async function publishAnalysis(
  tx: Prisma.TransactionClient,
  input: {
    readonly runId: string;
    readonly meetingId: string;
    readonly revisionId: string;
    readonly snapshot: RunSnapshot;
    readonly summary: Extraction["summary"];
  },
) {
  const checkpoints = await tx.analysisStep.findMany({
    where: { runId: input.runId, state: "succeeded" },
  });
  const unique = new Map<string, NormalizedItem>();
  for (const row of checkpoints.filter((r) => r.stepKey.startsWith("map:")))
    for (const item of mapCheckpoint.parse(row.checkpoint).items)
      unique.set(item.sourceKey, item);
  const suggestions = checkpoints
    .filter((r) => r.stepKey.startsWith("match:"))
    .flatMap((r) => matchSchema.parse(r.checkpoint).suggestions);
  const previous = await tx.meetingAction.findMany({
    where: { meetingId: input.meetingId },
    include: { occurrences: { include: { occurrence: true } } },
  });
  const protectedActions = previous.filter(
    (a) => a.manuallyEditedAt || a.reviewState === "ACCEPTED" || a.taskId,
  );
  await tx.meetingAction.updateMany({
    where: {
      meetingId: input.meetingId,
      reviewState: "PENDING",
      manuallyEditedAt: null,
      taskId: null,
    },
    data: { reviewState: "SUPERSEDED" },
  });
  await tx.meetingAction.updateMany({
    where: { id: { in: protectedActions.map((a) => a.id) } },
    data: { retainedMissing: true },
  });
  await tx.taskProposal.updateMany({
    where: { action: { meetingId: input.meetingId }, state: "PENDING" },
    data: { state: "SUPERSEDED" },
  });
  const latest = await tx.analysisVersion.findFirst({
    where: { meetingId: input.meetingId },
    orderBy: { number: "desc" },
  });
  const result = await tx.analysisVersion.create({
    data: {
      meetingId: input.meetingId,
      revisionId: input.revisionId,
      runId: input.runId,
      number: (latest?.number ?? 0) + 1,
      locale: input.snapshot.outputLocale,
      summary: {
        ...input.summary,
        todos: [...unique.values()]
          .filter((item) => item.kind === "ACTION")
          .map((item) => item.title),
      },
    },
  });
  for (const item of unique.values()) {
    const occurrence = await tx.todoOccurrence.create({
      data: {
        analysisId: result.id,
        kind: item.kind,
        title: item.title,
        assignees: item.assignees,
        evidence: item.evidence,
        dueDate: item.dueDate ? new Date(`${item.dueDate}T00:00:00Z`) : null,
      },
    });
    const related = suggestions.filter((s) => s.sourceKey === item.sourceKey);
    const suggestion = related[0];
    const target = suggestion
      ? input.snapshot.candidates.find((c) => c.id === suggestion.targetId)
      : undefined;
    if (suggestion && !target) throw new HttpError(502, "INVALID_MATCH_TARGET");
    const { logical, exact, cues } = reconcile(protectedActions, item, target);
    if (item.kind !== "ACTION" && !target && !logical) continue;
    const action =
      logical ??
      (await tx.meetingAction.create({
        data: {
          meetingId: input.meetingId,
          title: item.title,
          assignees: item.assignees,
          dueDate: item.dueDate ? new Date(`${item.dueDate}T00:00:00Z`) : null,
        },
      }));
    if (!logical || exact) {
      await tx.meetingActionOccurrence.create({
        data: { actionId: action.id, occurrenceId: occurrence.id },
      });
      if (logical)
        await tx.meetingAction.update({
          where: { id: logical.id },
          data: { retainedMissing: false },
        });
    }
    if (
      logical &&
      !suggestion &&
      exact &&
      (logical.reviewState === "ACCEPTED" || logical.taskId)
    )
      continue;
    const proposed = proposalPatch({
      item,
      target,
      suggestion,
      occurredAt: input.snapshot.occurredAt,
    });
    const { kind, patch } =
      logical && !exact ? { kind: "LINK" as const, patch: {} } : proposed;
    const effectiveTitle = logical?.title ?? item.title,
      effectiveDate = logical
        ? (logical.dueDate?.toISOString().slice(0, 10) ?? null)
        : item.dueDate;
    const effectiveAssignees = logical
      ? z
          .array(z.object({ id: z.string() }))
          .parse(logical.assignees)
          .map((a) => a.id)
      : item.assignees.map((a) => a.id);
    const changes =
      kind === "CREATE"
        ? {
            title: effectiveTitle,
            deadline: effectiveDate,
            assigneeIds: effectiveAssignees,
          }
        : patch;
    const before = target
      ? Object.fromEntries(
          Object.keys(patch).map((field) => [
            field,
            field === "deadline"
              ? target.dueDate
              : field === "status"
                ? target.status
                : field === "title"
                  ? target.title
                  : target.assigneeIds,
          ]),
        )
      : {};
    const hash = fingerprint({
      meetingId: input.meetingId,
      quote: item.evidence.quote,
      kind,
      targetId: target?.id ?? null,
      patch:
        kind === "CREATE"
          ? {
              deadline: effectiveDate,
              assigneeIds: [...effectiveAssignees].sort(),
              manualTitle: logical?.manuallyEditedAt ? logical.title : null,
            }
          : { ...patch, ...(patch.title ? { title: "__TITLE_CHANGE__" } : {}) },
      before,
    });
    if (
      await tx.proposalDecision.findFirst({
        where: { fingerprint: hash, outcome: "REJECTED" },
      })
    ) {
      if (!logical)
        await tx.meetingAction.update({
          where: { id: action.id },
          data: { reviewState: "REJECTED" },
        });
      continue;
    }
    const requiresReconciliation =
      Boolean(logical && !exact) ||
      target?.kind === "ACTION" ||
      suggestion?.uncertain ||
      related.length > 1;
    await tx.taskProposal.create({
      data: {
        actionId: action.id,
        taskId: target?.kind === "TASK" ? target.id : null,
        kind,
        expectedTaskVersion: target?.kind === "TASK" ? target.version : null,
        baseFieldVersions: Object.fromEntries(
          Object.keys(patch).map((field) => [
            field,
            target?.fieldVersions[field] ?? 1,
          ]),
        ),
        readFields: Object.keys(patch),
        writeFields: Object.keys(patch),
        changes: {
          before,
          after: changes,
          requiresReconciliation,
          occurrenceId: occurrence.id,
          logicalActionId: logical?.id ?? null,
          alternatives: [
            ...new Set([
              ...related.map((s) => s.targetId),
              ...cues.map((action) => action.id),
            ]),
          ],
        },
        evidence: item.evidence,
        sourceOccurredAt: new Date(input.snapshot.occurredAt),
        fingerprint: hash,
      },
    });
  }
  await tx.meeting.update({
    where: { id: input.meetingId },
    data: { activeAnalysisId: result.id },
  });
  await indexMeeting(tx, input.meetingId);
  return result;
}
