import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import ipaddr from "ipaddr.js";
import { HttpError } from "../auth/session";

type Address = { readonly address: string; readonly family: number };
export function validateUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    (url.port && url.port !== "443") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new HttpError(422, "UNSAFE_PROVIDER_URL");
  return url;
}
export function publicAddresses(addresses: readonly Address[]) {
  if (!addresses.length) throw new HttpError(422, "UNSAFE_PROVIDER_ADDRESS");
  for (const item of addresses) {
    const address = ipaddr.process(item.address);
    if (address.range() !== "unicast")
      throw new HttpError(422, "UNSAFE_PROVIDER_ADDRESS");
  }
  const address = addresses[0];
  if (!address) throw new HttpError(422, "UNSAFE_PROVIDER_ADDRESS");
  return address;
}
export async function safeProviderRequest(input: {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly signal?: AbortSignal;
}) {
  const url = validateUrl(input.url);
  const address = publicAddresses(await lookup(url.hostname, { all: true }));
  return new Promise<{ readonly status: number; readonly body: string }>(
    (resolve, reject) => {
      const request = httpsRequest(
        url,
        {
          method: "POST",
          headers: input.headers,
          signal: input.signal,
          family: address.family,
          lookup: (_hostname, _options, callback) =>
            callback(null, address.address, address.family),
        },
        (response) => {
          if (
            (response.statusCode ?? 500) >= 300 &&
            (response.statusCode ?? 500) < 400
          ) {
            response.destroy();
            reject(new HttpError(502, "PROVIDER_REDIRECT_BLOCKED"));
            return;
          }
          let length = 0;
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => {
            length += chunk.length;
            if (length > 2 * 1024 * 1024) {
              response.destroy(
                new HttpError(502, "PROVIDER_RESPONSE_TOO_LARGE"),
              );
              return;
            }
            chunks.push(chunk);
          });
          response.on("error", reject);
          response.on("end", () =>
            resolve({
              status: response.statusCode ?? 502,
              body: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        },
      );
      request.setTimeout(150000, () =>
        request.destroy(new HttpError(504, "PROVIDER_TIMEOUT")),
      );
      request.on("error", reject);
      request.end(input.body);
    },
  );
}
