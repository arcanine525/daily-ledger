import { z } from "zod";
import { authenticate, HttpError, respond } from "../../../server/auth/session";
import { database } from "../../../server/db/client";
import { createMeeting } from "../../../server/meetings/archive";

export async function GET(request: Request) {
  return respond(async () => {
    const session = await authenticate(request);
    const url = new URL(request.url);
    const filters = z
      .object({ cursor: z.uuid().optional(), projectId: z.uuid().optional() })
      .safeParse(Object.fromEntries(url.searchParams));
    if (!filters.success) throw new HttpError(422, "INVALID_MEETING_FILTER");
    const rows = await database().meeting.findMany({
      where: {
        deletedAt: null,
        project: { ownerId: session.ownerId },
        ...(filters.data.projectId
          ? { projectId: filters.data.projectId }
          : {}),
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: 51,
      ...(filters.data.cursor
        ? { cursor: { id: filters.data.cursor }, skip: 1 }
        : {}),
    });
    const items = rows.slice(0, 50);
    return Response.json(
      {
        items,
        nextCursor: rows.length > 50 ? (items.at(-1)?.id ?? null) : null,
      },
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
