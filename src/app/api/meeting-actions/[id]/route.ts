import { authenticate, respond } from "../../../../server/auth/session";
import { editAction } from "../../../../server/tasks/pending";
export async function PATCH(
  request: Request,
  context: { readonly params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const session = await authenticate(request, true);
    return Response.json(
      await editAction(
        session.ownerId,
        (await context.params).id,
        await request.json(),
      ),
    );
  });
}
