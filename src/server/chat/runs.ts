import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { HttpError } from "../auth/session";
import { database } from "../db/client";
import { snapshotSchema } from "./contracts";
import { unavailableMessages } from "./history";
export type ChatClaim = {
  readonly runId: string;
  readonly stepKey: string;
  readonly fence: number;
  readonly ownerId: string;
};
export async function getRun(ownerId: string, id: string) {
  if (!z.uuid().safeParse(id).success)
    throw new HttpError(422, "INVALID_CHAT_RUN");
  const run = await database().chatRun.findFirst({
    where: { id, conversation: { ownerId } },
    include: { steps: true, profile: true },
  });
  if (!run) throw new HttpError(404, "CHAT_RUN_NOT_FOUND");
  return run;
}
export async function claimChat(input: {
  readonly ownerId: string;
  readonly runId: string;
  readonly stepKey: string;
}) {
  if (!z.uuid().safeParse(input.runId).success)
    throw new HttpError(422, "INVALID_CHAT_RUN");
  return database().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ChatRun" WHERE id=${input.runId}::uuid FOR UPDATE`;
    const run = await tx.chatRun.findFirst({
      where: { id: input.runId, conversation: { ownerId: input.ownerId } },
      include: { steps: true },
    });
    if (!run) throw new HttpError(404, "CHAT_RUN_NOT_FOUND");
    const snapshot = snapshotSchema.parse(run.snapshot),
      step = run.steps.find((value) => value.stepKey === input.stepKey);
    if (!step) throw new HttpError(422, "INVALID_CHAT_STEP");
    if (["CANCELLED", "FAILED"].includes(run.state))
      throw new HttpError(409, "CHAT_RUN_INACTIVE");
    if (step.state === "succeeded")
      return { kind: "replay" as const, completed: run.state === "COMPLETED" };
    if (
      snapshot.steps.find(
        (key) =>
          run.steps.find((value) => value.stepKey === key)?.state !==
          "succeeded",
      ) !== step.stepKey
    )
      throw new HttpError(409, "CHAT_STEP_OUT_OF_ORDER");
    if (run.leaseUntil && run.leaseUntil > new Date())
      throw new HttpError(409, "CHAT_STEP_BUSY");
    const retry = z.object({ retryAt: z.number() }).safeParse(step.checkpoint);
    if (retry.success && retry.data.retryAt > Date.now())
      throw new HttpError(429, "RETRY_AFTER_REQUIRED", {
        retryAfterSeconds: Math.ceil((retry.data.retryAt - Date.now()) / 1000),
      });
    const unavailable = await unavailableMessages(input.ownerId, tx);
    if (
      unavailable.some(
        (row) =>
          snapshot.contextMessageIds.includes(row.id) ||
          row.id === snapshot.userMessageId,
      )
    )
      throw new HttpError(409, "CHAT_CONTEXT_UNAVAILABLE");
    const fence = run.fencingVersion + 1;
    await tx.chatRun.update({
      where: { id: run.id },
      data: {
        state: "RUNNING",
        fencingVersion: fence,
        leaseUntil: new Date(Date.now() + 240000),
      },
    });
    await tx.chatStep.update({
      where: { runId_stepKey: { runId: run.id, stepKey: step.stepKey } },
      data: { state: "running", attempt: { increment: 1 } },
    });
    return {
      kind: "claimed" as const,
      claim: {
        runId: run.id,
        stepKey: step.stepKey,
        fence,
        ownerId: input.ownerId,
      },
    };
  });
}
export async function completeChat(
  claim: ChatClaim,
  checkpoint: Prisma.InputJsonValue,
  commit?: (tx: Prisma.TransactionClient) => Promise<void>,
) {
  return database().$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${claim.ownerId},2))`;
      await tx.$queryRaw`SELECT id FROM "ChatRun" WHERE id=${claim.runId}::uuid FOR UPDATE`;
      const run = await tx.chatRun.findFirst({
        where: {
          id: claim.runId,
          state: "RUNNING",
          fencingVersion: claim.fence,
          leaseUntil: { gt: new Date() },
          conversation: { ownerId: claim.ownerId },
        },
      });
      if (!run) throw new HttpError(409, "STALE_CHAT_CLAIM");
      if (commit) await commit(tx);
      await tx.chatStep.update({
        where: { runId_stepKey: { runId: run.id, stepKey: claim.stepKey } },
        data: { state: "succeeded", checkpoint },
      });
      const left = await tx.chatStep.count({
        where: { runId: run.id, state: { not: "succeeded" } },
      });
      await tx.chatRun.update({
        where: { id: run.id },
        data: { state: left ? "READY" : "COMPLETED", leaseUntil: null },
      });
      return { completed: left === 0 };
    },
    { timeout: 60000 },
  );
}
export async function failChat(claim: ChatClaim, error: HttpError) {
  await database().$transaction(async (tx) => {
    const changed = await tx.chatRun.updateMany({
      where: { id: claim.runId, state: "RUNNING", fencingVersion: claim.fence },
      data: {
        state: error.retryable ? "PAUSED_RETRYABLE" : "FAILED",
        leaseUntil: null,
        fencingVersion: { increment: 1 },
      },
    });
    if (!changed.count) throw new HttpError(409, "STALE_CHAT_CLAIM");
    await tx.chatStep.update({
      where: { runId_stepKey: { runId: claim.runId, stepKey: claim.stepKey } },
      data: {
        state: error.retryable ? "retryable_failed" : "failed",
        checkpoint: {
          error: error.code,
          retryAt: Date.now() + error.retryAfterSeconds * 1000,
        },
      },
    });
    if (!error.retryable)
      await tx.chatMessage.update({
        where: {
          id: snapshotSchema.parse(
            (await tx.chatRun.findUniqueOrThrow({ where: { id: claim.runId } }))
              .snapshot,
          ).assistantMessageId,
        },
        data: { state: "failed", contextEligible: false },
      });
  });
}
export async function cancelChat(ownerId: string, runId: string) {
  await getRun(ownerId, runId);
  return database().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ChatRun" WHERE id=${runId}::uuid FOR UPDATE`;
    const run = await tx.chatRun.findUniqueOrThrow({ where: { id: runId } });
    if (run.state === "COMPLETED")
      throw new HttpError(409, "CHAT_RUN_COMPLETED");
    await tx.chatRun.update({
      where: { id: runId },
      data: {
        state: "CANCELLED",
        fencingVersion: { increment: 1 },
        leaseUntil: null,
      },
    });
    await tx.chatMessage.update({
      where: { id: snapshotSchema.parse(run.snapshot).assistantMessageId },
      data: { state: "cancelled", contextEligible: false },
    });
    return { cancelled: true };
  });
}
