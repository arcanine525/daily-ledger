import { afterAll, beforeAll, expect, it } from "vitest";
import {
  cancelRun,
  claimStep,
  failStep,
  finishStep,
  startRun,
} from "../../src/server/analysis/runs";
import { database } from "../../src/server/db/client";
import { createMeeting } from "../../src/server/meetings/archive";

const db = database();
let ownerId = "",
  projectId = "",
  meetingId = "";
beforeAll(async () => {
  ownerId = (
    await db.owner.create({
      data: { email: "runs@example.test", passwordHash: "fixture" },
    })
  ).id;
  projectId = (await db.project.create({ data: { ownerId, name: "Runs" } })).id;
  const profile = await db.providerProfile.create({
    data: {
      ownerId,
      name: "Mock",
      type: "openai-compatible",
      revisions: {
        create: { number: 1, baseUrl: "https://example.com", model: "mock" },
      },
    },
  });
  await db.userSettings.create({
    data: { ownerId, analysisProfileId: profile.id },
  });
  meetingId = (
    await createMeeting(
      ownerId,
      {
        projectId,
        title: "Daily",
        occurredAt: "2026-10-07T02:00:00Z",
        meetingTimezone: "UTC",
        rawText: "Mai: I will review.",
      },
      "run-meeting",
    )
  ).id;
});

it("retries only the failed step and retains earlier checkpoints", async () => {
  const run = await startRun(ownerId, meetingId, ["map:0", "map:1"]);
  const first = await claimStep({ ownerId, runId: run.id, stepKey: "map:0" });
  if (first.kind !== "claimed") throw new Error("Expected claim");
  await finishStep(first, { completed: true });
  const second = await claimStep({ ownerId, runId: run.id, stepKey: "map:1" });
  if (second.kind !== "claimed") throw new Error("Expected claim");
  await failStep(second, {
    code: "RATE_LIMITED",
    retryable: true,
    retryAfterSeconds: 30,
  });
  await expect(
    claimStep({ ownerId, runId: run.id, stepKey: "map:1" }),
  ).rejects.toMatchObject({ status: 429 });
  await db.analysisStep.update({
    where: { runId_stepKey: { runId: run.id, stepKey: "map:1" } },
    data: { error: { code: "RATE_LIMITED", retryable: true, retryAt: 0 } },
  });
  expect(
    (await claimStep({ ownerId, runId: run.id, stepKey: "map:0" })).kind,
  ).toBe("replay");
  const retry = await claimStep({ ownerId, runId: run.id, stepKey: "map:1" });
  if (retry.kind !== "claimed") throw new Error("Expected claim");
  expect(await finishStep(retry, { completed: true })).toEqual({
    completed: true,
  });
});
afterAll(async () => {
  await db.meeting.deleteMany({ where: { projectId } });
  await db.project.delete({ where: { id: projectId } });
  await db.owner.delete({ where: { id: ownerId } });
  await db.$disconnect();
});
it("fences concurrent claims and replays completed checkpoints", async () => {
  const run = await startRun(ownerId, meetingId, ["map:0", "publish"]);
  const results = await Promise.allSettled([
    claimStep({ ownerId, runId: run.id, stepKey: "map:0" }),
    claimStep({ ownerId, runId: run.id, stepKey: "map:0" }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const success = results.find((r) => r.status === "fulfilled");
  if (success?.status !== "fulfilled") throw new Error("Claim did not succeed");
  expect(success.value.kind).toBe("claimed");
  if (success.value.kind !== "claimed") throw new Error("Expected claim");
  await finishStep(success.value, { items: [] });
  const replay = await claimStep({ ownerId, runId: run.id, stepKey: "map:0" });
  expect(replay.kind).toBe("replay");
  await cancelRun(ownerId, run.id);
});
it("reclaims an expired lease but rejects stale commits and cancellation", async () => {
  const run = await startRun(ownerId, meetingId, ["map:0", "publish"]);
  const first = await claimStep({ ownerId, runId: run.id, stepKey: "map:0" });
  if (first.kind !== "claimed") throw new Error("Expected claim");
  await db.analysisRun.update({
    where: { id: run.id },
    data: { leaseUntil: new Date(Date.now() - 1000) },
  });
  const second = await claimStep({ ownerId, runId: run.id, stepKey: "map:0" });
  if (second.kind !== "claimed") throw new Error("Expected claim");
  await expect(finishStep(first, { old: true })).rejects.toMatchObject({
    status: 409,
  });
  await cancelRun(ownerId, run.id);
  await expect(finishStep(second, { new: true })).rejects.toMatchObject({
    status: 409,
  });
});
