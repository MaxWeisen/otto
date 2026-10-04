import { defineConfig, devices } from "@playwright/test";
import {
  E2E_BACKEND_PORT,
  E2E_DATABASE_URL,
  E2E_FRONTEND_PORT,
  E2E_STORAGE_STATE,
  E2E_VPIC_PORT,
} from "./e2e/env";

const frontendURL = `http://localhost:${E2E_FRONTEND_PORT}`;
const backendURL = `http://localhost:${E2E_BACKEND_PORT}`;
const vpicURL = `http://localhost:${E2E_VPIC_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: frontendURL,
    storageState: E2E_STORAGE_STATE,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/vpic-stub.mjs",
      url: `${vpicURL}/healthz`,
      env: { PORT: String(E2E_VPIC_PORT) },
    },
    {
      command: "go run ./cmd/otto",
      cwd: "../backend",
      url: `${backendURL}/healthz`,
      env: {
        ENV: "development",
        PORT: String(E2E_BACKEND_PORT),
        DB_URL: E2E_DATABASE_URL,
        FRONTEND_URL: frontendURL,
        VPIC_BASE_URL: `${vpicURL}/api`,
      },
      timeout: 120_000,
    },
    {
      command: `pnpm build && pnpm start -p ${E2E_FRONTEND_PORT}`,
      url: `${frontendURL}/login`,
      env: { NEXT_PUBLIC_API_URL: backendURL },
      timeout: 300_000,
    },
  ],
});
