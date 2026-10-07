import type { Prisma } from "../../generated/prisma/client";
import type { Candidate, NormalizedItem } from "./pipeline-contracts";
import { evidenceSchema } from "./pipeline-contracts";

type ActionSource = {
  readonly id: string;
  readonly taskId: string | null;
  readonly occurrences: readonly {
    readonly occurrence: {
      readonly title: string;
      readonly evidence: Prisma.JsonValue;
    };
  }[];
};
const normalized = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();
export function reconcile<T extends ActionSource>(
  actions: readonly T[],
  item: NormalizedItem,
  target?: Candidate,
) {
  const exact = actions.filter((action) =>
    action.occurrences.some((link) => {
      const source = evidenceSchema.safeParse(link.occurrence.evidence);
      return (
        source.success &&
        source.data.quote === item.evidence.quote &&
        source.data.revisionId === item.evidence.revisionId &&
        source.data.start === item.evidence.start &&
        source.data.end === item.evidence.end &&
        normalized(link.occurrence.title) === normalized(item.title)
      );
    }),
  );
  const cues = actions
    .filter((action) =>
      action.occurrences.some((link) => {
        const source = evidenceSchema.safeParse(link.occurrence.evidence);
        return (
          (source.success && source.data.quote === item.evidence.quote) ||
          normalized(link.occurrence.title) === normalized(item.title)
        );
      }),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const logical =
    exact.length === 1
      ? exact[0]
      : target?.kind === "ACTION"
        ? actions.find((a) => a.id === target.id)
        : target?.kind === "TASK"
          ? actions.find((a) => a.taskId === target.id)
          : cues[0];
  return { logical, exact: exact.length === 1, cues };
}
