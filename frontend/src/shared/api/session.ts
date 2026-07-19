/**
 * Route Handler の認証確認（architecture.md 6.2 手順1）。
 * セッションからアプリの users.id を取り出す。未認証は UnauthenticatedError（401）。
 */
import { auth } from "@/auth";
import { UnauthenticatedError } from "@/shared/errors/appError";

export const requireUserId = async (): Promise<string> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (userId === undefined || userId === "") {
    throw new UnauthenticatedError("ログインが必要です");
  }
  return userId;
};
