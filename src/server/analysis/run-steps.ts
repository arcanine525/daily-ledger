import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { HttpError } from "../auth/session";
import { database } from "../db/client";
import { runSnapshot } from "./run-snapshot";

export type Claim = {
  readonly kind: "claimed";
  readonly runId: string;
  readonly stepKey: string;
  readonly fence: number;
  readonly ownerId: string;
};
export type Replay = {
  readonly kind: "replay";
  readonly checkpoint: Prisma.JsonValue;
};
export async function claimStep(input: {
  readonly ownerId: string;
  readonly runId: string;
  readonly stepKey: string;
}): Promise<Claim | Replay> {
  return database().$transaction(async (db) => {
    await db.$queryRaw`SELECT id FROM "AnalysisRun" WHERE id=${input.runId}::uuid FOR UPDATE`;
    const run = await db.analysisRun.findFirst({
      where: {
        id: input.runId,
        meeting: { project: { ownerId: input.ownerId } },
      },
      include: {
        steps: true,
        meeting: true,
        profile: { include: { profile: true } },
      },
    });
    if (!run) throw new HttpError(404, "RUN_NOT_FOUND");
    const snapshot = runSnapshot.parse(run.snapshot);
    if (
      run.meeting.deletedAt ||
      run.meeting.currentRevisionNumber !== snapshot.revisionNumber ||
      run.profile.profile.deletedAt ||
      ["CANCELLED", "FAILED"].includes(run.state)
    )
      throw new HttpError(409, "RUN_STALE");
    const step = run.steps.find((s) => s.stepKey === input.stepKey);
    if (!step) throw new HttpError(422, "INVALID_STEP");
    if (step.state === "succeeded" && step.checkpoint !== null)
      return { kind: "replay", checkpoint: step.checkpoint };
    const next = snapshot.steps.find(
      (key) => run.steps.find((s) => s.stepKey === key)?.state !== "succeeded",
    );
    if (next !== input.stepKey) throw new HttpError(409, "STEP_OUT_OF_ORDER");
    const retry = z.object({ retryAt: z.number() }).safeParse(step.error);
    if (retry.success && retry.data.retryAt > Date.now())
      throw new HttpError(429, "RETRY_AFTER_REQUIRED", {
        retryAfterSeconds: Math.ceil((retry.data.retryAt - Date.now()) / 1000),
      });
    if (run.leaseUntil && run.leaseUntil.getTime() > Date.now())
      throw new HttpError(409, "STEP_BUSY");
    const fence = run.fencingVersion + 1;
    await db.analysisRun.update({
      where: { id: run.id },
      data: {
        state: "RUNNING",
        fencingVersion: fence,
        leaseUntil: new Date(Date.now() + 240000),
      },
    });
    await db.analysisStep.update({
      where: { runId_stepKey: { runId: run.id, stepKey: step.stepKey } },
      data: { state: "running", attempt: { increment: 1 }, error: {} },
    });
    return {
      kind: "claimed",
      runId: run.id,
      stepKey: step.stepKey,
      fence,
      ownerId: input.ownerId,
    };
  });
}
export async function finishStep(
  claim: Claim,
  checkpoint: Prisma.InputJsonValue,
  commit?: (transaction: Prisma.TransactionClient) => Promise<void>,
) {
  return database().$transaction(
    async (db) => {
      await db.$queryRaw`SELECT m.id FROM "Meeting" m JOIN "AnalysisRun" r ON r."meetingId"=m.id WHERE r.id=${claim.runId}::uuid FOR UPDATE OF m`;
      await db.$queryRaw`SELECT id FROM "AnalysisRun" WHERE id=${claim.runId}::uuid FOR UPDATE`;
      const run = await db.analysisRun.findFirst({
        where: {
          id: claim.runId,
          state: "RUNNING",
          fencingVersion: claim.fence,
          leaseUntil: { gt: new Date() },
          meeting: { deletedAt: null, project: { ownerId: claim.ownerId } },
        },
        include: { meeting: true },
      });
      if (
        !run ||
        run.meeting.currentRevisionNumber !==
          runSnapshot.parse(run.snapshot).revisionNumber
      )
        throw new HttpError(409, "STALE_CLAIM");
      if (commit) await commit(db);
      await db.analysisStep.update({
        where: { runId_stepKey: { runId: run.id, stepKey: claim.stepKey } },
        data: { state: "succeeded", checkpoint },
      });
      const remaining = await db.analysisStep.count({
        where: { runId: run.id, state: { not: "succeeded" } },
      });
      await db.analysisRun.update({
        where: { id: run.id },
        data: { state: remaining ? "READY" : "COMPLETED", leaseUntil: null },
      });
      return { completed: remaining === 0 };
    },
    { timeout: commit ? 120000 : 30000 },
  );
}
export async function failStep(
  claim: Claim,
  error: {
    readonly code: string;
    readonly retryable: boolean;
    readonly retryAfterSeconds?: number;
  },
) {
  const safe = z
    .object({
      code: z.string().max(80),
      retryable: z.boolean(),
      retryAfterSeconds: z.number().int().min(0).max(900).optional(),
    })
    .parse(error);
  await database().$transaction(async (db) => {
    const changed = await db.analysisRun.updateMany({
      where: { id: claim.runId, state: "RUNNING", fencingVersion: claim.fence },
      data: {
        state: safe.retryable ? "PAUSED_RETRYABLE" : "FAILED",
        leaseUntil: null,
        fencingVersion: { increment: 1 },
      },
    });
    if (!changed.count) throw new HttpError(409, "STALE_CLAIM");
    await db.analysisStep.update({
      where: { runId_stepKey: { runId: claim.runId, stepKey: claim.stepKey } },
      data: {
        state: safe.retryable ? "retryable_failed" : "failed",
        error: {
          ...safe,
          retryAt: Date.now() + (safe.retryAfterSeconds ?? 0) * 1000,
        },
      },
    });
  });
}
export async function cancelRun(ownerId: string, id: string) {
  const changed = await database().analysisRun.updateMany({
    where: {
      id,
      meeting: { project: { ownerId } },
      state: { in: ["READY", "RUNNING", "PAUSED_RETRYABLE"] },
    },
    data: {
      state: "CANCELLED",
      fencingVersion: { increment: 1 },
      leaseUntil: null,
    },
  });
  if (!changed.count) throw new HttpError(409, "RUN_NOT_ACTIVE");
  return { cancelled: true };
}
