import {
  authenticate,
  HttpError,
  limit,
  respond,
} from "../../../../../server/auth/session";
import { startChat } from "../../../../../server/chat/service";
import { database } from "../../../../../server/db/client";

type Context = { readonly params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return respond(async () => {
    const session = await authenticate(request),
      id = (await context.params).id;
    if (
      !(await database().conversation.findFirst({
        where: { id, ownerId: session.ownerId },
      }))
    )
      throw new HttpError(404, "CONVERSATION_NOT_FOUND");
    return Response.json(
      await database().chatMessage.findMany({
        where: { conversationId: id },
        include: { citations: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
export async function POST(request: Request, context: Context) {
  return respond(async () => {
    const session = await authenticate(request, true);
    await limit(`chat:${session.ownerId}`, 30, 3600000);
    const run = await startChat(
      session.ownerId,
      (await context.params).id,
      await request.json(),
    );
    return Response.json(
      { id: run.id, state: run.state, snapshot: run.snapshot },
      { status: 201 },
    );
  });
}
