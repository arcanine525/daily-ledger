import { expect, it } from "vitest";
import { GET } from "../../src/app/api/health/ready/route";
import { ConfigurationError, parseEnvironment } from "../../src/server/env";

const valid = {
  DATABASE_URL: "postgresql://ledger:ledger@127.0.0.1:55433/ledger_test",
  DIRECT_URL: "postgresql://ledger:ledger@127.0.0.1:55433/ledger_test",
  APP_ORIGIN: "http://127.0.0.1:3100",
  PROVIDER_ENCRYPTION_KEY: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=",
  PROVIDER_ENCRYPTION_KEY_ID: "test",
};
it("reports ready only when real PostgreSQL and deployed schema are available", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    status: "ready",
    service: "daily-ledger",
  });
});
it("rejects the local provider bypass on Vercel without exposing configuration", () => {
  expect(() =>
    parseEnvironment({
      ...valid,
      VERCEL: "1",
      AI_DEV_ALLOWED_ORIGINS: "https://fixture.example",
    }),
  ).toThrow(ConfigurationError);
  expect(() =>
    parseEnvironment({
      ...valid,
      PROVIDER_ENCRYPTION_KEY: "fixture-secret-invalid",
    }),
  ).toThrow("Invalid server configuration");
});
