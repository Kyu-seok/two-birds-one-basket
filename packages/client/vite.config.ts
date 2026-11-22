import { defineConfig } from "vite";

const server = "http://localhost:8100";

export default defineConfig({
  server: {
    proxy: {
      "/api": server,
      "/ws": { target: server, ws: true },
    },
  },
});
