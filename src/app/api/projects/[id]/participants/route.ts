import { authenticate, respond } from "../../../../../server/auth/session";
import {
  addParticipant,
  mergeParticipants,
} from "../../../../../server/settings/projects";

type Context = { readonly params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return respond(async () => {
    const session = await authenticate(request, true);
    return Response.json(
      await addParticipant(
        session.ownerId,
        (await context.params).id,
        await request.json(),
      ),
      { status: 201 },
    );
  });
}
export async function PATCH(request: Request, context: Context) {
  return respond(async () => {
    const session = await authenticate(request, true);
    return Response.json(
      await mergeParticipants(
        session.ownerId,
        (await context.params).id,
        await request.json(),
      ),
    );
  });
}
