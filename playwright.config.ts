import { defineConfig } from "@playwright/test";

// Both servers run the same `next build` output (`npm run e2e` builds first); never `next dev`.
const env = { PRIVATE_READER: "fixture", STORE: "memory", EXTRACTOR: "fixture", EXTERNAL_ACTIONS: "simulated" };

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  use: { baseURL: "http://localhost:3100", viewport: { width: 390, height: 844 } },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: [
    // 3100: the demo reader, today's production setting
    { command: "npm run start -- -p 3100", url: "http://localhost:3100", timeout: 120000, env },
    // 3101: the stub reader, for the upload specs
    { command: "npm run start -- -p 3101", url: "http://localhost:3101", timeout: 120000, env: { ...env, PRIVATE_READER: "stub", ALLOW_DEMO: "1" } },
  ],
});
