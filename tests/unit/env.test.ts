import { describe, expect, it } from "vitest";
import { parseEnvironment } from "../../src/server/env";

const valid = {
  DATABASE_URL: "postgresql://test:test@localhost:5432/ledger",
  DIRECT_URL: "postgresql://test:test@localhost:5432/ledger",
  APP_ORIGIN: "http://localhost:3000",
  PROVIDER_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  PROVIDER_ENCRYPTION_KEY_ID: "local",
};

describe("environment boundary", () => {
  it("parses valid configuration", () => {
    // Given
    const input = valid;
    // When
    const result = parseEnvironment(input);
    // Then
    expect(result.APP_ORIGIN).toBe("http://localhost:3000");
  });
  it("rejects a missing database URL without leaking secrets", () => {
    const input = { ...valid, DATABASE_URL: undefined };
    expect(() => parseEnvironment(input)).toThrow(
      "Invalid server configuration",
    );
  });
  it("rejects invalid encryption key length", () => {
    expect(() =>
      parseEnvironment({ ...valid, PROVIDER_ENCRYPTION_KEY: "invalid" }),
    ).toThrow("Invalid server configuration");
  });
});
