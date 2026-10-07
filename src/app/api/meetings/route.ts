import { authenticate, HttpError, respond } from "../../../server/auth/session";
import { database } from "../../../server/db/client";
import { createMeeting } from "../../../server/meetings/archive";

export async function GET(request: Request) {
  return respond(async () => {
    const session = await authenticate(request);
    return Response.json(
      await database().meeting.findMany({
        where: { deletedAt: null, project: { ownerId: session.ownerId } },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: 50,
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
export async function POST(request: Request) {
  return respond(async () => {
    const session = await authenticate(request, true);
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 3 * 1024 * 1024)
      throw new HttpError(413, "REQUEST_TOO_LARGE");
    return Response.json(
      await createMeeting(
        session.ownerId,
        JSON.parse(raw),
        request.headers.get("Idempotency-Key") ?? "",
      ),
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  });
}
