import { z } from "zod";
import { summarySchema } from "./contracts";

export const evidenceSchema = z.object({
  revisionId: z.string(),
  start: z.number().int(),
  end: z.number().int(),
  quote: z.string(),
});
export const candidateSchema = z.object({
  id: z.string(),
  kind: z.enum(["TASK", "ACTION"]),
  title: z.string(),
  taskId: z.string().nullable(),
  version: z.number().int(),
  status: z
    .enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"])
    .nullable(),
  dueDate: z.string().nullable(),
  lastStatusAt: z.string().nullable(),
  assigneeIds: z.array(z.string()),
  fieldVersions: z.record(z.string(), z.number().int()).default({}),
});
export const matchSchema = z.object({
  suggestions: z.array(
    z.object({
      sourceKey: z.string(),
      targetId: z.string(),
      kind: z.enum(["LINK", "UPDATE"]),
      uncertain: z.boolean(),
      changes: z.object({
        title: z.string().nullable(),
        deadline: z.string().nullable(),
        status: z
          .enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"])
          .nullable(),
        assigneeIds: z.array(z.string()).nullable(),
      }),
    }),
  ),
});
export const normalizedItem = z.object({
  sourceKey: z.string(),
  kind: z.enum(["ACTION", "UPDATE", "COMPLETION_REPORT"]),
  title: z.string(),
  assignees: z.array(
    z.object({ id: z.string(), name: z.string(), isSelf: z.boolean() }),
  ),
  dueDate: z.string().nullable(),
  completionScope: z.enum(["ALL", "PARTIAL", "NONE"]),
  evidence: evidenceSchema,
});
export const mapCheckpoint = z.object({
  usage: z.json().nullable().optional(),
  summary: summarySchema,
  items: z.array(normalizedItem),
  rawResponse: z.string(),
});
export const reduceCheckpoint = z.object({
  summary: summarySchema,
  rawResponse: z.string(),
  usage: z.json().nullable().optional(),
});
export type Candidate = z.infer<typeof candidateSchema>;
export type NormalizedItem = z.infer<typeof normalizedItem>;
export type Matches = z.infer<typeof matchSchema>;
