import {
  authenticate,
  HttpError,
  respond,
} from "../../../../../server/auth/session";
import { database } from "../../../../../server/db/client";
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
    return Response.json(
      {
        code: "ADAPTER_PENDING_TASK_9",
        endpointValidated: true,
        inferencePerformed: false,
      },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  });
}
