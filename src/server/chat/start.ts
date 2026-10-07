import { z } from "zod";
import { HttpError } from "../auth/session";
import { database } from "../db/client";
import { hash } from "../tasks/transaction";
import { eligibleHistory } from "./citations";
import { filtersSchema, snapshotSchema } from "./contracts";
export async function createConversation(ownerId: string, input: unknown) {
  const parsed = z
    .object({ title: z.string().trim().min(1).max(200) })
    .safeParse(input);
  if (!parsed.success) throw new HttpError(422, "INVALID_CONVERSATION");
  return database().conversation.create({
    data: { ownerId, title: parsed.data.title },
  });
}
export async function startChat(
  ownerId: string,
  conversationId: string,
  input: unknown,
) {
  const parsed = z
    .object({
      question: z.string().trim().min(1).max(5000),
      filters: filtersSchema.default({ scope: "ALL" }),
      idempotencyKey: z.string().min(1).max(120).optional(),
    })
    .safeParse(input);
  if (!parsed.success) throw new HttpError(422, "INVALID_CHAT_QUESTION");
  if (!z.uuid().safeParse(conversationId).success)
    throw new HttpError(422, "INVALID_CONVERSATION_ID");
  const db = database();
  if (
    !(await db.conversation.findFirst({
      where: { id: conversationId, ownerId },
    }))
  )
    throw new HttpError(404, "CONVERSATION_NOT_FOUND");
  const settings = await db.userSettings.findUnique({ where: { ownerId } }),
    profile = settings?.chatProfileId
      ? await db.providerProfileRevision.findFirst({
          where: {
            profileId: settings.chatProfileId,
            profile: { ownerId, deletedAt: null },
          },
          orderBy: { number: "desc" },
        })
      : null;
  if (!profile?.ciphertext) throw new HttpError(422, "CHAT_PROFILE_REQUIRED");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ownerId},2))`;
    await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id=${conversationId}::uuid FOR UPDATE`;
    if (parsed.data.idempotencyKey) {
      const old = await tx.chatRun.findFirst({
        where: {
          conversationId,
          snapshot: {
            path: ["requestKey"],
            equals: parsed.data.idempotencyKey,
          },
        },
      });
      if (old) {
        const stored = z
          .object({ requestHash: z.string() })
          .parse(old.snapshot);
        if (
          stored.requestHash !==
          hash({ question: parsed.data.question, filters: parsed.data.filters })
        )
          throw new HttpError(409, "IDEMPOTENCY_CONFLICT");
        return old;
      }
    }
    if (
      await tx.chatRun.findFirst({
        where: {
          conversationId,
          state: { in: ["READY", "RUNNING", "PAUSED_RETRYABLE"] },
        },
      })
    )
      throw new HttpError(409, "CHAT_RUN_ACTIVE");
    const history = await eligibleHistory(ownerId, conversationId);
    const question = await tx.chatMessage.create({
        data: {
          conversationId,
          role: "user",
          body: parsed.data.question,
          state: "complete",
          filters: parsed.data.filters,
        },
      }),
      answer = await tx.chatMessage.create({
        data: {
          conversationId,
          role: "assistant",
          body: "",
          filters: parsed.data.filters,
        },
      });
    for (const message of history)
      await tx.chatMessageDependency.create({
        data: { messageId: question.id, contextMessageId: message.id },
      });
    await tx.chatMessageDependency.create({
      data: { messageId: answer.id, contextMessageId: question.id },
    });
    const locale =
      /[ăâđêôơưàáảãạèéẻẽẹìíỉĩịòóỏõọùúủũụỳýỷỹỵ]|\b(dang|viec|hom nay|tuan nay)\b/iu.test(
        parsed.data.question,
      )
        ? "vi"
        : /\b(what|which|how|why|list|summarize|show|when)\b/iu.test(
              parsed.data.question,
            )
          ? "en"
          : (settings?.uiLocale ?? "en");
    const snapshot = snapshotSchema.parse({
      question: parsed.data.question,
      filters: parsed.data.filters,
      steps: ["plan", "retrieve", "answer"],
      userMessageId: question.id,
      assistantMessageId: answer.id,
      contextMessageIds: history.map((m) => m.id),
      locale,
      timezone: settings?.timezone ?? "UTC",
    });
    return tx.chatRun.create({
      data: {
        conversationId,
        profileRevisionId: profile.id,
        snapshot: {
          ...snapshot,
          ...(parsed.data.idempotencyKey
            ? {
                requestKey: parsed.data.idempotencyKey,
                requestHash: hash({
                  question: parsed.data.question,
                  filters: parsed.data.filters,
                }),
              }
            : {}),
        },
        steps: { create: snapshot.steps.map((stepKey) => ({ stepKey })) },
      },
    });
  });
}
