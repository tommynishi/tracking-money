/**
 * Integration Test（DB込み）のセットアップ。
 * ローカル Supabase スタック（backend/ で supabase start）へ接続する。
 * キーは Supabase CLI ローカル環境共通のデモ値（supabase status で確認できる公開既定値）。
 * 実環境で実行する場合は環境変数で上書きする。
 */
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const defaults: Readonly<Record<string, string>> = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: LOCAL_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: LOCAL_SERVICE_ROLE_KEY,
  // 以下は getServerEnv の検証を通すためのダミー（Integration Test では使用しない）
  AUTH_SECRET: "integration-test-secret",
  LINE_CHANNEL_ID: "integration-test",
  LINE_CHANNEL_SECRET: "integration-test",
  LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: "integration-test",
  OPENAI_API_KEY: "integration-test",
  GOOGLE_SERVICE_ACCOUNT_KEY: "integration-test",
  CRON_SECRET: "integration-test",
};

for (const [key, value] of Object.entries(defaults)) {
  const current = process.env[key];
  if (current === undefined || current === "") {
    process.env[key] = value;
  }
}
