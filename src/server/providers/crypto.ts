import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type Metadata = { readonly profileId: string; readonly revision: number };
type Sealed = {
  readonly ciphertext: string;
  readonly nonce: string;
  readonly tag: string;
};
export function sealToken(
  token: string,
  metadata: Metadata,
  key: Buffer,
): Sealed {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(JSON.stringify(metadata)));
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}
export function openToken(sealed: Sealed, metadata: Metadata, key: Buffer) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(sealed.nonce, "base64"),
  );
  decipher.setAAD(Buffer.from(JSON.stringify(metadata)));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
