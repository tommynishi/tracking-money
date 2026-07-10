/**
 * Auth.js（next-auth v5）の設定（architecture.md 3.1 / 6.1・FR-AUTH-01〜03）。
 * LINE Login（OIDC）で認証し、JWT セッション（HttpOnly Cookie）で管理する。
 * users テーブルはアプリが管理するため DB アダプタは使わず、初回ログイン時に
 * Service 層（ensureUser）でユーザーを作成し、アプリの users.id をセッションへ載せる。
 * 環境変数はリクエスト時に解決する（ビルド時に全シークレットを要求しない）。
 */
import NextAuth from "next-auth";
import Line from "next-auth/providers/line";
import { z } from "zod";

import { getServerEnv } from "@/shared/config/env";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { createUserRepository } from "@/features/auth/repositories/userRepository";
import { ensureUser } from "@/features/auth/services/userService";

/** LINE の OIDC プロフィール（必要な項目のみ検証して使う）。 */
const lineProfileSchema = z.object({
  sub: z.string().min(1),
  name: z.string().optional(),
  picture: z.string().optional(),
});

const FALLBACK_DISPLAY_NAME = "LINEユーザー";

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const env = getServerEnv();
  return {
    secret: env.AUTH_SECRET,
    trustHost: true,
    session: { strategy: "jwt" },
    pages: { signIn: "/login" },
    providers: [
      Line({
        clientId: env.LINE_CHANNEL_ID,
        clientSecret: env.LINE_CHANNEL_SECRET,
      }),
    ],
    callbacks: {
      /**
       * 初回サインイン時のみ profile が渡る。ユーザーを取得または作成し（FR-AUTH-03）、
       * アプリの users.id を JWT へ保持する。失敗時はログインを失敗させる
       * （個人情報を含むためエラー内容はログへ出力しない・NFR-05）。
       */
      async jwt({ token, profile }) {
        if (profile === undefined) {
          return token;
        }
        const parsed = lineProfileSchema.safeParse(profile);
        if (!parsed.success) {
          throw new Error("LINE profile is missing required claims");
        }
        const user = await ensureUser(createUserRepository(getSupabaseServerClient()), {
          lineUserId: parsed.data.sub,
          displayName: parsed.data.name?.trim() || FALLBACK_DISPLAY_NAME,
          avatarUrl: parsed.data.picture ?? null,
        });
        token.appUserId = user.id;
        return token;
      },
      session({ session, token }) {
        if (typeof token.appUserId === "string") {
          session.user.id = token.appUserId;
        }
        return session;
      },
    },
  };
});
