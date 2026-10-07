import { authenticate, respond } from "../../../../../../server/auth/session";
import { editParticipant } from "../../../../../../server/settings/projects";

export async function PATCH(
  request: Request,
  context: { readonly params: Promise<{ id: string; participantId: string }> },
) {
  return respond(async () => {
    const session = await authenticate(request, true);
    const params = await context.params;
    return Response.json(
      await editParticipant(
        session.ownerId,
        params.id,
        params.participantId,
        await request.json(),
      ),
    );
  });
}
