import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url:
      process.env["DIRECT_URL"] ??
      "postgresql://ledger:ledger@127.0.0.1:55432/ledger",
  },
});
