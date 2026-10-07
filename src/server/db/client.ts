import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { parseEnvironment } from "../env";

let client: PrismaClient | undefined;
export function database() {
  if (!client) {
    const env = parseEnvironment(process.env);
    client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: env.DATABASE_URL,
        max: 5,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 10000,
      }),
    });
  }
  return client;
}
