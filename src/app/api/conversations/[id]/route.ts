import { authenticate, respond } from "../../../../server/auth/session";
import { conversationForOwner } from "../../../../server/chat/read";
export async function GET(
  request: Request,
  context: { readonly params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const session = await authenticate(request);
    return Response.json(
      await conversationForOwner(session.ownerId, (await context.params).id),
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
