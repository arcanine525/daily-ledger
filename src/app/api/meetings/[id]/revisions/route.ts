import { authenticate, respond } from "../../../../../server/auth/session";
import { reviseMeeting } from "../../../../../server/meetings/archive";

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const session = await authenticate(request, true);
    return Response.json(
      await reviseMeeting(
        session.ownerId,
        (await context.params).id,
        await request.json(),
      ),
      { status: 201 },
    );
  });
}
