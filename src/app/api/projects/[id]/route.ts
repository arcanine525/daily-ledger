import { authenticate, respond } from "../../../../server/auth/session";
import { editProject } from "../../../../server/settings/projects";

export async function PATCH(
  request: Request,
  context: { readonly params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const session = await authenticate(request, true);
    return Response.json(
      await editProject(
        session.ownerId,
        (await context.params).id,
        await request.json(),
      ),
    );
  });
}
