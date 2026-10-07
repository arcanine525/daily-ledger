import { HttpError } from "../auth/session";

export type Participant = {
  readonly id: string;
  readonly displayName: string;
  readonly aliases: readonly string[];
  readonly isSelf: boolean;
};
export function evidenceSpan(
  raw: string,
  quote: string,
  range?: { readonly start: number; readonly end: number },
) {
  const source = range ? raw.slice(range.start, range.end) : raw;
  const local = source.indexOf(quote);
  const start = local < 0 ? -1 : local + (range?.start ?? 0);
  if (!quote || start < 0) throw new HttpError(502, "INVALID_EVIDENCE");
  if (source.indexOf(quote, local + 1) >= 0)
    throw new HttpError(502, "AMBIGUOUS_EVIDENCE");
  return { start, end: start + quote.length, quote };
}
export function resolveAssignees(input: {
  readonly names: readonly string[];
  readonly participants: readonly Participant[];
  readonly sharedSpeaker: boolean;
  readonly quote: string;
  readonly speaker?: string | null;
  readonly speakerParticipantId?: string | null;
}) {
  const matched = new Map<
    string,
    { id: string; name: string; isSelf: boolean }
  >();
  const spokenQuote = input.quote.replace(
    /^(?:\d{1,2}:\d{2}(?::\d{2})?\s+)?[^:\r\n]{1,80}:\s*/u,
    "",
  );
  for (const label of input.names) {
    const normalized = label.trim().toLowerCase();
    let candidates = input.participants.filter((p) =>
      [p.displayName, ...p.aliases].some(
        (alias) => alias.trim().toLowerCase() === normalized,
      ),
    );
    if (
      candidates.length > 1 &&
      !input.sharedSpeaker &&
      input.speakerParticipantId &&
      /^(?:(?:Today|Tomorrow|Yesterday),?\s+)?I\b/iu.test(spokenQuote) &&
      !spokenQuote.toLowerCase().includes(normalized)
    )
      candidates = candidates.filter(
        (person) => person.id === input.speakerParticipantId,
      );
    if (candidates.length !== 1) continue;
    const participant = candidates[0];
    if (!participant) continue;
    const labels = [participant.displayName, ...participant.aliases];
    const explicit = labels.some((alias) =>
      new RegExp(
        `(?:^|[^\\p{L}\\p{N}])${alias.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^\\p{L}\\p{N}])`,
        "iu",
      ).test(spokenQuote),
    );
    const fromSpeaker =
      !input.sharedSpeaker &&
      Boolean(
        input.speaker &&
          labels.some(
            (alias) =>
              alias.trim().toLowerCase() ===
              input.speaker?.trim().toLowerCase(),
          ),
      );
    if (!explicit && !fromSpeaker) continue;
    matched.set(participant.id, {
      id: participant.id,
      name: participant.displayName,
      isSelf: participant.isSelf,
    });
  }
  return [...matched.values()];
}
