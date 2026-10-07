import { afterAll, beforeAll, expect, it } from "vitest";
import { eligibleHistory } from "../../src/server/chat/citations";
import { retrieveContext } from "../../src/server/chat/context";
import { snapshotSchema } from "../../src/server/chat/contracts";
import { cancelChat, getRun } from "../../src/server/chat/runs";
import {
  createConversation,
  executeChatStep,
  startChat,
} from "../../src/server/chat/service";
import { database } from "../../src/server/db/client";
import { createMeeting } from "../../src/server/meetings/archive";
import { saveProfile } from "../../src/server/providers/profiles";
import type { Transport } from "../../src/server/providers/protocol";
import { createTask, editTask } from "../../src/server/tasks/write";

const db = database();
let ownerId = "",
  projectId = "",
  conversationId = "";
beforeAll(async () => {
  ownerId = (
    await db.owner.create({
      data: { email: "chat-boundaries@example.test", passwordHash: "fixture" },
    })
  ).id;
  projectId = (
    await db.project.create({ data: { ownerId, name: "Boundaries" } })
  ).id;
  const profile = await saveProfile(ownerId, {
    name: "Mock",
    type: "openai-compatible",
    baseUrl: "https://example.com",
    model: "mock",
    token: "fixture",
  });
  await db.userSettings.create({
    data: { ownerId, chatProfileId: profile.id },
  });
  conversationId = (await createConversation(ownerId, { title: "Boundaries" }))
    .id;
});
afterAll(async () => {
  await db.chatMessageDependency.deleteMany({
    where: { message: { conversation: { ownerId } } },
  });
  await db.conversation.deleteMany({ where: { ownerId } });
  await db.task.deleteMany({ where: { projectId } });
  await db.meeting.deleteMany({ where: { projectId } });
  await db.projectParticipant.deleteMany({ where: { projectId } });
  await db.project.delete({ where: { id: projectId } });
  await db.owner.delete({ where: { id: ownerId } });
  await db.$disconnect();
});
const plan = {
  intent: "TASK_HISTORY" as const,
  englishQuery: "",
  asOf: null,
  clarification: null,
};
it("filters historical assignments and deadlines using the snapshot at cutoff", async () => {
  const person = await db.projectParticipant.create({
    data: { projectId, displayName: "Self", isSelf: true },
  });
  const task = await createTask(
    ownerId,
    {
      projectId,
      title: "Past task",
      assigneeIds: [person.id],
      deadline: "2026-10-05",
    },
    "history-task",
  );
  const cutoff = new Date().toISOString();
  await editTask(ownerId, task.id, {
    expectedVersion: 1,
    assigneeIds: [],
    deadline: "2026-11-05",
    status: "DONE",
  });
  const context = await retrieveContext(
    ownerId,
    { projectId, scope: "MINE", dueTo: "2026-10-10" },
    { ...plan, asOf: cutoff },
  );
  expect(context.sources.some((source) => source.taskId === task.id)).toBe(
    true,
  );
  expect(
    context.sources.find((source) => source.taskId === task.id)?.text,
  ).toContain('"status":"TODO"');
});
it("covers every meeting through bounded map and reduction steps", async () => {
  for (let index = 0; index < 21; index++)
    await createMeeting(
      ownerId,
      {
        projectId,
        title: `Daily ${index}`,
        occurredAt: "2026-10-07T02:00:00Z",
        meetingTimezone: "UTC",
        rawText: `Mai: Migration item ${index}. ${"Evidence detail. ".repeat(300)}`,
      },
      `chat-exhaustive-${index}`,
    );
  const seen = new Set<string>();
  let largest = 0;
  const fake: Transport = async (request) => {
    largest = Math.max(largest, Buffer.byteLength(request.body));
    const payload = JSON.parse(
      JSON.parse(request.body).messages.find(
        (m: { role: string }) => m.role === "user",
      ).content,
    );
    let value: unknown;
    switch (payload.phase) {
      case "chat-plan":
        value = { ...plan, intent: "MEETING_SUMMARY" };
        break;
      case "chat-map":
        for (const source of payload.sources) seen.add(source.meetingId);
        value = {
          text: "Fixture summary",
          sourceIds: payload.sources
            .map((s: { id: string }) => s.id)
            .slice(0, 12),
        };
        break;
      case "chat-reduce":
        value = {
          text: "Combined fixture",
          sourceIds: payload.summaries
            .flatMap((s: { sourceIds: string[] }) => s.sourceIds)
            .slice(0, 12),
        };
        break;
      default:
        value = {
          text: "Verified summary",
          citations: payload.sources
            .slice(0, 1)
            .map((s: { id: string; text: string }) => ({
              sourceId: s.id,
              quote: s.text,
            })),
        };
    }
    return {
      status: 200,
      body: JSON.stringify({
        choices: [{ message: { content: JSON.stringify(value) } }],
      }),
    };
  };
  const run = await startChat(ownerId, conversationId, {
    question: "Summarize meetings",
    filters: { projectId },
  });
  for (let index = 0; index < 100; index++) {
    const current = await getRun(ownerId, run.id);
    if (current.state === "COMPLETED") break;
    const next = snapshotSchema
      .parse(current.snapshot)
      .steps.find(
        (key) =>
          current.steps.find((step) => step.stepKey === key)?.state !==
          "succeeded",
      );
    if (!next) throw new Error("missing next step");
    await executeChatStep({ ownerId, runId: run.id, stepKey: next }, fake);
  }
  expect((await getRun(ownerId, run.id)).state).toBe("COMPLETED");
  expect(seen.size).toBe(21);
  expect(largest).toBeLessThan(28000);
});
it("replays equal requests and rejects changed idempotency payloads", async () => {
  const input = { question: "Which tasks?", idempotencyKey: "chat-key" };
  const run = await startChat(ownerId, conversationId, input);
  expect((await startChat(ownerId, conversationId, input)).id).toBe(run.id);
  await expect(
    startChat(ownerId, conversationId, { ...input, question: "Different" }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  await cancelChat(ownerId, run.id);
});
it("excludes indirect deleted-source history without excluding independent turns", async () => {
  const [source, dependent, independent] = await Promise.all(
    ["source", "dependent", "independent"].map((body) =>
      db.chatMessage.create({
        data: {
          conversationId,
          role: "assistant",
          body,
          state: "complete",
          filters: {},
        },
      }),
    ),
  );
  if (!source || !dependent || !independent)
    throw new Error("missing fixtures");
  await db.citation.create({
    data: { messageId: source.id, label: "Deleted", sourceDeleted: true },
  });
  await db.chatMessageDependency.create({
    data: { messageId: dependent.id, contextMessageId: source.id },
  });
  const history = await eligibleHistory(ownerId, conversationId);
  expect(history.map((m) => m.id)).not.toContain(dependent.id);
  expect(history.map((m) => m.id)).toContain(independent.id);
});
it("treats provider authentication failure as fatal without fallback", async () => {
  const run = await startChat(ownerId, conversationId, {
    question: "Migration?",
  });
  let calls = 0;
  await expect(
    executeChatStep({ ownerId, runId: run.id, stepKey: "plan" }, async () => {
      calls++;
      return { status: 401, body: "{}" };
    }),
  ).rejects.toMatchObject({ code: "PROVIDER_AUTH_FAILED" });
  expect(calls).toBe(1);
  expect((await getRun(ownerId, run.id)).state).toBe("FAILED");
});
it("counts all unfinished manual tasks without treating them as meeting-linked", async () => {
  for (let index = 0; index < 15; index++)
    await createTask(
      ownerId,
      { projectId, title: `Count ${index}` },
      `chat-count-${index}`,
    );
  const all = await retrieveContext(
    ownerId,
    { projectId, scope: "ALL" },
    { ...plan, intent: "TASK_COUNTS" },
  );
  expect(all.totals).toEqual({ confirmed: 15, pending: 0 });
  expect(all.sources).toHaveLength(15);
  const linked = await retrieveContext(
    ownerId,
    { projectId, scope: "ALL", from: "2026-10-01" },
    { ...plan, intent: "TASK_COUNTS" },
  );
  expect(linked.totals?.confirmed).toBe(0);
});
it("clarifies an ambiguous week without retrieving tasks", async () => {
  const run = await startChat(ownerId, conversationId, {
    question: "Which tasks this week?",
    filters: { projectId },
  });
  const fake: Transport = async () => ({
    status: 200,
    body: JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({ ...plan, intent: "LIST_TASKS" }),
          },
        },
      ],
    }),
  });
  for (const stepKey of ["plan", "retrieve", "answer"])
    await executeChatStep({ ownerId, runId: run.id, stepKey }, fake);
  const retrieved = await db.chatStep.findUniqueOrThrow({
    where: { runId_stepKey: { runId: run.id, stepKey: "retrieve" } },
  });
  expect(retrieved.checkpoint).toMatchObject({ sources: [], totals: null });
});
