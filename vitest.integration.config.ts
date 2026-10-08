import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: "postgresql://ledger:ledger@127.0.0.1:55433/ledger_test",
      DIRECT_URL: "postgresql://ledger:ledger@127.0.0.1:55433/ledger_test",
      APP_ORIGIN: "http://127.0.0.1:3100",
      PROVIDER_ENCRYPTION_KEY: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=",
      PROVIDER_ENCRYPTION_KEY_ID: "test",
    },
    include: ["tests/integration/**/*.test.ts"],
    passWithNoTests: false,
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
