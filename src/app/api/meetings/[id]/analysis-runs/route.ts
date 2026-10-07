import { beginAnalysis } from "../../../../../server/analysis/pipeline";
import { database } from "../../../../../server/db/client";
import { meetingForOwner } from "../../../../../server/meetings/archive";
export async function GET(
  request: Request,
  context: { readonly params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const session = await authenticate(request),
      id = (await context.params).id,
      meeting = await meetingForOwner(session.ownerId, id);
    return Response.json(
      await database().analysisRun.findMany({
        where: {
          meetingId: id,
          revision: { number: meeting.currentRevisionNumber },
        },
        select: { id: true, state: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}

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
