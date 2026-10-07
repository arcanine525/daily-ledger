import { authenticate, respond } from "../../../server/auth/session";
import { createProject, listProjects } from "../../../server/settings/projects";

export async function GET(request: Request) {
  return respond(async () => {
    const session = await authenticate(request);
    return Response.json(await listProjects(session.ownerId), {
      headers: { "Cache-Control": "no-store" },
    });
  });
}
export async function POST(request: Request) {
  return respond(async () => {
    const session = await authenticate(request, true);
    return Response.json(
      await createProject(session.ownerId, await request.json()),
      { status: 201 },
    );
  });
}
