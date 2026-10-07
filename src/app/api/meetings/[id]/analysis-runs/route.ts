import { beginAnalysis } from "../../../../../server/analysis/pipeline";
import {
  authenticate,
  limit,
  respond,
} from "../../../../../server/auth/session";

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const session = await authenticate(request, true);
    await limit(`analysis:${session.ownerId}`, 10, 3600000);
    const run = await beginAnalysis(session.ownerId, (await context.params).id);
    return Response.json(
      { id: run.id, state: run.state, snapshot: run.snapshot },
      { status: 201 },
    );
  });
}
