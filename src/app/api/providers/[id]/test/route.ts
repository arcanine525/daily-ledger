import { z } from "zod";
import {
  authenticate,
  HttpError,
  respond,
} from "../../../../../server/auth/session";
import { database } from "../../../../../server/db/client";
import { generateStructured } from "../../../../../server/providers/adapters";
import { runtimeProvider } from "../../../../../server/providers/runtime";
import { validateUrl } from "../../../../../server/providers/transport";

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const session = await authenticate(request, true);
    const profile = await database().providerProfile.findFirst({
      where: {
        id: (await context.params).id,
        ownerId: session.ownerId,
        deletedAt: null,
      },
      include: { revisions: { orderBy: { number: "desc" }, take: 1 } },
    });
    if (!profile) throw new HttpError(404, "PROFILE_NOT_FOUND");
    const revision = profile.revisions[0];
    if (!revision?.ciphertext) throw new HttpError(422, "TOKEN_REQUIRED");
    validateUrl(revision.baseUrl);
    await generateStructured(
      await runtimeProvider(session.ownerId, revision.id),
      {
        schema: z.object({ ok: z.boolean() }),
        system: "Return an object with ok=true.",
        user: "Connection test.",
      },
    );
    return Response.json(
      { success: true, inferencePerformed: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
