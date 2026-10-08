import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  ssr: {
    noExternal: [/@tonaljs\//],
    resolve: { mainFields: ["module", "main"] },
  },
  test: {
    // Some Tonal packages publish ESM correctly but a stale CommonJS main path.
    // Let Vite resolve their module field consistently in browser and Node tests.
    server: { deps: { inline: [/@tonaljs\//] } },
    environment: "node",
    include: ["src/**/__tests__/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
  },
});
