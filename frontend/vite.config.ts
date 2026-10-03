import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy des appels /api vers le backend FastAPI (évite tout souci de CORS).
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
