import { authenticate, respond } from "../../../server/auth/session";
import { pendingProposals } from "../../../server/tasks/read";
export async function GET(request: Request) {
  return respond(async () => {
    const session = await authenticate(request);
    return Response.json(await pendingProposals(session.ownerId), {
      headers: { "Cache-Control": "no-store" },
    });
  });
}
