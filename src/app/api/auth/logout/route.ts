import {
  authenticate,
  respond,
  sessionCookie,
} from "../../../../server/auth/session";
import { database } from "../../../../server/db/client";

export async function POST(request: Request) {
  return respond(async () => {
    const session = await authenticate(request, true);
    await database().session.delete({ where: { id: session.id } });
    return Response.json(
      { status: "signed_out" },
      {
        headers: {
          "Set-Cookie": sessionCookie("", 0),
          "Cache-Control": "no-store",
        },
      },
    );
  });
}
