import { authenticate, respond } from "../../../server/auth/session";
import {
  readSettings,
  saveSettings,
} from "../../../server/settings/preferences";

export async function GET(request: Request) {
  return respond(async () => {
    const session = await authenticate(request);
    return Response.json(await readSettings(session.ownerId), {
      headers: { "Cache-Control": "no-store" },
    });
  });
}
export async function PATCH(request: Request) {
  return respond(async () => {
    const session = await authenticate(request, true);
    return Response.json(
      await saveSettings(session.ownerId, await request.json()),
    );
  });
}
