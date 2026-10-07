import { runForOwner } from "../../../../server/analysis/runs";
import { authenticate, respond } from "../../../../server/auth/session";

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const session = await authenticate(request);
    const run = await runForOwner(session.ownerId, (await context.params).id);
    return Response.json(
      {
        id: run.id,
        state: run.state,
        snapshot: run.snapshot,
        leaseUntil: run.leaseUntil,
        steps: run.steps.map((step) => ({
          key: step.stepKey,
          state: step.state,
          attempt: step.attempt,
          error: step.error,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
