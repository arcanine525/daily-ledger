import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import ipaddr from "ipaddr.js";
import { HttpError } from "../auth/session";
import type { ProviderRequest } from "./protocol";

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
  for (const item of addresses)
    if (ipaddr.process(item.address).range() !== "unicast")
      throw new HttpError(422, "UNSAFE_PROVIDER_ADDRESS");
  const selected = addresses[0];
  if (!selected) throw new HttpError(422, "UNSAFE_PROVIDER_ADDRESS");
  return selected;
}
export async function safeProviderStream(
  input: ProviderRequest,
): Promise<Response> {
  const url = new URL(input.url),
    check = new URL(input.url);
  if (check.search === "?alt=sse") check.search = "";
  validateUrl(check.toString());
  const address = publicAddresses(await lookup(url.hostname, { all: true }));
  const signal = input.signal
    ? AbortSignal.any([input.signal, AbortSignal.timeout(150000)])
    : AbortSignal.timeout(150000);
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        method: "POST",
        headers: input.headers,
        signal,
        family: address.family,
        lookup: (_host, _options, callback) =>
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
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers))
          if (value)
            headers.set(name, Array.isArray(value) ? value.join(",") : value);
        let bytes = 0;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            response.on("data", (chunk: Buffer) => {
              bytes += chunk.length;
              if (bytes > 2 * 1024 * 1024) {
                response.destroy(
                  new HttpError(502, "PROVIDER_RESPONSE_TOO_LARGE"),
                );
                return;
              }
              controller.enqueue(chunk);
            });
            response.on("end", () => controller.close());
            response.on("error", (error) => controller.error(error));
          },
          cancel() {
            response.destroy();
            request.destroy();
          },
        });
        resolve(
          new Response(body, { status: response.statusCode ?? 502, headers }),
        );
      },
    );
    request.setTimeout(150000, () =>
      request.destroy(new HttpError(504, "PROVIDER_TIMEOUT")),
    );
    request.on("error", reject);
    request.end(input.body);
  });
}
export async function safeProviderRequest(input: ProviderRequest) {
  const response = await safeProviderStream(input);
  return {
    status: response.status,
    headers: response.headers,
    body: await response.text(),
  };
}
