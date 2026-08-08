import { defineConfig } from "vite";
export default defineConfig({
  // vitest's default include glob (**/*.spec.ts) would otherwise also pick up
  // e2e/smoke.spec.ts (a Playwright test file, run separately via `npm run
  // e2e`) — calling Playwright's test() outside its own runner throws.
  test: { exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"] },
});
