import { authenticate, respond } from "../../../../../server/auth/session";
import { purgeMeeting } from "../../../../../server/retention/service";
export async function POST(
  request: Request,
  context: { readonly params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const session = await authenticate(request, true);
    return Response.json(
      await purgeMeeting(
        session.ownerId,
        (await context.params).id,
        await request.json(),
      ),
    );
  });
}
