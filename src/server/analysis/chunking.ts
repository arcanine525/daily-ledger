import { HttpError } from "../auth/session";

export function chunks(raw: string, limit = 12000) {
  if (!Number.isInteger(limit) || limit < 1000)
    throw new HttpError(422, "CONTEXT_BUDGET_TOO_SMALL");
  const result: { start: number; end: number; text: string }[] = [];
  let start = 0;
  while (start < raw.length) {
    let end = Math.min(raw.length, start + limit);
    if (end < raw.length) {
      const newline = raw.lastIndexOf("\n", end - 1);
      if (newline > start + limit / 2) end = newline + 1;
      const code = raw.charCodeAt(end - 1);
      if (code >= 0xd800 && code <= 0xdbff) end--;
    }
    result.push({ start, end, text: raw.slice(start, end) });
    if (end === raw.length) break;
    let next = Math.max(start + 1, end - 500);
    const code = raw.charCodeAt(next);
    if (code >= 0xdc00 && code <= 0xdfff) next++;
    start = next;
  }
  return result;
}
