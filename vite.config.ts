import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    watch: {
      ignored: [
        "**/src-tauri/**",
        "**/artifacts/**",
        "**/.impeccable/**",
        "**/test-results/**",
      ],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: { target: "es2022" },
});
