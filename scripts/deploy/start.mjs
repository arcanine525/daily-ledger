import { parseEnvironment } from "../../src/server/env.ts";
parseEnvironment(process.env);
await import("../../server.js");
