import { HttpError } from "../auth/session";
import type { Candidate, Matches, NormalizedItem } from "./pipeline-contracts";

export function proposalPatch(input: {
  readonly item: NormalizedItem;
  readonly target: Candidate | undefined;
  readonly suggestion: Matches["suggestions"][number] | undefined;
  readonly occurredAt: string;
}) {
  const { item, target, suggestion } = input;
  let kind: "CREATE" | "LINK" | "UPDATE" = suggestion?.kind ?? "CREATE";
  const patch: {
    title?: string;
    deadline?: string;
    status?: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELLED";
    assigneeIds?: string[];
  } = {};
  if (kind === "UPDATE" && suggestion && target) {
    if (suggestion.changes.title) patch.title = suggestion.changes.title;
    if (suggestion.changes.deadline) {
      if (suggestion.changes.deadline !== item.dueDate)
        throw new HttpError(502, "INVALID_DEADLINE_PROPOSAL");
      patch.deadline = item.dueDate;
    }
    if (suggestion.changes.status) {
      const old =
        target.lastStatusAt &&
        new Date(target.lastStatusAt) > new Date(input.occurredAt);
      if (
        !old &&
        (suggestion.changes.status !== "DONE" || item.completionScope === "ALL")
      )
        patch.status = suggestion.changes.status;
    }
    if (suggestion.changes.assigneeIds) {
      const ids = item.assignees.map((a) => a.id).sort();
      if (
        JSON.stringify([...suggestion.changes.assigneeIds].sort()) !==
        JSON.stringify(ids)
      )
        throw new HttpError(502, "INVALID_ASSIGNEE_PROPOSAL");
      if (ids.length) patch.assigneeIds = ids;
    }
    if (!Object.keys(patch).length) kind = "LINK";
  }
  if (
    target?.kind === "ACTION" ||
    (item.kind === "COMPLETION_REPORT" && item.completionScope !== "ALL")
  )
    kind = "LINK";
  return { kind, patch: kind === "LINK" ? {} : patch };
}
