import { database } from "../../../../server/db/client";
import { parseEnvironment } from "../../../../server/env";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET() {
  try {
    parseEnvironment(process.env);
    const db = database();
    await db.$queryRaw`SELECT 1`;
    await db.$queryRaw`SELECT id FROM "Owner" LIMIT 1`;
    return Response.json(
      { status: "ready", service: "daily-ledger" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable", service: "daily-ledger" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
