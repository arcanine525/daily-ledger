import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError } from "../auth/session";
import { database } from "../db/client";
import { parseEnvironment } from "../env";
import { openToken, sealToken } from "./crypto";
import { validateUrl } from "./transport";

export const profileInput = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(["openai-compatible", "anthropic", "gemini"]),
  baseUrl: z.url(),
  model: z.string().trim().min(1).max(120),
  contextBudget: z.number().int().min(4096).max(1000000).default(32000),
  token: z.string().min(1).max(4096).optional(),
});
export async function listProfiles(ownerId: string) {
  const rows = await database().providerProfile.findMany({
    where: { ownerId, deletedAt: null },
    include: { revisions: { orderBy: { number: "desc" }, take: 1 } },
  });
  return rows.map((row) => {
    const revision = row.revisions[0];
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      revision: revision?.number,
      baseUrl: revision?.baseUrl,
      model: revision?.model,
      contextBudget: revision?.contextBudget,
      hasToken: Boolean(revision?.ciphertext),
    };
  });
}
export async function saveProfile(
  ownerId: string,
  input: unknown,
  id?: string,
) {
  const parsed = profileInput.safeParse(input);
  if (!parsed.success) throw new HttpError(422, "INVALID_PROVIDER");
  const data = parsed.data;
  validateUrl(data.baseUrl);
  const env = parseEnvironment(process.env),
    key = Buffer.from(env.PROVIDER_ENCRYPTION_KEY, "base64");
  return database().$transaction(async (db) => {
    const profile = id
      ? await db.providerProfile.findFirst({
          where: { id, ownerId, deletedAt: null },
          include: { revisions: { orderBy: { number: "desc" }, take: 1 } },
        })
      : null;
    if (id && !profile) throw new HttpError(404, "PROFILE_NOT_FOUND");
    if (profile && profile.type !== data.type)
      throw new HttpError(422, "CREATE_PROFILE_FOR_DIFFERENT_PROTOCOL");
    const profileId = profile?.id ?? randomUUID(),
      previous = profile?.revisions[0],
      number = (previous?.number ?? 0) + 1;
    let token = data.token;
    if (!token && previous?.ciphertext && previous.nonce && previous.tag) {
      if (previous.keyId !== env.PROVIDER_ENCRYPTION_KEY_ID)
        throw new HttpError(409, "ENCRYPTION_KEY_MISMATCH");
      token = openToken(
        {
          ciphertext: previous.ciphertext,
          nonce: previous.nonce,
          tag: previous.tag,
        },
        { profileId, revision: previous.number },
        key,
      );
    }
    const sealed = token
      ? sealToken(token, { profileId, revision: number }, key)
      : null;
    if (profile)
      await db.providerProfile.update({
        where: { id: profileId },
        data: { name: data.name },
      });
    else
      await db.providerProfile.create({
        data: { id: profileId, ownerId, name: data.name, type: data.type },
      });
    await db.providerProfileRevision.create({
      data: {
        profileId,
        number,
        baseUrl: data.baseUrl,
        model: data.model,
        contextBudget: data.contextBudget,
        ...(sealed ? { ...sealed, keyId: env.PROVIDER_ENCRYPTION_KEY_ID } : {}),
      },
    });
    return { id: profileId, revision: number, hasToken: Boolean(sealed) };
  });
}
export async function deleteProfile(ownerId: string, id: string) {
  return database().$transaction(async (db) => {
    const profile = await db.providerProfile.findFirst({
      where: { id, ownerId, deletedAt: null },
    });
    if (!profile) throw new HttpError(404, "PROFILE_NOT_FOUND");
    await db.analysisRun.updateMany({
      where: {
        profile: { profileId: id },
        state: { in: ["READY", "RUNNING", "PAUSED_RETRYABLE"] },
      },
      data: { state: "CANCELLED", fencingVersion: { increment: 1 } },
    });
    await db.chatRun.updateMany({
      where: {
        profile: { profileId: id },
        state: { in: ["READY", "RUNNING", "PAUSED_RETRYABLE"] },
      },
      data: { state: "CANCELLED", fencingVersion: { increment: 1 } },
    });
    await db.providerProfileRevision.updateMany({
      where: { profileId: id },
      data: { ciphertext: null, nonce: null, tag: null, keyId: null },
    });
    await db.providerProfile.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await db.userSettings.updateMany({
      where: { ownerId, analysisProfileId: id },
      data: { analysisProfileId: null },
    });
    await db.userSettings.updateMany({
      where: { ownerId, chatProfileId: id },
      data: { chatProfileId: null },
    });
  });
}
