import { authenticate, respond } from "../../../../server/auth/session";
import {
  deleteProfile,
  saveProfile,
} from "../../../../server/providers/profiles";

type Context = { readonly params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  return respond(async () => {
    const session = await authenticate(request, true);
    return Response.json(
      await saveProfile(
        session.ownerId,
        await request.json(),
        (await context.params).id,
      ),
    );
  });
}
export async function DELETE(request: Request, context: Context) {
  return respond(async () => {
    const session = await authenticate(request, true);
    await deleteProfile(session.ownerId, (await context.params).id);
    return new Response(null, { status: 204 });
  });
}
