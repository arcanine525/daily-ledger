import { authenticate, respond } from "../../../server/auth/session";
import { listTasks } from "../../../server/tasks/read";
import { createTask } from "../../../server/tasks/write";
export async function GET(request: Request) {
  return respond(async () => {
    const session = await authenticate(request);
    return Response.json(
      await listTasks(
        session.ownerId,
        Object.fromEntries(new URL(request.url).searchParams),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
export async function POST(request: Request) {
  return respond(async () => {
    const session = await authenticate(request, true);
    return Response.json(
      await createTask(
        session.ownerId,
        await request.json(),
        request.headers.get("Idempotency-Key") ?? "",
      ),
      { status: 201 },
    );
  });
}
