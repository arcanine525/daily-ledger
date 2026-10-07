import { authenticate, respond } from "../../../../../server/auth/session";
import { cancelChat } from "../../../../../server/chat/runs";
export async function POST(
  request: Request,
  context: { readonly params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const session = await authenticate(request, true);
    return Response.json(
      await cancelChat(session.ownerId, (await context.params).id),
    );
  });
}
