import { z } from "zod";
export const settingsSchema = z.object({
  uiLocale: z.enum(["vi", "en"]),
  outputLocale: z.enum(["vi", "en"]),
  timezone: z.string().nullable(),
  displayName: z.string(),
  analysisProfileId: z.string().nullable(),
  chatProfileId: z.string().nullable(),
  aliases: z.array(z.string()),
});
export const profilesSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    baseUrl: z.string(),
    model: z.string(),
    hasToken: z.boolean(),
  }),
);
export const projectsSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    archivedAt: z.string().nullable(),
    participants: z.array(
      z.object({
        id: z.string(),
        displayName: z.string(),
        isSelf: z.boolean(),
        archivedAt: z.string().nullable(),
        aliases: z.array(z.object({ normalized: z.string() })),
      }),
    ),
  }),
);
export type Settings = z.infer<typeof settingsSchema>;
export type Profile = z.infer<typeof profilesSchema>[number];
export type Project = z.infer<typeof projectsSchema>[number];
export type RunAction = (action: () => Promise<unknown>) => Promise<boolean>;
