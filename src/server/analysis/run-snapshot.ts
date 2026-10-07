import { z } from "zod";

export const runSnapshot = z.object({
  steps: z.array(z.string()),
  revisionNumber: z.number().int(),
  outputLocale: z.enum(["vi", "en"]),
  timezone: z.string(),
  occurredAt: z.string(),
  participants: z.array(
    z.object({
      id: z.string(),
      displayName: z.string(),
      isSelf: z.boolean(),
      aliases: z.array(z.string()),
    }),
  ),
  identity: z.array(
    z.object({
      speaker: z.string(),
      isSharedSpeaker: z.boolean(),
      mapping: z.json(),
    }),
  ),
});
export type RunSnapshot = z.infer<typeof runSnapshot>;
