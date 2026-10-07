import { authenticate, respond } from "../../../../../server/auth/session";
import { decideProposal } from "../../../../../server/tasks/decisions";
export async function POST(
  request: Request,
  context: { readonly params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const session = await authenticate(request, true);
    return Response.json(
      await decideProposal(
        session.ownerId,
        (await context.params).id,
        await request.json(),
        request.headers.get("Idempotency-Key") ?? "",
      ),
    );
  });
}
