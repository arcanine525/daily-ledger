import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate, HttpError } from "../server/auth/session";

export async function requireOwner(locale: string) {
  try {
    return (
      await authenticate(
        new Request("http://localhost/session", {
          headers: { cookie: (await cookies()).toString() },
        }),
      )
    ).ownerId;
  } catch (error) {
    if (error instanceof HttpError && error.status === 401)
      redirect(`/${locale}/login`);
    throw error;
  }
}
