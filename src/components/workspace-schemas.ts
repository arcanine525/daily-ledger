import { z } from "zod";
export const personSchema = z.object({
  id: z.string(),
  name: z.string(),
  isSelf: z.boolean().optional(),
  mappingVersion: z.number().optional(),
});
export const summarySchema = z.object({
  overview: z.string(),
  byPerson: z.array(
    z.object({ speaker: z.string(), update: z.string(), shared: z.boolean() }),
  ),
  blockers: z.array(z.string()),
  decisions: z.array(z.string()),
  todos: z.array(z.string()),
});
export const evidence = z.object({
  revisionId: z.string(),
  start: z.number(),
  end: z.number(),
  quote: z.string(),
});
const changes = z.object({
  before: z.record(z.string(), z.json()),
  after: z.object({
    title: z.string().optional(),
    deadline: z.string().nullable().optional(),
    status: z.string().optional(),
    assigneeIds: z.array(z.string()).optional(),
  }),
  requiresReconciliation: z.boolean(),
  occurrenceId: z.string().optional(),
});
export const proposalSchema = z.object({
  id: z.string(),
  kind: z.enum(["CREATE", "LINK", "UPDATE"]),
  state: z.string(),
  changes,
  evidence,
  taskId: z.string().nullable(),
});
export const actionSchema = z.object({
  occurrences: z.array(
    z.object({ occurrence: z.object({ analysisId: z.string(), evidence }) }),
  ),
  id: z.string(),
  title: z.string(),
  assignees: z.array(personSchema),
  dueDate: z.string().nullable(),
  taskId: z.string().nullable(),
  reviewState: z.string(),
  version: z.number(),
  sourceChanged: z.boolean(),
  retainedMissing: z.boolean(),
  proposals: z.array(proposalSchema),
});
export const meetingSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  occurredAt: z.string(),
  meetingTimezone: z.string(),
  currentRevisionNumber: z.number(),
  activeAnalysisId: z.string().nullable(),
  revisions: z.array(
    z.object({
      id: z.string(),
      number: z.number(),
      rawText: z.string(),
      sha256: z.string(),
    }),
  ),
  analyses: z.array(
    z.object({
      id: z.string(),
      number: z.number(),
      revisionId: z.string(),
      summary: summarySchema,
      locale: z.string(),
    }),
  ),
  actions: z.array(actionSchema),
  identity: z.array(
    z.object({
      speaker: z.string(),
      isSharedSpeaker: z.boolean(),
      mapping: z.json(),
    }),
  ),
});
export const meetingList = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      projectId: z.string(),
      title: z.string(),
      occurredAt: z.string(),
      currentRevisionNumber: z.number(),
      activeAnalysisId: z.string().nullable(),
    }),
  ),
  nextCursor: z.string().nullable(),
});
export const taskSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  status: z.string(),
  version: z.number(),
  dueDate: z.string().nullable(),
  origin: z.string(),
  assignments: z.array(
    z.object({
      participantId: z.string(),
      nameSnapshot: z.string(),
      isSelfSnapshot: z.boolean(),
    }),
  ),
  evidence: z.array(
    z.object({
      id: z.string(),
      actionId: z.string().nullable(),
      sourceMeetingId: z.string().nullable(),
      sourceRevisionId: z.string().nullable(),
      quote: z.string().nullable(),
      sourceChanged: z.boolean(),
      sourceDeleted: z.boolean(),
      startOffset: z.number().nullable(),
      endOffset: z.number().nullable(),
    }),
  ),
  events: z
    .array(
      z.object({
        id: z.string(),
        kind: z.string(),
        before: z.json(),
        after: z.json(),
        recordedAt: z.string(),
        effectiveAt: z.string(),
        sourceOccurredAt: z.string().nullable(),
      }),
    )
    .optional(),
});
export const taskList = z.object({
  items: z.array(taskSchema),
  total: z.number(),
  nextCursor: z.string().nullable(),
});
export const pendingSchema = z.array(
  proposalSchema.extend({
    action: z.object({
      id: z.string(),
      title: z.string(),
      assignees: z.array(personSchema),
      dueDate: z.string().nullable(),
      version: z.number(),
      meeting: z.object({
        id: z.string(),
        title: z.string(),
        projectId: z.string(),
        project: z.object({ name: z.string() }),
      }),
    }),
  }),
);
export const runSchema = z.object({
  id: z.string(),
  state: z.string(),
  snapshot: z.object({
    steps: z.array(z.string()),
    outputLocale: z.string().optional(),
  }),
  steps: z.array(
    z.object({
      key: z.string(),
      state: z.string(),
      attempt: z.number(),
      error: z.json().nullable(),
    }),
  ),
});
export type Meeting = z.infer<typeof meetingSchema>;
export type Proposal = z.infer<typeof proposalSchema>;
export type Task = z.infer<typeof taskSchema>;
