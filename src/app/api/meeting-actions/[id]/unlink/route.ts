import { authenticate, respond } from "../../../../../server/auth/session";
import { unlinkAction } from "../../../../../server/tasks/links";
export async function POST(
  request: Request,
  context: { readonly params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const session = await authenticate(request, true);
    return Response.json(
      await unlinkAction(session.ownerId, (await context.params).id),
    );
  });
}
