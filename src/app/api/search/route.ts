import { authenticate, respond } from "../../../server/auth/session";
import { search } from "../../../server/search/retrieve";
export async function GET(request: Request) {
  return respond(async () => {
    const session = await authenticate(request);
    return Response.json(
      await search(
        session.ownerId,
        Object.fromEntries(new URL(request.url).searchParams),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
