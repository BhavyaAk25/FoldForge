import { defineConfig, devices } from "@playwright/test";

// Override with E2E_PORT when 3000 is already taken on a developer machine.
const port = Number(process.env.E2E_PORT ?? 3000);
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: origin,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `next dev --hostname 127.0.0.1 --port ${port}`,
    url: `${origin}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
