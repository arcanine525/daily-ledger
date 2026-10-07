import { z } from "zod";
export const filtersSchema = z.object({
  projectId: z.uuid().optional(),
  meetingId: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  dueFrom: z.iso.date().optional(),
  dueTo: z.iso.date().optional(),
  scope: z.enum(["ALL", "MINE", "UNASSIGNED"]).default("ALL"),
});
export const planSchema = z.object({
  intent: z.enum([
    "LOOKUP",
    "LIST_TASKS",
    "TASK_COUNTS",
    "TASK_HISTORY",
    "MEETING_SUMMARY",
    "CLARIFY",
  ]),
  englishQuery: z.string().max(1000),
  clarification: z.string().nullable(),
  asOf: z.iso.datetime().nullable(),
});
export const sourceSchema = z.object({
  id: z.string(),
  kind: z.enum(["TRANSCRIPT", "TASK", "TASK_EVENT", "PENDING"]),
  label: z.string(),
  text: z.string(),
  meetingId: z.string().nullable(),
  revisionId: z.string().nullable(),
  taskId: z.string().nullable(),
  eventId: z.string().nullable(),
  version: z.number().nullable(),
  start: z.number().nullable(),
  end: z.number().nullable(),
});
export const contextSchema = z.object({
  sources: z.array(sourceSchema),
  sections: z.json(),
  coverage: z.object({
    exhaustive: z.boolean(),
    meetingIds: z.array(z.string()),
  }),
  totals: z.object({ confirmed: z.number(), pending: z.number() }).nullable(),
});
export const answerSchema = z.object({
  text: z.string(),
  citations: z.array(z.object({ sourceId: z.string(), quote: z.string() })),
});
export const mapSchema = z.object({
  text: z.string().max(3000),
  sourceIds: z.array(z.string()).max(12),
});
export const snapshotSchema = z.object({
  question: z.string(),
  filters: filtersSchema,
  steps: z.array(z.string()),
  userMessageId: z.string(),
  assistantMessageId: z.string(),
  contextMessageIds: z.array(z.string()),
  locale: z.enum(["vi", "en"]),
  timezone: z.string(),
  requestKey: z.string().optional(),
  requestHash: z.string().optional(),
});
export type ChatSource = z.infer<typeof sourceSchema>;
export type ChatFilters = z.infer<typeof filtersSchema>;
