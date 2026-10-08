import { parseEnvironment } from "./server/env";
export function register() {
  if (process.env["NEXT_RUNTIME"] === "nodejs") parseEnvironment(process.env);
}
