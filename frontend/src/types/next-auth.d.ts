/**
 * Auth.js のセッション/JWT 型拡張。
 * session.user.id にはアプリの users.id（UUID）を載せる（LINE の ID ではない）。
 */
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** アプリの users.id（初回サインイン時に ensureUser で解決）。 */
    appUserId?: string;
  }
}
