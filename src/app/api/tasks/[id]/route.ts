import { authenticate, respond } from "../../../../server/auth/session";
import { getTask } from "../../../../server/tasks/read";
import { editTask } from "../../../../server/tasks/write";

type Context = { readonly params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return respond(async () => {
    const session = await authenticate(request);
    return Response.json(
      await getTask(session.ownerId, (await context.params).id),
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
export async function PATCH(request: Request, context: Context) {
  return respond(async () => {
    const session = await authenticate(request, true);
    return Response.json(
      await editTask(
        session.ownerId,
        (await context.params).id,
        await request.json(),
      ),
    );
  });
}
