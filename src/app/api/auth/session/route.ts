import { authenticate, respond } from "../../../../server/auth/session";

export async function GET(request: Request) {
  return respond(async () => {
    const session = await authenticate(request);
    return Response.json(
      {
        owner: { id: session.owner.id, email: session.owner.email },
        expiresAt: session.expiresAt,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
