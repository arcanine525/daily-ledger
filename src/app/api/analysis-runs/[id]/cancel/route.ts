import { cancelRun } from "../../../../../server/analysis/runs";
import { authenticate, respond } from "../../../../../server/auth/session";

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const session = await authenticate(request, true);
    return Response.json(
      await cancelRun(session.ownerId, (await context.params).id),
    );
  });
}
