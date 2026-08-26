import { defineConfig, devices } from "@playwright/test";

const localBaseURL = "http://127.0.0.1:3417";
const fixtureBaseURL = process.env.NATAL_E2E_BASE_URL?.replace(/\/$/, "");
const storageState = process.env.NATAL_E2E_STORAGE_STATE;

if (Boolean(fixtureBaseURL) !== Boolean(storageState)) {
  throw new Error(
    "NATAL_E2E_BASE_URL and NATAL_E2E_STORAGE_STATE must be provided together."
  );
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  outputDir: "test-results/playwright",
  use: {
    baseURL: fixtureBaseURL ?? localBaseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "public-chromium",
      testMatch: /(natal|personal-memory)\.public\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "guest-triplet-mobile",
      testMatch: /guest-triplet\.public\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "guest-funnel-golden",
      testMatch: /guest-funnel-golden\.public\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "guest-conversion-smoke",
      testMatch: /guest-conversion-smoke\.public\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "daily-artifact",
      testMatch: /daily-artifact\.public\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "matrix-e2e",
      testMatch: /matrix\.e2e\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    ...(fixtureBaseURL && storageState
      ? [{
          name: "authenticated-natal",
          testMatch: /natal\.authenticated\.spec\.ts/,
          use: {
            ...devices["Desktop Chrome"],
            baseURL: fixtureBaseURL,
            storageState,
          },
        }]
      : []),
  ],
  webServer: fixtureBaseURL
    ? undefined
    : {
        command: "npx next dev --hostname 127.0.0.1 --port 3417",
        url: localBaseURL,
        reuseExistingServer: true,
        timeout: 120_000,
        env: {
          ...process.env,
          NEXT_DIST_DIR: ".next-e2e",
        },
      },
});
