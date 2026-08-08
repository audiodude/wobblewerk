import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  use: { headless: true, acceptDownloads: true },
  webServer: {
    command: "npm run dev -- --port 5199 --strictPort",
    url: "http://localhost:5199",
    reuseExistingServer: true,
  },
});
