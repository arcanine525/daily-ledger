import { transcriptSegments } from "../meetings/parser";

export function segmentHints(
  raw: string,
  chunk: { readonly start: number; readonly end: number },
) {
  return transcriptSegments(raw)
    .filter(
      (segment) =>
        segment.endOffset > chunk.start && segment.startOffset < chunk.end,
    )
    .map((segment) => [
      segment.ordinal,
      Math.max(0, segment.startOffset - chunk.start),
      Math.min(chunk.end - chunk.start, segment.endOffset - chunk.start),
      segment.speaker,
    ]);
}
