import { authenticate, respond } from "../../../../server/auth/session";
import { purgeExpired } from "../../../../server/retention/service";
export const maxDuration = 300;
export async function POST(request: Request) {
  return respond(async () => {
    const session = await authenticate(request, true);
    return Response.json(await purgeExpired(session.ownerId));
  });
}
