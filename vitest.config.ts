import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  /* Mirrors the "@/*" path in tsconfig.json. Declared by hand rather than via
     vite-tsconfig-paths so the test stack adds no dependency of its own. */
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    /* Every test targets dependency-free logic — the catalog, the mapper, the
       stores' persistence. Nothing here renders, so node is enough and the run
       stays under a second. */
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
