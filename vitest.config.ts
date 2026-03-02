import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "src/__tests__/**/*.test.ts",
      "src/taxpayer/**/__tests__/**/*.test.ts",
      "src/common/**/__tests__/**/*.test.ts",
    ],
    setupFiles: [path.resolve(__dirname, "src/__tests__/setup.ts")],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/__tests__/**", "**/*.test.ts", "**/*.config.*", "dist/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
