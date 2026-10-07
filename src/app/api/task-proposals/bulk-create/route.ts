import { authenticate, respond } from "../../../../server/auth/session";
import { bulkCreate } from "../../../../server/tasks/decisions";
export async function POST(request: Request) {
  return respond(async () => {
    const session = await authenticate(request, true);
    return Response.json(
      await bulkCreate(
        session.ownerId,
        await request.json(),
        request.headers.get("Idempotency-Key") ?? "",
      ),
    );
  });
}
