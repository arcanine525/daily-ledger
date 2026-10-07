import { afterAll, beforeAll, expect, it } from "vitest";
import { z } from "zod";
import {
  createConversation,
  executeChatStep,
  startChat,
} from "../../src/server/chat/service";
import { database } from "../../src/server/db/client";
import { createMeeting } from "../../src/server/meetings/archive";
import { saveProfile } from "../../src/server/providers/profiles";
import type { Transport } from "../../src/server/providers/protocol";

const db = database();
let ownerId = "",
  projectId = "",
  conversationId = "";
const fake: Transport = async (request) => {
  const wire = z
    .object({
      messages: z.array(z.object({ role: z.string(), content: z.string() })),
    })
    .parse(JSON.parse(request.body));
  const payload = JSON.parse(
    wire.messages.find((message) => message.role === "user")?.content ?? "{}",
  );
  const value =
    payload.phase === "chat-plan"
      ? {
          intent: "LOOKUP",
          englishQuery: "migration",
          clarification: null,
          asOf: null,
        }
      : payload.phase === "chat-map"
        ? {
            text: "Migration summary",
            sourceIds: payload.sources.map(
              (source: { id: string }) => source.id,
            ),
          }
        : {
            text: "Migration evidence found",
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
beforeAll(async () => {
  const previous = await db.owner.findUnique({
    where: { email: "chat@example.test" },
  });
  if (previous) {
    await db.chatMessageDependency.deleteMany({
      where: { message: { conversation: { ownerId: previous.id } } },
    });
    await db.conversation.deleteMany({ where: { ownerId: previous.id } });
    await db.meeting.deleteMany({
      where: { project: { ownerId: previous.id } },
    });
    await db.project.deleteMany({ where: { ownerId: previous.id } });
    await db.owner.delete({ where: { id: previous.id } });
  }
  ownerId = (
    await db.owner.create({
      data: { email: "chat@example.test", passwordHash: "fixture" },
    })
  ).id;
  projectId = (await db.project.create({ data: { ownerId, name: "Chat" } })).id;
  await createMeeting(
    ownerId,
    {
      projectId,
      title: "Daily",
      occurredAt: "2026-10-07T02:00:00Z",
      meetingTimezone: "UTC",
      rawText: "Mai: Migration is blocked by staging.",
    },
    "chat-meeting",
  );
  const profile = await saveProfile(ownerId, {
    name: "Mock",
    type: "openai-compatible",
    baseUrl: "https://example.com",
    model: "mock",
    token: "fixture-only-token",
  });
  await db.userSettings.create({
    data: { ownerId, chatProfileId: profile.id },
  });
  conversationId = (await createConversation(ownerId, { title: "Questions" }))
    .id;
});
afterAll(async () => {
  await db.chatMessageDependency.deleteMany({
    where: { message: { conversation: { ownerId } } },
  });
  await db.conversation.deleteMany({ where: { ownerId } });
  await db.meeting.deleteMany({ where: { projectId } });
  await db.project.delete({ where: { id: projectId } });
  await db.owner.delete({ where: { id: ownerId } });
  await db.$disconnect();
});
it("expands a Vietnamese query and persists verified English evidence", async () => {
  const run = await startChat(ownerId, conversationId, {
    question: "Migration đang vướng gì?",
    filters: { projectId },
  });
  for (const key of ["plan", "retrieve", "answer"])
    await executeChatStep({ ownerId, runId: run.id, stepKey: key }, fake);
  const messages = await db.chatMessage.findMany({
    where: { conversationId },
    include: { citations: true },
    orderBy: { createdAt: "asc" },
  });
  expect(messages.at(-1)?.state).toBe("complete");
  expect(messages.at(-1)?.citations).toHaveLength(1);
  expect(messages.at(-1)?.citations[0]?.quote).toContain("Migration");
});
it("rejects invented citations instead of saving a verified answer", async () => {
  const run = await startChat(ownerId, conversationId, {
    question: "Migration?",
    filters: { projectId },
  });
  await executeChatStep({ ownerId, runId: run.id, stepKey: "plan" }, fake);
  await executeChatStep({ ownerId, runId: run.id, stepKey: "retrieve" }, fake);
  const invalid: Transport = async () => ({
    status: 200,
    body: JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              text: "Invented",
              citations: [{ sourceId: "invented", quote: "no source" }],
            }),
          },
        },
      ],
    }),
  });
  await expect(
    executeChatStep({ ownerId, runId: run.id, stepKey: "answer" }, invalid),
  ).rejects.toMatchObject({ code: "INVALID_CHAT_CITATION" });
  expect(
    (await db.chatRun.findUniqueOrThrow({ where: { id: run.id } })).state,
  ).not.toBe("COMPLETED");
});
