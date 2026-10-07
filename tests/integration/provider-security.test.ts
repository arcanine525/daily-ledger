import { expect, it, vi } from "vitest";
import { database } from "../../src/server/db/client";
import { openToken, sealToken } from "../../src/server/providers/crypto";
import {
  deleteProfile,
  listProfiles,
  saveProfile,
} from "../../src/server/providers/profiles";
import {
  publicAddresses,
  validateUrl,
} from "../../src/server/providers/transport";

it("encrypts credentials and authenticates profile metadata", () => {
  const key = Buffer.alloc(32, 1);
  const sealed = sealToken(
    "fixture-token",
    { profileId: "profile", revision: 1 },
    key,
  );
  expect(JSON.stringify(sealed)).not.toContain("fixture-token");
  expect(openToken(sealed, { profileId: "profile", revision: 1 }, key)).toBe(
    "fixture-token",
  );
  expect(() =>
    openToken(sealed, { profileId: "other", revision: 1 }, key),
  ).toThrow();
});
it("rejects every unsafe resolved address including mapped IPv6", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "192.168.1.2",
  ])
    expect(() =>
      publicAddresses([{ address, family: address.includes(":") ? 6 : 4 }]),
    ).toThrow();
  expect(publicAddresses([{ address: "1.1.1.1", family: 4 }])).toEqual({
    address: "1.1.1.1",
    family: 4,
  });
});
it("rejects credentials redirects targets and insecure production URLs", () => {
  for (const url of [
    "http://example.com",
    "https://user:pass@example.com",
    "https://example.com:8443",
    "https://example.com?secret=test",
  ])
    expect(() => validateUrl(url)).toThrow();
});

it("permits only exact operator-allowed local origins and disables them on Vercel", () => {
  vi.stubEnv("AI_DEV_ALLOWED_ORIGINS", "http://127.0.0.1:3201");
  vi.stubEnv("VERCEL", "");
  try {
    expect(validateUrl("http://127.0.0.1:3201/v1").origin).toBe(
      "http://127.0.0.1:3201",
    );
    expect(() => validateUrl("http://127.0.0.1:3202/v1")).toThrow();
    vi.stubEnv("VERCEL", "1");
    expect(() => validateUrl("http://127.0.0.1:3201/v1")).toThrow();
  } finally {
    vi.unstubAllEnvs();
  }
});

it("persists only authenticated ciphertext and never returns a token", async () => {
  const db = database();
  const owner = await db.owner.create({
    data: { email: "provider-fixture@example.test", passwordHash: "fixture" },
  });
  try {
    const result = await saveProfile(owner.id, {
      name: "Mock",
      type: "openai-compatible",
      baseUrl: "https://example.com",
      model: "fixture",
      token: "fixture-secret-token",
    });
    expect(JSON.stringify(await listProfiles(owner.id))).not.toContain(
      "fixture-secret-token",
    );
    const stored = await db.providerProfileRevision.findFirstOrThrow({
      where: { profileId: result.id },
    });
    expect(stored.ciphertext).not.toBe("fixture-secret-token");
    expect(stored.nonce).toBeTruthy();
    await saveProfile(
      owner.id,
      {
        name: "Updated",
        type: "openai-compatible",
        baseUrl: "https://example.com",
        model: "fixture2",
      },
      result.id,
    );
    expect(
      await db.providerProfileRevision.count({
        where: { profileId: result.id },
      }),
    ).toBe(2);
    await deleteProfile(owner.id, result.id);
    expect(await listProfiles(owner.id)).toEqual([]);
    expect(
      await db.providerProfileRevision.count({
        where: { profileId: result.id, ciphertext: { not: null } },
      }),
    ).toBe(0);
  } finally {
    await db.owner.delete({ where: { id: owner.id } });
    await db.$disconnect();
  }
});
