import { authenticate, respond } from "../../../server/auth/session";
import { createConversation } from "../../../server/chat/service";
import { database } from "../../../server/db/client";
export async function GET(request: Request) {
  return respond(async () => {
    const session = await authenticate(request);
    return Response.json(
      await database().conversation.findMany({
        where: { ownerId: session.ownerId },
        orderBy: { id: "desc" },
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
export async function POST(request: Request) {
  return respond(async () => {
    const session = await authenticate(request, true);
    return Response.json(
      await createConversation(session.ownerId, await request.json()),
      { status: 201 },
    );
  });
}
