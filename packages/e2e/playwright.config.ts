import { defineConfig } from "@playwright/test";

const repositoryRootDirectory = decodeURIComponent(
  new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
);

const explicitBaseURL = process.env["ADMIN_E2E_BASE_URL"];
const shouldStartDevServer = explicitBaseURL === undefined;
const baseURL = explicitBaseURL ?? "http://127.0.0.1:3004";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  reporter: process.env["CI"]
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  ...(shouldStartDevServer
    ? {
        webServer: {
          command: "bun run --cwd apps/admin-app dev -- --host 127.0.0.1",
          cwd: repositoryRootDirectory,
          url: baseURL,
          reuseExistingServer: !process.env["CI"],
          timeout: 120000,
        },
      }
    : {}),
});
