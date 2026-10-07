import { z } from "zod";
import { HttpError } from "../auth/session";
import { database } from "../db/client";
import { parseEnvironment } from "../env";
import { openToken } from "./crypto";
import type { Provider } from "./protocol";

export async function runtimeProvider(
  ownerId: string,
  revisionId: string,
): Promise<Provider> {
  const revision = await database().providerProfileRevision.findFirst({
    where: { id: revisionId, profile: { ownerId, deletedAt: null } },
    include: { profile: true },
  });
  if (!revision?.ciphertext || !revision.nonce || !revision.tag)
    throw new HttpError(422, "TOKEN_REQUIRED");
  const env = parseEnvironment(process.env);
  if (revision.keyId !== env.PROVIDER_ENCRYPTION_KEY_ID)
    throw new HttpError(409, "ENCRYPTION_KEY_MISMATCH");
  let token: string;
  try {
    token = openToken(
      {
        ciphertext: revision.ciphertext,
        nonce: revision.nonce,
        tag: revision.tag,
      },
      { profileId: revision.profileId, revision: revision.number },
      Buffer.from(env.PROVIDER_ENCRYPTION_KEY, "base64"),
    );
  } catch {
    throw new HttpError(409, "INVALID_ENCRYPTED_CREDENTIAL");
  }
  return {
    contextBudget: revision.contextBudget,
    type: z
      .enum(["openai-compatible", "anthropic", "gemini"])
      .parse(revision.profile.type),
    baseUrl: revision.baseUrl,
    model: revision.model,
    token,
  };
}
