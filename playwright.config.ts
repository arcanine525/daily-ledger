import { defineConfig } from "@playwright/test";

export default defineConfig({
  globalSetup: "tests/e2e/setup.ts",
  globalTeardown: "tests/e2e/teardown.ts",
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    browserName: "chromium",
    channel: "chrome",
  },
  webServer: [
    {
      command: "node scripts/mock-provider.mjs",
      url: "http://127.0.0.1:3201/health",
      reuseExistingServer: false,
    },
    {
      env: {
        DATABASE_URL: "postgresql://ledger:ledger@127.0.0.1:55433/ledger_test",
        DIRECT_URL: "postgresql://ledger:ledger@127.0.0.1:55433/ledger_test",
        APP_ORIGIN: "http://127.0.0.1:3100",
        PROVIDER_ENCRYPTION_KEY: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=",
        PROVIDER_ENCRYPTION_KEY_ID: "test",
        AI_DEV_ALLOWED_ORIGINS: "http://127.0.0.1:3201",
      },
      command: "pnpm exec next start -p 3100 --hostname 127.0.0.1",
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
