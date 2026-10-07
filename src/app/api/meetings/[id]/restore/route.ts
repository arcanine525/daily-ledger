import { authenticate, respond } from "../../../../../server/auth/session";
import { restoreMeeting } from "../../../../../server/retention/service";
export async function POST(
  request: Request,
  context: { readonly params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const session = await authenticate(request, true);
    return Response.json(
      await restoreMeeting(session.ownerId, (await context.params).id),
    );
  });
}
