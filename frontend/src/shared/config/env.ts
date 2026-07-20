/**
 * 環境変数の検証（docs/architecture.md 9.2）。
 * - サーバー専用変数は getServerEnv() でのみ参照し、クライアントバンドルへ含めない。
 * - 公開変数（NEXT_PUBLIC_）は Next.js のビルド時インライン置換のため静的参照する。
 * 欠落・不正時は起動時に明確なエラーで停止する（architecture.md 9.2）。
 */
import { z } from "zod";

const nonEmpty = (label: string) => z.string().min(1, `${label} is required`);

/** サーバー専用変数。クライアントへ渡してはならない（NEXT_PUBLIC_ を付けない）。 */
const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: nonEmpty("SUPABASE_SERVICE_ROLE_KEY"),
  AUTH_SECRET: nonEmpty("AUTH_SECRET"),
  LINE_CHANNEL_ID: nonEmpty("LINE_CHANNEL_ID"),
  LINE_CHANNEL_SECRET: nonEmpty("LINE_CHANNEL_SECRET"),
  LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: nonEmpty("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN"),
  OPENAI_API_KEY: nonEmpty("OPENAI_API_KEY"),
  // Drive 保存は未対応（サービスアカウントは Drive の保存容量を持たないため）。設定時のみ有効化される。
  GOOGLE_SERVICE_ACCOUNT_KEY: z.string().optional().default(""),
  GOOGLE_DRIVE_ROOT_FOLDER_ID: z.string().optional().default(""),
  CRON_SECRET: nonEmpty("CRON_SECRET"),
});

/** クライアントへ公開してよい変数（NEXT_PUBLIC_）。 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmpty("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
});

export type ServerEnv = Readonly<z.infer<typeof serverEnvSchema>>;
export type PublicEnv = Readonly<z.infer<typeof publicEnvSchema>>;

const formatIssues = (error: z.ZodError): string =>
  error.issues.map((issue) => `- ${issue.path.join(".") || "(root)"}: ${issue.message}`).join("\n");

let cachedServerEnv: ServerEnv | undefined;

/**
 * サーバー専用変数を検証して返す（初回のみ検証し以降キャッシュ）。
 * ビルド時に全シークレットを要求しないよう遅延評価する。
 * クライアントコンポーネントから呼び出してはならない。
 */
export const getServerEnv = (): ServerEnv => {
  if (cachedServerEnv) {
    return cachedServerEnv;
  }
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid server environment variables:\n${formatIssues(parsed.error)}`);
  }
  cachedServerEnv = Object.freeze(parsed.data);
  return cachedServerEnv;
};

/**
 * 公開変数を検証して返す。NEXT_PUBLIC_ は Next.js がビルド時に静的置換するため、
 * process.env のプロパティを直接列挙して参照する。
 */
export const getPublicEnv = (): PublicEnv => {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    throw new Error(`Invalid public environment variables:\n${formatIssues(parsed.error)}`);
  }
  return Object.freeze(parsed.data);
};
