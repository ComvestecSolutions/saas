import { playwright } from "@vitest/browser-playwright";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "ui-browser",
    include: ["src/**/*.browser.test.ts", "src/**/*.browser.test.tsx"],
    passWithNoTests: true,
    setupFiles: ["./src/testing/ui-browser.setup.ts"],
    maxWorkers: 1,
    fileParallelism: false,
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
  plugins: [viteReact()],
});
