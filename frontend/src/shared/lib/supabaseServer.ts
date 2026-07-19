/**
 * サーバー専用の Supabase クライアント（service role）。
 * RLS はサーバー経由のみ許可する方針（database.md §1.3 / architecture.md 3.2）のため、
 * service role キーで接続する。**クライアントコンポーネントから import してはならない**
 * （service role キーが漏洩する）。DBアクセスは Repository 層からのみ利用する。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getPublicEnv, getServerEnv } from "@/shared/config/env";

let cachedClient: SupabaseClient | undefined;

/** service role の Supabase クライアントを返す（初回のみ生成しキャッシュ）。 */
export const getSupabaseServerClient = (): SupabaseClient => {
  if (cachedClient) {
    return cachedClient;
  }
  const { NEXT_PUBLIC_SUPABASE_URL } = getPublicEnv();
  const { SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();

  cachedClient = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    // サーバー処理はステートレス。セッション永続化・自動更新は行わない
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cachedClient;
};
