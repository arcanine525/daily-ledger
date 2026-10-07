import { z } from "zod";
import {
  checkOrigin,
  HttpError,
  login,
  respond,
  sessionCookie,
} from "../../../../server/auth/session";

const credentials = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(256),
});
export async function POST(request: Request) {
  return respond(async () => {
    checkOrigin(request);
    const input = credentials.safeParse(await request.json());
    if (!input.success) throw new HttpError(401, "INVALID_CREDENTIALS");
    const result = await login({
      ...input.data,
      ip: request.headers.get("x-vercel-forwarded-for") ?? "local",
    });
    return Response.json(
      { csrfToken: result.csrf },
      {
        headers: {
          "Set-Cookie": sessionCookie(result.token),
          "Cache-Control": "no-store",
        },
      },
    );
  });
}
