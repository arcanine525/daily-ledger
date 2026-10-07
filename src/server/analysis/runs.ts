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
export async function startRun(
  ownerId: string,
  meetingId: string,
  steps: readonly string[],
) {
  if (!steps.length || new Set(steps).size !== steps.length)
    throw new HttpError(422, "INVALID_STEP_PLAN");
  return database().$transaction(async (db) => {
    await db.$queryRaw`SELECT id FROM "Meeting" WHERE id=${meetingId}::uuid FOR UPDATE`;
    const meeting = await db.meeting.findFirst({
      where: { id: meetingId, deletedAt: null, project: { ownerId } },
      include: {
        revisions: { orderBy: { number: "desc" }, take: 1 },
        identity: true,
        project: {
          include: {
            participants: {
              where: { archivedAt: null },
              include: { aliases: true },
            },
          },
        },
      },
    });
    if (!meeting) throw new HttpError(404, "MEETING_NOT_FOUND");
    const existing = await db.analysisRun.findFirst({
      where: {
        meetingId,
        state: { in: ["READY", "RUNNING", "PAUSED_RETRYABLE"] },
      },
    });
    if (existing) return existing;
    const settings = await db.userSettings.findUnique({ where: { ownerId } });
    const profile = settings?.analysisProfileId
      ? await db.providerProfileRevision.findFirst({
          where: {
            profileId: settings.analysisProfileId,
            profile: { ownerId, deletedAt: null },
          },
          orderBy: { number: "desc" },
        })
      : null;
    const revision = meeting.revisions[0];
    if (!profile || !revision)
      throw new HttpError(422, "ANALYSIS_CONFIGURATION_REQUIRED");
    const snapshot = runSnapshot.parse({
      steps,
      revisionNumber: revision.number,
      outputLocale: settings?.outputLocale ?? "vi",
      timezone: meeting.meetingTimezone,
      occurredAt: meeting.occurredAt.toISOString(),
      participants: meeting.project.participants.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        isSelf: p.isSelf,
        aliases: p.aliases.map((a) => a.normalized),
      })),
      identity: meeting.identity.map((m) => ({
        speaker: m.speaker,
        isSharedSpeaker: m.isSharedSpeaker,
        mapping: m.mapping,
      })),
    });
    return db.analysisRun.create({
      data: {
        meetingId,
        revisionId: revision.id,
        profileRevisionId: profile.id,
        snapshot,
        promptVersion: "1",
        schemaVersion: "1",
        steps: { create: steps.map((stepKey) => ({ stepKey })) },
      },
    });
  });
}
export async function runForOwner(ownerId: string, runId: string) {
  const run = await database().analysisRun.findFirst({
    where: { id: runId, meeting: { project: { ownerId } } },
    include: {
      steps: true,
      meeting: true,
      revision: true,
      profile: { include: { profile: true } },
    },
  });
  if (!run) throw new HttpError(404, "RUN_NOT_FOUND");
  return run;
}
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
      throw new HttpError(429, "RETRY_AFTER_REQUIRED");
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
  return database().$transaction(async (db) => {
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
  });
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
