import { z } from "zod";
import { HttpError } from "../auth/session";
import { database } from "../db/client";

const timezone = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
});
const schema = z.object({
  uiLocale: z.enum(["vi", "en"]).optional(),
  outputLocale: z.enum(["vi", "en"]).optional(),
  timezone: timezone.optional(),
  initializeTimezone: z.boolean().optional(),
  displayName: z.string().trim().max(100).optional(),
  analysisProfileId: z.uuid().nullable().optional(),
  chatProfileId: z.uuid().nullable().optional(),
  aliases: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
});
export async function readSettings(ownerId: string) {
  const db = database();
  const settings = await db.userSettings.findUnique({ where: { ownerId } });
  return {
    ...(settings ?? {
      ownerId,
      uiLocale: "vi",
      outputLocale: "vi",
      timezone: null,
      displayName: "",
      analysisProfileId: null,
      chatProfileId: null,
    }),
    aliases: (await db.identityAlias.findMany({ where: { ownerId } })).map(
      (alias) => alias.label,
    ),
  };
}
export async function saveSettings(ownerId: string, input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success) throw new HttpError(422, "INVALID_SETTINGS");
  const { initializeTimezone, aliases, ...patch } = result.data;
  return database().$transaction(async (db) => {
    for (const id of [patch.analysisProfileId, patch.chatProfileId])
      if (
        id &&
        !(await db.providerProfile.findFirst({
          where: { id, ownerId, deletedAt: null },
        }))
      )
        throw new HttpError(422, "INVALID_PROFILE_SELECTION");
    const data = {
      ...(patch.uiLocale !== undefined ? { uiLocale: patch.uiLocale } : {}),
      ...(patch.outputLocale !== undefined
        ? { outputLocale: patch.outputLocale }
        : {}),
      ...(patch.timezone !== undefined && !initializeTimezone
        ? { timezone: patch.timezone }
        : {}),
      ...(patch.displayName !== undefined
        ? { displayName: patch.displayName }
        : {}),
      ...(patch.analysisProfileId !== undefined
        ? { analysisProfileId: patch.analysisProfileId }
        : {}),
      ...(patch.chatProfileId !== undefined
        ? { chatProfileId: patch.chatProfileId }
        : {}),
    };
    await db.userSettings.upsert({
      where: { ownerId },
      create: { ownerId, ...data },
      update: data,
    });
    if (initializeTimezone && patch.timezone !== undefined)
      await db.userSettings.updateMany({
        where: { ownerId, timezone: null },
        data: { timezone: patch.timezone },
      });
    if (aliases) {
      await db.identityAlias.deleteMany({ where: { ownerId } });
      const unique = new Map(
        aliases.map((label) => [label.toLowerCase(), label]),
      );
      await db.identityAlias.createMany({
        data: [...unique].map(([normalized, label]) => ({
          ownerId,
          normalized,
          label,
        })),
      });
    }
    return { saved: true };
  });
}
