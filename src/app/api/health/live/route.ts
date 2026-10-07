export function GET() {
  return Response.json(
    { status: "ok", service: "daily-ledger" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
