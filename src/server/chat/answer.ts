import type { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { HttpError } from "../auth/session";
import { generateStructured } from "../providers/adapters";
import type { Provider, Transport } from "../providers/protocol";
import { saveCitations, validateSources } from "./citations";
import {
  answerSchema,
  type contextSchema,
  mapSchema,
  type planSchema,
  type snapshotSchema,
} from "./contracts";
import { unavailableMessages } from "./history";
import { chatReduction } from "./reduction";
import type { ChatClaim } from "./runs";
import { completeChat } from "./runs";
import { streamAnswer } from "./stream-answer";

export async function finishAnswer(
  input: {
    readonly claim: ChatClaim;
    readonly snapshot: z.infer<typeof snapshotSchema>;
    readonly plan: z.infer<typeof planSchema>;
    readonly context: z.infer<typeof contextSchema>;
    readonly provider: Provider;
    readonly checkpoint: (key: string) => Promise<Prisma.JsonValue>;
  },
  transport?: Transport,
  onProgress?: (event: { type: string; data: unknown }) => void,
) {
  const { claim, snapshot, plan, context, provider } = input;
  onProgress?.({
    type: "stage",
    data: { stage: "ANSWERING", sourceCount: context.sources.length },
  });
  const mapCount = snapshot.steps.filter((key) =>
      key.startsWith("map:"),
    ).length,
    root = chatReduction(mapCount).root;
  const summary = root ? mapSchema.parse(await input.checkpoint(root)) : null;
  const sources = summary
    ? context.sources
        .filter((source) => summary.sourceIds.includes(source.id))
        .map((source) => {
          const text =
            source.text.split("\n")[0]?.slice(0, 400) ??
            source.text.slice(0, 400);
          return {
            ...source,
            text,
            end:
              source.start !== null ? source.start + text.length : source.end,
          };
        })
    : context.sources;
  let answer: z.infer<typeof answerSchema>;
  if (plan.intent === "CLARIFY")
    answer = {
      text:
        plan.clarification ??
        (snapshot.locale === "vi"
          ? "Bạn muốn lọc theo ngày họp hay deadline?"
          : "Meeting date or deadline?"),
      citations: [],
    };
  else if (!sources.length)
    answer = {
      text:
        snapshot.locale === "vi"
          ? "Không đủ dữ liệu trong phạm vi đã chọn."
          : "Insufficient evidence in the selected scope.",
      citations: [],
    };
  else {
    const prompt = {
      system: `Answer in ${snapshot.locale} from data only. Cite exact source snippets and supplied IDs. Never mutate. Separate confirmed unfinished tasks from pending Todos; no combined total and no pending business status. Historical replies separate app history and meeting evidence with conflicts. Lookup is top-ranked, not exhaustive.`,
      user: JSON.stringify({
        phase: "chat-answer",
        question: snapshot.question,
        intent: plan.intent,
        sources,
        summary,
        totals: context.totals,
        coverage: context.coverage,
        ...(!summary ? { sections: context.sections } : {}),
      }),
    };
    answer = transport
      ? (
          await generateStructured(
            provider,
            { ...prompt, schema: answerSchema },
            transport,
          )
        ).value
      : await streamAnswer(provider, prompt, onProgress);
    if (!answer.citations.length)
      throw new HttpError(502, "CHAT_CITATIONS_REQUIRED");
    if (
      answer.citations.some(
        (citation) =>
          !sources.some((source) => source.id === citation.sourceId),
      )
    )
      throw new HttpError(502, "INVALID_CHAT_CITATION");
  }
  await completeChat(
    claim,
    { answer, coverage: context.coverage },
    async (tx) => {
      await validateSources(tx, claim.ownerId, context.sources);
      const excluded = await unavailableMessages(claim.ownerId, tx);
      if (
        excluded.some((row) =>
          [snapshot.userMessageId, ...snapshot.contextMessageIds].includes(
            row.id,
          ),
        )
      )
        throw new HttpError(409, "CHAT_CONTEXT_UNAVAILABLE");
      await saveCitations(tx, {
        ownerId: claim.ownerId,
        messageId: snapshot.assistantMessageId,
        sources: context.sources,
        citations: answer.citations,
      });
      await tx.chatMessage.update({
        where: { id: snapshot.assistantMessageId },
        data: {
          state: "complete",
          body: JSON.stringify({
            text: answer.text,
            sections: context.sections,
            totals: context.totals,
            coverage: context.coverage,
          }),
        },
      });
    },
  );
  onProgress?.({
    type: "done",
    data: {
      messageId: snapshot.assistantMessageId,
      text: answer.text,
      verified: true,
      coverage: context.coverage,
    },
  });
  return {
    replayed: false,
    completed: true,
    messageId: snapshot.assistantMessageId,
  };
}
