import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { POST as loginPost } from "../../src/app/api/auth/login/route";
import { POST as logoutPost } from "../../src/app/api/auth/logout/route";
import { GET as sessionGet } from "../../src/app/api/auth/session/route";
import { hashPassword } from "../../src/server/auth/password";
import { database } from "../../src/server/db/client";

const db = database();
const password = "test-auth-password-only";
const email = `owner-${randomUUID()}@example.test`;
beforeAll(async () => {
  await db.owner.create({
    data: { email, passwordHash: await hashPassword(password) },
  });
});
afterAll(async () => {
  await db.owner.deleteMany({ where: { email } });
  await db.rateLimitBucket.deleteMany();
  await db.$disconnect();
});
function request(
  path: string,
  body: unknown,
  cookie = "",
  csrf = "",
  origin = "http://127.0.0.1:3100",
) {
  return new Request(`http://127.0.0.1:3100${path}`, {
    method: "POST",
    headers: {
      origin,
      cookie,
      "x-csrf-token": csrf,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
it("creates a private session and revokes it on logout", async () => {
  const response = await loginPost(
    request("/api/auth/login", { email, password }),
  );
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie") ?? "";
  expect(cookie).toContain("HttpOnly");
  const body = await response.json();
  const session = await sessionGet(
    new Request("http://127.0.0.1:3100/api/auth/session", {
      headers: { cookie },
    }),
  );
  expect(session.status).toBe(200);
  expect((await session.json()).owner.email).toBe(email);
  expect(
    (await logoutPost(request("/api/auth/logout", {}, cookie, body.csrfToken)))
      .status,
  ).toBe(200);
  expect(
    (
      await sessionGet(
        new Request("http://127.0.0.1:3100/api/auth/session", {
          headers: { cookie },
        }),
      )
    ).status,
  ).toBe(401);
});
it("blocks cross-origin login and missing CSRF", async () => {
  expect(
    (
      await loginPost(
        request(
          "/api/auth/login",
          { email, password },
          "",
          "",
          "https://evil.example",
        ),
      )
    ).status,
  ).toBe(403);
  const response = await loginPost(
    request("/api/auth/login", { email, password }),
  );
  expect(
    (
      await logoutPost(
        request(
          "/api/auth/logout",
          {},
          response.headers.get("set-cookie") ?? "",
        ),
      )
    ).status,
  ).toBe(403);
});
it("rejects the sixth failed login without leaking which field is wrong", async () => {
  for (let count = 0; count < 5; count++)
    expect(
      (
        await loginPost(
          request("/api/auth/login", { email, password: "wrong" }),
        )
      ).status,
    ).toBe(401);
  expect(
    (await loginPost(request("/api/auth/login", { email, password: "wrong" })))
      .status,
  ).toBe(429);
});
