import { z } from "zod";

export class ClientError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export async function callApi(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<unknown> {
  let csrf = sessionStorage.getItem("ledger_csrf");
  if (method !== "GET" && !csrf) {
    const response = await fetch("/api/auth/session");
    const session = z
      .object({ csrfToken: z.string() })
      .parse(await response.json());
    csrf = session.csrfToken;
    sessionStorage.setItem("ledger_csrf", csrf);
  }
  const response = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "x-csrf-token": csrf } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 204) return null;
  const data: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ code: z.string() }).safeParse(data);
    throw new ClientError(
      error.success ? error.data.code : `HTTP_${response.status}`,
    );
  }
  return data;
}
