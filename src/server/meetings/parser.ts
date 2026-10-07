export function transcriptSegments(raw: string) {
  const segments: {
    ordinal: number;
    startOffset: number;
    endOffset: number;
    speaker: string | null;
    timestamp: string | null;
  }[] = [];
  let offset = 0;
  for (const line of raw.split(/(?<=\n)/u)) {
    const endOffset = offset + line.length;
    if (line.trim()) {
      const match =
        /^(?:(\d{1,2}:\d{2}(?::\d{2})?)\s+)?([^:\r\n]{1,80}):\s/u.exec(line);
      segments.push({
        ordinal: segments.length,
        startOffset: offset,
        endOffset,
        speaker: match?.[2]?.trim() ?? null,
        timestamp: match?.[1] ?? null,
      });
    }
    offset = endOffset;
  }
  return segments;
}
