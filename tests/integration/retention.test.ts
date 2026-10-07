import { afterAll, beforeAll, expect, it } from "vitest";
import { startRun } from "../../src/server/analysis/run-lifecycle";
import { eligibleHistory } from "../../src/server/chat/citations";
import { database } from "../../src/server/db/client";
import {
  createMeeting,
  meetingForOwner,
} from "../../src/server/meetings/archive";
import {
  purgeExpired,
  purgeMeeting,
  restoreMeeting,
  trashMeeting,
} from "../../src/server/retention/service";
import { search } from "../../src/server/search/retrieve";
import { createTask } from "../../src/server/tasks/write";
import {
  cleanupRetention,
  retentionMeeting,
  retentionNow,
  setupRetention,
} from "../fixtures/retention";

const db = database();
const day = 86400000,
  now = retentionNow;
let ownerId = "",
  projectId = "",
  conversationId = "";
beforeAll(async () => {
  ({ ownerId, projectId, conversationId } = await setupRetention(
    "retention@example.test",
  ));
});
afterAll(async () => {
  await cleanupRetention({ ownerId, projectId, conversationId });
});
async function fixture(label: string) {
  return retentionMeeting({ ownerId, projectId, conversationId }, label);
}

it("revokes direct and indirect context on trash and restores it before day30", async () => {
  const f = await fixture("Restorable"),
    dependent = await db.chatMessage.create({
      data: {
        conversationId,
        role: "user",
        body: "Follow-up",
        state: "complete",
        filters: {},
      },
    }),
    independent = await db.chatMessage.create({
      data: {
        conversationId,
        role: "user",
        body: "Independent",
        state: "complete",
        filters: {},
      },
    });
  await db.chatMessageDependency.create({
    data: { messageId: dependent.id, contextMessageId: f.message.id },
  });
  const run = await startRun(ownerId, f.meeting.id, ["fixture"]);
  await trashMeeting(ownerId, f.meeting.id, now);
  expect(
    (await search(ownerId, { query: "Restorable", projectId })).items,
  ).toHaveLength(0);
  await expect(meetingForOwner(ownerId, f.meeting.id)).rejects.toMatchObject({
    code: "MEETING_NOT_FOUND",
  });
  const history = await eligibleHistory(ownerId, conversationId);
  expect(history.map((m) => m.id)).not.toContain(dependent.id);
  expect(history.map((m) => m.id)).toContain(independent.id);
  expect(
    (await db.analysisRun.findUniqueOrThrow({ where: { id: run.id } })).state,
  ).toBe("CANCELLED");
  await restoreMeeting(
    ownerId,
    f.meeting.id,
    new Date(now.getTime() + 29 * day),
  );
  expect(
    (await eligibleHistory(ownerId, conversationId)).map((m) => m.id),
  ).toContain(dependent.id);
  expect(
    (await db.chatMessage.findUniqueOrThrow({ where: { id: f.message.id } }))
      .body,
  ).toBe(f.message.body);
  expect(
    (await search(ownerId, { query: "Restorable", projectId })).items,
  ).toHaveLength(1);
});
it("purges source caches while retaining canonical work and chat bytes", async () => {
  const f = await fixture("Permanent"),
    task = await createTask(
      ownerId,
      { projectId, title: "Confirmed work" },
      "retained-task",
    ),
    evidence = await db.taskEvidence.create({
      data: {
        taskId: task.id,
        sourceMeetingId: f.meeting.id,
        sourceRevisionId: f.revision.id,
        quote: f.revision.rawText,
        startOffset: 0,
        endOffset: f.revision.rawText.length,
      },
    });
  const receipt = await db.proposalDecision.create({
    data: {
      idempotencyKey: `${ownerId}:retention-decision`,
      fingerprint: f.revision.rawText,
      outcome: "REJECTED",
      reason: f.revision.rawText,
      payload: {
        meetingId: f.meeting.id,
        proposalId: "fixture",
        inputHash: "fixture",
        result: { taskId: null, decision: "REJECT" },
        hiddenQuote: f.revision.rawText,
      },
    },
  });
  await expect(
    purgeMeeting(ownerId, f.meeting.id, { confirmationTitle: "Wrong" }),
  ).rejects.toMatchObject({ code: "PURGE_CONFIRMATION_REQUIRED" });
  await purgeMeeting(ownerId, f.meeting.id, {
    confirmationTitle: f.meeting.title,
  });
  expect(
    await db.transcriptRevision.count({ where: { meetingId: f.meeting.id } }),
  ).toBe(0);
  expect(
    await db.searchDocument.count({ where: { meetingId: f.meeting.id } }),
  ).toBe(0);
  expect(await db.task.findUnique({ where: { id: task.id } })).toMatchObject({
    title: task.title,
    status: task.status,
    version: task.version,
  });
  expect(
    await db.taskEvidence.findUnique({ where: { id: evidence.id } }),
  ).toMatchObject({
    sourceDeleted: true,
    sourceMeetingId: null,
    sourceRevisionId: null,
    quote: null,
    startOffset: null,
    endOffset: null,
  });
  expect(
    await db.chatMessage.findUnique({ where: { id: f.message.id } }),
  ).toMatchObject({ body: f.message.body, contextEligible: false });
  expect(
    await db.citation.findFirst({ where: { messageId: f.message.id } }),
  ).toMatchObject({
    revisionId: null,
    sourceDeleted: true,
    quote: f.revision.rawText,
    label: f.meeting.title,
  });
  const saved = await db.proposalDecision.findUniqueOrThrow({
    where: { id: receipt.id },
  });
  expect(JSON.stringify(saved)).not.toContain(f.revision.rawText);
  await expect(
    createMeeting(
      ownerId,
      {
        projectId,
        title: f.meeting.title,
        occurredAt: now.toISOString(),
        meetingTimezone: "UTC",
        rawText: f.revision.rawText,
      },
      `retention-${f.meeting.title}`,
    ),
  ).rejects.toMatchObject({ code: "MEETING_PURGED" });
});
it("does nothing without a visit and purges at most ten expired meetings per request", async () => {
  const ids = [];
  for (let index = 0; index < 11; index++) {
    const f = await fixture(`Expired ${index}`);
    ids.push(f.meeting.id);
    await trashMeeting(ownerId, f.meeting.id, now);
  }
  expect(await db.meeting.count({ where: { id: { in: ids } } })).toBe(11);
  expect(
    await purgeExpired(ownerId, new Date(now.getTime() + 29 * day)),
  ).toMatchObject({ purged: 0, hasMore: false });
  await expect(
    restoreMeeting(ownerId, ids[0] ?? "", new Date(now.getTime() + 31 * day)),
  ).rejects.toMatchObject({ code: "RESTORE_WINDOW_EXPIRED" });
  expect(
    await purgeExpired(ownerId, new Date(now.getTime() + 31 * day)),
  ).toMatchObject({ purged: 10, hasMore: true });
  expect(
    await purgeExpired(ownerId, new Date(now.getTime() + 31 * day)),
  ).toMatchObject({ purged: 1, hasMore: false });
});
