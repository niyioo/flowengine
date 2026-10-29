import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // In development the SPA calls /api on its own origin and Vite forwards it to
  // Django — the same shape as production behind nginx. Same origin matters:
  // the httpOnly refresh cookie is SameSite=Strict.
  const apiTarget = env.VITE_PROXY_TARGET || "http://127.0.0.1:8000";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
      },
    },
  };
});
