import { authenticate, respond } from "../../../server/auth/session";
import { listTrash } from "../../../server/retention/service";
export async function GET(request: Request) {
  return respond(async () => {
    const session = await authenticate(request);
    return Response.json(await listTrash(session.ownerId), {
      headers: { "Cache-Control": "no-store" },
    });
  });
}
