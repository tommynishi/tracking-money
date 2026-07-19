import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Integration Test（DB込み）用の設定。ローカル Supabase の起動が前提
 * （backend/ で supabase start && supabase db reset）。実行は npm run test:integration。
 */
export default defineConfig({
  test: {
    include: ["src/tests/integration/**/*.int.test.ts"],
    environment: "node",
    globals: true,
    setupFiles: ["./vitest.integration.setup.ts"],
    // 実DBを共有するためタイムアウトを長めに取る
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
