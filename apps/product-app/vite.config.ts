import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 3002,
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
});
