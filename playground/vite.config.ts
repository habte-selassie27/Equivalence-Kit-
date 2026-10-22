import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The playground is a static site. Hash routing keeps it deployable to any static host
// without server rewrites.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});