import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 純粋ロジックは .test.ts（既定 node 環境）、コンポーネントは .test.tsx で
    // ファイル先頭に `// @vitest-environment jsdom` を付けて DOM を利用する。
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
