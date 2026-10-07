import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { database } from "../db/client";
import { parseEnvironment } from "../env";
import { verifyPassword } from "./password";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
export function tokenHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function cookie(request: Request, name: string) {
  return (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
export function checkOrigin(request: Request) {
  if (
    request.headers.get("origin") !== parseEnvironment(process.env).APP_ORIGIN
  )
    throw new HttpError(403, "INVALID_ORIGIN");
}
export async function authenticate(request: Request, mutation = false) {
  const token = cookie(request, "ledger_session");
  if (!token) throw new HttpError(401, "UNAUTHENTICATED");
  const session = await database().session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { owner: true },
  });
  if (!session || session.expiresAt.getTime() <= Date.now())
    throw new HttpError(401, "UNAUTHENTICATED");
  if (mutation) {
    checkOrigin(request);
    const csrf = request.headers.get("x-csrf-token");
    if (
      !csrf ||
      !timingSafeEqual(
        Buffer.from(tokenHash(csrf)),
        Buffer.from(session.csrfHash),
      )
    )
      throw new HttpError(403, "INVALID_CSRF");
  }
  return session;
}
export async function limit(key: string, maximum: number, durationMs: number) {
  const now = new Date(),
    expires = new Date(now.getTime() + durationMs);
  const rows = await database().$queryRaw<{ count: number; expiresAt: Date }[]>`
    INSERT INTO "RateLimitBucket" (key,count,"expiresAt") VALUES (${key},1,${expires})
    ON CONFLICT (key) DO UPDATE SET count=CASE WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN 1 ELSE "RateLimitBucket".count+1 END,
    "expiresAt"=CASE WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN ${expires} ELSE "RateLimitBucket"."expiresAt" END
    RETURNING count,"expiresAt"`;
  if ((rows[0]?.count ?? maximum + 1) > maximum)
    throw new HttpError(429, "RATE_LIMITED");
}
export async function login(input: {
  readonly email: string;
  readonly password: string;
  readonly ip: string;
}) {
  const db = database();
  await limit(`login-ip:${input.ip}`, 5, 15 * 60 * 1000);
  await limit(`login-account:${input.email}`, 20, 15 * 60 * 1000);
  const owner = await db.owner.findUnique({ where: { email: input.email } });
  if (!owner || !(await verifyPassword(input.password, owner.passwordHash)))
    throw new HttpError(401, "INVALID_CREDENTIALS");
  const token = randomBytes(32).toString("hex"),
    csrf = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.session.create({
    data: {
      ownerId: owner.id,
      tokenHash: tokenHash(token),
      csrfHash: tokenHash(csrf),
      expiresAt,
    },
  });
  await db.rateLimitBucket.deleteMany({
    where: {
      key: { in: [`login-ip:${input.ip}`, `login-account:${input.email}`] },
    },
  });
  return { token, csrf, expiresAt };
}
export async function respond(action: () => Promise<Response>) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof HttpError)
      return Response.json(
        { code: error.code },
        {
          status: error.status,
          headers: {
            "Cache-Control": "no-store",
            ...(error.status === 429 ? { "Retry-After": "900" } : {}),
          },
        },
      );
    throw error;
  }
}
export function sessionCookie(token: string, age = 604800) {
  const secure = parseEnvironment(process.env).APP_ORIGIN.startsWith("https:")
    ? "; Secure"
    : "";
  return `ledger_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${secure}`;
}
