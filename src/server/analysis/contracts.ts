import { z } from "zod";

export const summarySchema = z.object({
  overview: z.string(),
  byPerson: z.array(
    z.object({ speaker: z.string(), update: z.string(), shared: z.boolean() }),
  ),
  blockers: z.array(z.string()),
  decisions: z.array(z.string()),
  todos: z.array(z.string()),
});
export const itemSchema = z.object({
  kind: z.enum(["ACTION", "UPDATE", "COMPLETION_REPORT"]),
  title: z.string().trim().min(1),
  quote: z.string().min(1),
  names: z.array(z.string()),
  duePhrase: z.string().nullable(),
  completionScope: z.enum(["ALL", "PARTIAL", "NONE"]),
});
export const extractionSchema = z.object({
  summary: summarySchema,
  items: z.array(itemSchema),
});
export type ExtractedItem = z.infer<typeof itemSchema>;
export type Extraction = z.infer<typeof extractionSchema>;
export const emptySummary = {
  overview: "",
  byPerson: [],
  blockers: [],
  decisions: [],
  todos: [],
} satisfies z.infer<typeof summarySchema>;
export function canComplete(item: ExtractedItem, matchedTask: boolean) {
  return (
    item.kind === "COMPLETION_REPORT" &&
    item.completionScope === "ALL" &&
    matchedTask
  );
}
