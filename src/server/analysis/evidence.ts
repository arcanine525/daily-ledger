import { HttpError } from "../auth/session";

export type Participant = {
  readonly id: string;
  readonly displayName: string;
  readonly aliases: readonly string[];
  readonly isSelf: boolean;
};
export function evidenceSpan(raw: string, quote: string) {
  const start = raw.indexOf(quote);
  if (!quote || start < 0) throw new HttpError(502, "INVALID_EVIDENCE");
  if (raw.indexOf(quote, start + 1) >= 0)
    throw new HttpError(502, "AMBIGUOUS_EVIDENCE");
  return { start, end: start + quote.length, quote };
}
export function resolveAssignees(input: {
  readonly names: readonly string[];
  readonly participants: readonly Participant[];
  readonly sharedSpeaker: boolean;
  readonly quote: string;
}) {
  const matched = new Map<
    string,
    { id: string; name: string; isSelf: boolean }
  >();
  for (const label of input.names) {
    const normalized = label.trim().toLowerCase();
    const candidates = input.participants.filter((p) =>
      [p.displayName, ...p.aliases].some(
        (alias) => alias.trim().toLowerCase() === normalized,
      ),
    );
    if (candidates.length !== 1) continue;
    const participant = candidates[0];
    if (!participant) continue;
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (
      input.sharedSpeaker &&
      !new RegExp(
        `(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`,
        "iu",
      ).test(input.quote)
    )
      continue;
    matched.set(participant.id, {
      id: participant.id,
      name: participant.displayName,
      isSelf: participant.isSelf,
    });
  }
  return [...matched.values()];
}
