import { expect, it } from "vitest";
import { chunks } from "../../src/server/analysis/chunking";
import {
  canComplete,
  extractionSchema,
} from "../../src/server/analysis/contracts";
import { resolveDeadline } from "../../src/server/analysis/dates";
import {
  evidenceSpan,
  resolveAssignees,
} from "../../src/server/analysis/evidence";

it("pins exact Unicode quotes and rejects fabricated or ambiguous text", () => {
  const raw = "Mai: 😀 Review API.\nAlex: Review API.";
  const span = evidenceSpan(raw, "😀 Review API.");
  expect(raw.slice(span.start, span.end)).toBe("😀 Review API.");
  expect(() => evidenceSpan(raw, "Invented")).toThrow();
  expect(() => evidenceSpan(raw, "Review API.")).toThrow();
});
it("leaves shared-speaker work unresolved unless the quote names the assignee", () => {
  const participants = [
    { id: "mai", displayName: "Mai", aliases: ["Mai"], isSelf: true },
  ];
  expect(
    resolveAssignees({
      names: ["Mai"],
      participants,
      sharedSpeaker: true,
      quote: "I will do it",
    }),
  ).toEqual([]);
  expect(
    resolveAssignees({
      names: ["Mai"],
      participants,
      sharedSpeaker: true,
      quote: "Mai will do it",
    }),
  ).toHaveLength(1);
});
it("resolves tomorrow relative to meeting timezone not processing time", () => {
  expect(
    resolveDeadline({
      phrase: "tomorrow",
      occurredAt: "2026-10-07T23:30:00Z",
      timezone: "Asia/Ho_Chi_Minh",
    }),
  ).toBe("2026-10-09");
  expect(
    resolveDeadline({
      phrase: "next Friday",
      occurredAt: "2026-10-07T23:30:00Z",
      timezone: "UTC",
    }),
  ).toBeNull();
});
it("covers a long transcript without truncation or Unicode splitting", () => {
  const raw = "Mai: 😀 I will review the API.\n".repeat(5000);
  const result = chunks(raw, 12000);
  expect(result.length).toBeGreaterThan(1);
  expect(result[0]?.start).toBe(0);
  expect(result.at(-1)?.end).toBe(raw.length);
  for (const [index, chunk] of result.entries()) {
    expect(chunk.text).toBe(raw.slice(chunk.start, chunk.end));
    expect(chunk.text.length).toBeLessThanOrEqual(12000);
    if (index > 0)
      expect(chunk.start).toBeLessThanOrEqual(result[index - 1]?.end ?? 0);
  }
});

it("keeps completion reports out of new-task creation and requires whole-task completion", () => {
  const report = {
    kind: "COMPLETION_REPORT",
    title: "Review",
    quote: "My part is done",
    names: ["Mai"],
    duePhrase: null,
    completionScope: "PARTIAL",
  } as const;
  expect(canComplete({ ...report, names: [...report.names] }, true)).toBe(
    false,
  );
  expect(
    canComplete(
      { ...report, names: [...report.names], completionScope: "ALL" },
      false,
    ),
  ).toBe(false);
  expect(
    canComplete(
      { ...report, names: [...report.names], completionScope: "ALL" },
      true,
    ),
  ).toBe(true);
  expect(
    extractionSchema.safeParse({
      summary: {
        overview: "Daily",
        byPerson: [],
        blockers: [],
        decisions: [],
        todos: [],
      },
      items: [],
    }).success,
  ).toBe(true);
  expect(
    extractionSchema.safeParse({ summary: { overview: "Daily" }, items: [] })
      .success,
  ).toBe(false);
});
