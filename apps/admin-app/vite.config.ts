import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { playwright } from "@vitest/browser-playwright";
import viteReact from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const workspaceRootDirectory = decodeURIComponent(
  new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
);

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, workspaceRootDirectory, ""));

  return {
    envDir: workspaceRootDirectory,
    resolve: {
      tsconfigPaths: true,
    },
    server: {
      port: 3004,
    },
    test: {
      name: "admin-browser",
      include: ["src/**/*.browser.test.ts", "src/**/*.browser.test.tsx"],
      passWithNoTests: true,
      browser: {
        enabled: true,
        provider: playwright(),
        headless: true,
        instances: [{ browser: "chromium" }],
      },
    },
    plugins: [
      tanstackStart({
        srcDirectory: "src",
        router: {
          plugin: {
            vite: {
              environmentName: "client",
            },
          },
        },
      }),
      viteReact(),
    ],
  };
});
