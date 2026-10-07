import { expect, it } from "vitest";
import { GET } from "../../src/app/api/health/live/route";

it("returns noncached liveness without credentials", async () => {
  const response = GET();
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({
    status: "ok",
    service: "daily-ledger",
  });
});
