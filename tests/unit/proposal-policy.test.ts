import { expect, it } from "vitest";
import {
  candidateSchema,
  normalizedItem,
} from "../../src/server/analysis/pipeline-contracts";
import { proposalPatch } from "../../src/server/analysis/proposal-policy";

it("does not propose old status updates or mutate fields through a LINK", () => {
  const item = normalizedItem.parse({
    sourceKey: "source",
    kind: "COMPLETION_REPORT",
    title: "Review",
    assignees: [],
    dueDate: null,
    completionScope: "ALL",
    evidence: {
      revisionId: "revision",
      start: 0,
      end: 15,
      quote: "Review is done",
    },
  });
  const target = candidateSchema.parse({
    id: "task",
    kind: "TASK",
    taskId: "task",
    title: "Review",
    version: 2,
    status: "IN_PROGRESS",
    dueDate: null,
    lastStatusAt: "2026-10-07T05:00:00Z",
    assigneeIds: [],
  });
  const suggestion = {
    sourceKey: "source",
    targetId: "task",
    kind: "UPDATE",
    uncertain: false,
    changes: { status: "DONE", deadline: null, title: null, assigneeIds: null },
  } as const;
  expect(
    proposalPatch({
      item,
      target,
      suggestion,
      occurredAt: "2026-10-06T02:00:00Z",
    }),
  ).toEqual({ kind: "LINK", patch: {} });
});
