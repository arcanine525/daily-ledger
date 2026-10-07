import { afterAll, beforeAll, expect, it } from "vitest";
import { startRun } from "../../src/server/analysis/run-lifecycle";
import { claimStep, finishStep } from "../../src/server/analysis/run-steps";
import {
  createConversation,
  executeChatStep,
  startChat,
} from "../../src/server/chat/service";
import { database } from "../../src/server/db/client";
import type { Transport } from "../../src/server/providers/protocol";
import { purgeExpired, purgeMeeting } from "../../src/server/retention/service";
import {
  cleanupRetention,
  retentionMeeting,
  setupRetention,
} from "../fixtures/retention";

const db = database();
let ownerId = "",
  projectId = "",
  conversationId = "";
beforeAll(async () => {
  ({ ownerId, projectId, conversationId } = await setupRetention(
    "retention-races@example.test",
  ));
});
afterAll(async () => {
  await cleanupRetention({ ownerId, projectId, conversationId });
});
const fixture = (label: string) =>
  retentionMeeting({ ownerId, projectId, conversationId }, label);
it("fences analysis completion after source purge", async () => {
  const f = await fixture("Analysis racing"),
    run = await startRun(ownerId, f.meeting.id, ["fixture"]),
    claim = await claimStep({ ownerId, runId: run.id, stepKey: "fixture" });
  if (claim.kind !== "claimed") throw new Error("missing claim");
  await purgeMeeting(ownerId, f.meeting.id, {
    confirmationTitle: f.meeting.title,
  });
  await expect(
    finishStep(claim, { rawResponse: f.revision.rawText }),
  ).rejects.toMatchObject({ code: "STALE_CLAIM" });
  expect(await db.analysisRun.count({ where: { id: run.id } })).toBe(0);
});
it("rejects an in-flight chat answer and scrubs its persisted source checkpoints", async () => {
  const f = await fixture("Chat racing"),
    conversation = await createConversation(ownerId, { title: "Race" }),
    run = await startChat(ownerId, conversation.id, {
      question: "What is Chat racing?",
      filters: { meetingId: f.meeting.id },
    });
  const fake: Transport = async (request) => {
    const payload = JSON.parse(
      JSON.parse(request.body).messages.find(
        (m: { role: string }) => m.role === "user",
      ).content,
    );
    const value =
      payload.phase === "chat-plan"
        ? {
            intent: "LOOKUP",
            englishQuery: "racing",
            clarification: null,
            asOf: null,
          }
        : {
            text: "Race evidence",
            citations: payload.sources
              .slice(0, 1)
              .map((source: { id: string; text: string }) => ({
                sourceId: source.id,
                quote: source.text,
              })),
          };
    return {
      status: 200,
      body: JSON.stringify({
        choices: [{ message: { content: JSON.stringify(value) } }],
      }),
    };
  };
  for (const stepKey of ["plan", "retrieve"])
    await executeChatStep({ ownerId, runId: run.id, stepKey }, fake);
  let release = () => {},
    entered = () => {};
  const waiting = new Promise<void>((resolve) => {
      release = resolve;
    }),
    started = new Promise<void>((resolve) => {
      entered = resolve;
    });
  const pending = executeChatStep(
    { ownerId, runId: run.id, stepKey: "answer" },
    async (request) => {
      entered();
      await waiting;
      return fake(request);
    },
  );
  await started;
  await purgeMeeting(ownerId, f.meeting.id, {
    confirmationTitle: f.meeting.title,
  });
  release();
  await expect(pending).rejects.toMatchObject({ code: "STALE_CHAT_CLAIM" });
  const saved = await db.chatRun.findUniqueOrThrow({
    where: { id: run.id },
    include: { steps: true },
  });
  expect(JSON.stringify(saved)).not.toContain(f.revision.rawText);
  expect(saved.state).toBe("CANCELLED");
  expect(
    await db.chatMessage.findFirst({
      where: { conversationId: conversation.id, role: "assistant" },
    }),
  ).toMatchObject({ body: "", state: "cancelled", contextEligible: false });
});
it("returns busy rather than running a concurrent maintenance transaction", async () => {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ownerId},2))`;
    expect(await purgeExpired(ownerId)).toMatchObject({
      purged: 0,
      busy: true,
    });
  });
});
