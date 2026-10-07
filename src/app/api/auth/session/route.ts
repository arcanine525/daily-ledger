import {
  authenticate,
  cookie,
  respond,
  sessionCsrf,
} from "../../../../server/auth/session";

export async function GET(request: Request) {
  return respond(async () => {
    const session = await authenticate(request);
    return Response.json(
      {
        owner: { id: session.owner.id, email: session.owner.email },
        expiresAt: session.expiresAt,
        csrfToken: sessionCsrf(cookie(request, "ledger_session") ?? ""),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
