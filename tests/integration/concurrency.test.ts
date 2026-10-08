import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  cancelChat,
  claimChat,
  completeChat,
} from "../../src/server/chat/runs";
import { createConversation, startChat } from "../../src/server/chat/service";
import { database } from "../../src/server/db/client";
import { createMeeting } from "../../src/server/meetings/archive";
import { decideProposal } from "../../src/server/tasks/decisions";
import { cleanupRetention, setupRetention } from "../fixtures/retention";

const db = database();
let ownerId = "",
  projectId = "",
  conversationId = "";
beforeAll(async () => {
  ({ ownerId, projectId, conversationId } = await setupRetention(
    "concurrency@example.test",
  ));
});
afterAll(async () => {
  await cleanupRetention({ ownerId, projectId, conversationId });
});
it("serializes identical raw saves into one immutable revision and receipt", async () => {
  const input = {
    projectId,
    title: "Concurrent daily",
    occurredAt: "2026-10-08T02:00:00Z",
    meetingTimezone: "UTC",
    rawText: "Mai: Concurrent save evidence.",
  };
  const [first, second] = await Promise.all([
    createMeeting(ownerId, input, "same-save"),
    createMeeting(ownerId, input, "same-save"),
  ]);
  expect(first.id).toBe(second.id);
  expect(
    await db.transcriptRevision.count({ where: { meetingId: first.id } }),
  ).toBe(1);
  await expect(
    createMeeting(ownerId, { ...input, title: "Changed" }, "same-save"),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
});
it("serializes simultaneous approvals without duplicating canonical tasks or events", async () => {
  const meeting = await createMeeting(
      ownerId,
      {
        projectId,
        title: "Approve race",
        occurredAt: "2026-10-08T02:00:00Z",
        meetingTimezone: "UTC",
        rawText: "Mai: Review API.",
      },
      "approve-race-meeting",
    ),
    revision = await db.transcriptRevision.findFirstOrThrow({
      where: { meetingId: meeting.id },
    }),
    action = await db.meetingAction.create({
      data: { meetingId: meeting.id, title: "Review API", assignees: [] },
    }),
    proposal = await db.taskProposal.create({
      data: {
        actionId: action.id,
        kind: "CREATE",
        baseFieldVersions: {},
        readFields: [],
        writeFields: [],
        changes: {
          before: {},
          after: { title: "Review API", deadline: null, assigneeIds: [] },
          requiresReconciliation: false,
        },
        evidence: {
          revisionId: revision.id,
          start: 0,
          end: revision.rawText.length,
          quote: revision.rawText,
        },
        sourceOccurredAt: meeting.occurredAt,
        fingerprint: randomUUID(),
      },
    });
  const outcomes = await Promise.all([
    decideProposal(
      ownerId,
      proposal.id,
      { decision: "ACCEPT" },
      "approve-race",
    ),
    decideProposal(
      ownerId,
      proposal.id,
      { decision: "ACCEPT" },
      "approve-race",
    ),
  ]);
  expect(outcomes[0]?.taskId).toBe(outcomes[1]?.taskId);
  expect(await db.task.count({ where: { projectId } })).toBe(1);
  expect(await db.taskEvent.count({ where: { task: { projectId } } })).toBe(1);
  const event = await db.taskEvent.findFirstOrThrow({
    where: { task: { projectId } },
  });
  expect(event.effectiveAt.getTime()).toBeGreaterThan(
    meeting.occurredAt.getTime(),
  );
});
it("fences an expired chat claim and cancellation without committing old checkpoints", async () => {
  const thread = await createConversation(ownerId, { title: "Lease race" }),
    run = await startChat(ownerId, thread.id, { question: "Migration?" }),
    first = await claimChat({ ownerId, runId: run.id, stepKey: "plan" });
  if (first.kind !== "claimed") throw new Error("Missing claim");
  await db.chatRun.update({
    where: { id: run.id },
    data: { leaseUntil: new Date(0) },
  });
  const next = await claimChat({ ownerId, runId: run.id, stepKey: "plan" });
  if (next.kind !== "claimed") throw new Error("Missing replacement claim");
  await expect(
    completeChat(first.claim, { stale: true }),
  ).rejects.toMatchObject({ code: "STALE_CHAT_CLAIM" });
  await cancelChat(ownerId, run.id);
  await expect(completeChat(next.claim, { late: true })).rejects.toMatchObject({
    code: "STALE_CHAT_CLAIM",
  });
  expect(
    (
      await db.chatStep.findUniqueOrThrow({
        where: { runId_stepKey: { runId: run.id, stepKey: "plan" } },
      })
    ).checkpoint,
  ).toBeNull();
});
