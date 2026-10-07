import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate, HttpError } from "../server/auth/session";
import { readSettings } from "../server/settings/preferences";

export default async function Home() {
  let locale = "vi";
  if ((await cookies()).get("ledger_session")) {
    try {
      const session = await authenticate(
        new Request("http://localhost/session", {
          headers: { cookie: (await cookies()).toString() },
        }),
      );
      locale = (await readSettings(session.ownerId)).uiLocale;
    } catch (error) {
      if (!(error instanceof HttpError && error.status === 401)) throw error;
    }
  }
  redirect(`/${locale}`);
}
