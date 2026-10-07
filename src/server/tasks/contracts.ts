import { z } from "zod";
export const statuses = [
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "DONE",
  "CANCELLED",
] as const;
export const taskFields = z.object({
  title: z.string().trim().min(1).max(300),
  status: z.enum(statuses),
  deadline: z.iso.date().nullable(),
  assigneeIds: z.array(z.uuid()).max(30),
});
export const createInput = taskFields
  .extend({ projectId: z.uuid() })
  .partial({ deadline: true, assigneeIds: true, status: true })
  .transform((input) => ({
    ...input,
    status: input.status ?? "TODO",
    deadline: input.deadline ?? null,
    assigneeIds: [...new Set(input.assigneeIds ?? [])],
  }));
export const editInput = taskFields
  .partial()
  .extend({ expectedVersion: z.number().int().positive() });
export const decisionInput = z.object({
  decision: z.enum(["ACCEPT", "REJECT"]),
  reason: z.string().max(2000).optional(),
  overrides: taskFields.partial().optional(),
  resolution: z.enum(["LINK_EXISTING", "CREATE_SEPARATE"]).optional(),
  targetTaskId: z.uuid().optional(),
});
export const proposalChanges = z.object({
  before: z.record(z.string(), z.json()),
  after: taskFields.partial(),
  requiresReconciliation: z.boolean(),
  occurrenceId: z.string().optional(),
  logicalActionId: z.string().nullable().optional(),
  alternatives: z.array(z.string()).optional(),
});
