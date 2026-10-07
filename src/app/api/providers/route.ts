import { authenticate, respond } from "../../../server/auth/session";
import { listProfiles, saveProfile } from "../../../server/providers/profiles";

export async function GET(request: Request) {
  return respond(async () => {
    const session = await authenticate(request);
    return Response.json(await listProfiles(session.ownerId), {
      headers: { "Cache-Control": "no-store" },
    });
  });
}
export async function POST(request: Request) {
  return respond(async () => {
    const session = await authenticate(request, true);
    return Response.json(
      await saveProfile(session.ownerId, await request.json()),
      { status: 201 },
    );
  });
}
