import { authenticate, respond } from "../../../../server/auth/session";
import { getRun } from "../../../../server/chat/runs";
export async function GET(
  request: Request,
  context: { readonly params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const session = await authenticate(request),
      run = await getRun(session.ownerId, (await context.params).id);
    return Response.json(
      {
        id: run.id,
        state: run.state,
        snapshot: run.snapshot,
        steps: run.steps,
        leaseUntil: run.leaseUntil,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
