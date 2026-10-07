import { expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/server/auth/password";

it("accepts the original password and rejects a different one", async () => {
  const encoded = await hashPassword("a-long-test-password");
  expect(await verifyPassword("a-long-test-password", encoded)).toBe(true);
  expect(await verifyPassword("another-test-password", encoded)).toBe(false);
});
