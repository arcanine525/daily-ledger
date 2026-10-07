import { afterAll, beforeAll, expect, it } from "vitest";
import { z } from "zod";
import {
  beginAnalysis,
  executeAnalysisStep,
} from "../../src/server/analysis/pipeline";
import { runSnapshot } from "../../src/server/analysis/run-snapshot";
import { database } from "../../src/server/db/client";
import {
  createMeeting,
  reviseMeeting,
} from "../../src/server/meetings/archive";
import { saveProfile } from "../../src/server/providers/profiles";
import type { Transport } from "../../src/server/providers/protocol";

const db = database();
let ownerId = "",
  projectId = "",
  meetingId = "";
const quote = "Mai: I will review the API tomorrow.";
const raw = `${quote}\n${"Alex: Routine progress with no action.\n".repeat(4000)}`;
const summary = {
  overview: "Daily fixture",
  byPerson: [],
  blockers: [],
  decisions: [],
  todos: ["Review API"],
};
const fake: Transport = async (request) => {
  const wire = z
    .object({
      messages: z.array(z.object({ role: z.string(), content: z.string() })),
    })
    .parse(JSON.parse(request.body));
  const payload = z
    .object({ phase: z.string(), text: z.string().optional() })
    .parse(
      JSON.parse(wire.messages.find((m) => m.role === "user")?.content ?? "{}"),
    );
  const value =
    payload.phase === "map"
      ? {
          summary,
          items: payload.text?.includes(quote)
            ? [
                {
                  kind: "ACTION",
                  title: "Review API",
                  quote,
                  segmentOrdinal: null,
                  names: ["Mai"],
                  duePhrase: "tomorrow",
                  completionScope: "NONE",
                },
              ]
            : [],
        }
      : payload.phase === "reduce"
        ? summary
        : { suggestions: [] };
  return {
    status: 200,
    body: JSON.stringify({
      choices: [{ message: { content: JSON.stringify(value) } }],
    }),
  };
};
beforeAll(async () => {
  await db.proposalDecision.deleteMany({
    where: { idempotencyKey: "fixture-reject" },
  });
  ownerId = (
    await db.owner.create({
      data: { email: "pipeline@example.test", passwordHash: "fixture" },
    })
  ).id;
  projectId = (await db.project.create({ data: { ownerId, name: "Daily" } }))
    .id;
  await db.projectParticipant.create({
    data: {
      projectId,
      displayName: "Mai",
      isSelf: true,
      aliases: { create: { normalized: "mai" } },
    },
  });
  const profile = await saveProfile(ownerId, {
    name: "Mock",
    type: "openai-compatible",
    baseUrl: "https://example.com",
    model: "mock",
    token: "fixture-token",
  });
  await db.userSettings.create({
    data: { ownerId, analysisProfileId: profile.id },
  });
  meetingId = (
    await createMeeting(
      ownerId,
      {
        projectId,
        title: "Long daily",
        occurredAt: "2026-10-07T02:00:00Z",
        meetingTimezone: "UTC",
        rawText: raw,
      },
      "pipeline-meeting",
    )
  ).id;
});
afterAll(async () => {
  await db.proposalDecision.deleteMany({
    where: { idempotencyKey: `fixture-reject:${ownerId}` },
  });
  await db.meeting.deleteMany({ where: { projectId } });
  await db.projectParticipant.deleteMany({ where: { projectId } });
  await db.project.delete({ where: { id: projectId } });
  await db.owner.delete({ where: { id: ownerId } });
  await db.rateLimitBucket.deleteMany();
  await db.$disconnect();
});
it("publishes once without losing actions during reduction and preserves edited actions on reanalysis", async () => {
  const run = await beginAnalysis(ownerId, meetingId);
  const steps = runSnapshot.parse(run.snapshot).steps;
  for (const stepKey of steps)
    await executeAnalysisStep({ ownerId, runId: run.id, stepKey }, fake);
  expect(await db.analysisVersion.count({ where: { meetingId } })).toBe(1);
  expect(
    await db.meetingAction.count({
      where: { meetingId, reviewState: "PENDING" },
    }),
  ).toBe(1);
  const action = await db.meetingAction.findFirstOrThrow({
    where: { meetingId },
  });
  expect(action.dueDate?.toISOString().slice(0, 10)).toBe("2026-10-08");
  await db.meetingAction.update({
    where: { id: action.id },
    data: { title: "Manual title", manuallyEditedAt: new Date() },
  });
  expect(
    (
      await executeAnalysisStep(
        { ownerId, runId: run.id, stepKey: "publish" },
        fake,
      )
    ).replayed,
  ).toBe(true);
  expect(await db.analysisVersion.count({ where: { meetingId } })).toBe(1);
  const next = await beginAnalysis(ownerId, meetingId);
  for (const stepKey of runSnapshot.parse(next.snapshot).steps)
    await executeAnalysisStep({ ownerId, runId: next.id, stepKey }, fake);
  expect(
    (await db.meetingAction.findUniqueOrThrow({ where: { id: action.id } }))
      .title,
  ).toBe("Manual title");
  expect(
    await db.meetingAction.count({
      where: { meetingId, reviewState: "PENDING" },
    }),
  ).toBe(1);
});
it("retains completed checkpoints after provider error and blocks stale revision publication", async () => {
  const run = await beginAnalysis(ownerId, meetingId);
  const steps = runSnapshot.parse(run.snapshot).steps;
  const first = steps[0];
  if (!first) throw new Error("No steps");
  await executeAnalysisStep({ ownerId, runId: run.id, stepKey: first }, fake);
  const second = steps[1];
  if (!second) throw new Error("No second step");
  const unavailable: Transport = async () => ({ status: 503, body: "{}" });
  await expect(
    executeAnalysisStep(
      { ownerId, runId: run.id, stepKey: second },
      unavailable,
    ),
  ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  expect(
    (
      await executeAnalysisStep(
        { ownerId, runId: run.id, stepKey: first },
        fake,
      )
    ).replayed,
  ).toBe(true);
  await reviseMeeting(ownerId, meetingId, {
    rawText: `${raw}\nCorrection`,
    expectedRevision: 1,
  });
  await expect(
    executeAnalysisStep({ ownerId, runId: run.id, stepKey: second }, fake),
  ).rejects.toMatchObject({ status: 409 });
});

it("suppresses rejected CREATE proposals even when AI rephrases the title", async () => {
  const meeting = await createMeeting(
    ownerId,
    {
      projectId,
      title: "Rejection case",
      occurredAt: "2026-10-07T02:00:00Z",
      meetingTimezone: "UTC",
      rawText: quote,
      confirmDuplicate: true,
    },
    "reject-meeting",
  );
  const first = await beginAnalysis(ownerId, meeting.id);
  for (const stepKey of runSnapshot.parse(first.snapshot).steps)
    await executeAnalysisStep({ ownerId, runId: first.id, stepKey }, fake);
  const proposal = await db.taskProposal.findFirstOrThrow({
    where: { action: { meetingId: meeting.id } },
  });
  await db.proposalDecision.create({
    data: {
      idempotencyKey: `fixture-reject:${ownerId}`,
      fingerprint: proposal.fingerprint,
      outcome: "REJECTED",
      payload: {},
    },
  });
  await db.taskProposal.update({
    where: { id: proposal.id },
    data: { state: "REJECTED" },
  });
  await db.meetingAction.update({
    where: { id: proposal.actionId },
    data: { reviewState: "REJECTED" },
  });
  const changed: Transport = async (request) => {
    const result = await fake(request);
    return {
      ...result,
      body: result.body.replace(/Review API/g, "Review the API endpoint"),
    };
  };
  const second = await beginAnalysis(ownerId, meeting.id);
  for (const stepKey of runSnapshot.parse(second.snapshot).steps)
    await executeAnalysisStep({ ownerId, runId: second.id, stepKey }, changed);
  expect(
    await db.taskProposal.count({
      where: { action: { meetingId: meeting.id }, state: "PENDING" },
    }),
  ).toBe(0);
});

it("uses declared global identity in a project without a self participant", async () => {
  await db.userSettings.update({
    where: { ownerId },
    data: { displayName: "Hiep" },
  });
  const project = await db.project.create({
    data: { ownerId, name: "Global identity fixture" },
  });
  try {
    const meeting = await createMeeting(
      ownerId,
      {
        projectId: project.id,
        title: "Self",
        occurredAt: "2026-10-07T02:00:00Z",
        meetingTimezone: "UTC",
        rawText: "Hiep: I will review.",
      },
      "global-identity",
    );
    const run = await beginAnalysis(ownerId, meeting.id);
    expect(runSnapshot.parse(run.snapshot).participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayName: "Hiep", isSelf: true }),
      ]),
    );
    expect(await db.owner.count()).toBe(1);
  } finally {
    await db.meeting.deleteMany({ where: { projectId: project.id } });
    await db.projectParticipant.deleteMany({
      where: { projectId: project.id },
    });
    await db.project.delete({ where: { id: project.id } });
    await db.userSettings.update({
      where: { ownerId },
      data: { displayName: "" },
    });
  }
});
