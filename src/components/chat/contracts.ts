import { z } from "zod";
import { filtersSchema } from "../../server/chat/contracts";

export { filtersSchema };
export const threadsSchema = z.array(
  z.object({ id: z.string(), title: z.string() }),
);
export const chatRunSchema = z.object({
  id: z.string(),
  state: z.string(),
  leaseUntil: z.string().nullable(),
  snapshot: z.object({
    steps: z.array(z.string()),
    filters: filtersSchema,
    assistantMessageId: z.string(),
  }),
  steps: z.array(
    z.object({ stepKey: z.string(), state: z.string(), attempt: z.number() }),
  ),
});
export const threadSchema = z.object({
  id: z.string(),
  title: z.string(),
  run: chatRunSchema.nullable(),
});
export const citationSchema = z.object({
  id: z.string(),
  revisionId: z.string().nullable(),
  taskId: z.string().nullable(),
  eventId: z.string().nullable(),
  label: z.string(),
  quote: z.string().nullable(),
  startOffset: z.number().nullable(),
  endOffset: z.number().nullable(),
  sourceDeleted: z.boolean(),
});
export const messagesSchema = z.array(
  z.object({
    id: z.string(),
    role: z.string(),
    body: z.string(),
    state: z.string(),
    contextEligible: z.boolean(),
    filters: filtersSchema,
    createdAt: z.string(),
    citations: z.array(citationSchema),
  }),
);
const taskRow = z.object({
  taskId: z.string(),
  sourceId: z.string(),
  state: z.object({
    title: z.string(),
    status: z.string(),
    deadline: z.string().nullable(),
    assignees: z.array(z.object({ name: z.string() })),
  }),
});
const pendingRow = z.object({
  id: z.string(),
  title: z.string(),
  deadline: z.string().nullable(),
  assignees: z.array(z.object({ name: z.string() })),
  suspectDuplicate: z.boolean().optional(),
});
export const replySchema = z.object({
  text: z.string(),
  sections: z.object({
    appState: z.array(taskRow).optional(),
    pendingTodos: z.array(pendingRow).optional(),
    meetingEvidence: z
      .array(
        z.object({
          meetingId: z.string(),
          title: z.string(),
          occurredAt: z.string(),
          summary: z.json().nullable(),
        }),
      )
      .optional(),
  }),
  totals: z.object({ confirmed: z.number(), pending: z.number() }).nullable(),
  coverage: z.object({
    exhaustive: z.boolean(),
    meetingIds: z.array(z.string()),
  }),
});
export const sourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("TRANSCRIPT"),
    label: z.string(),
    meetingId: z.string(),
    revisionId: z.string(),
    revisionNumber: z.number(),
    quote: z.string().nullable(),
    start: z.number().nullable(),
    end: z.number().nullable(),
    rawText: z.string(),
  }),
  z.object({
    kind: z.enum(["TASK", "TASK_EVENT"]),
    label: z.string(),
    taskId: z.string(),
    eventId: z.string().nullable(),
    recordedAt: z.string(),
    state: z.json(),
  }),
]);
export type ChatRun = z.infer<typeof chatRunSchema>;
export type ChatFilters = z.infer<typeof filtersSchema>;
export type ChatMessage = z.infer<typeof messagesSchema>[number];
export type Reply = z.infer<typeof replySchema>;
