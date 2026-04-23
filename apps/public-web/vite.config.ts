import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

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
      port: 3000,
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
