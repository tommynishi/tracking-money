/**
 * Route Handler の Integration Test 用ヘルパー（ローカル Supabase 実DB）。
 * 認証のみモックする：各テストファイル冒頭で
 * `vi.mock("@/auth", () => ({ auth: vi.fn() }));` を宣言した上で signInAs / signOutSession を使う。
 * テストデータは実行ごとに一意な値で作成し、後始末は `supabase db reset` に委ねる。
 */
import { randomUUID } from "node:crypto";

import { expect, type Mock } from "vitest";

import { auth } from "@/auth";
import { getSupabaseServerClient } from "@/shared/lib/supabaseServer";

import { POST as postAcceptInvitation } from "@/app/api/invitations/[invitationId]/accept/route";
import { POST as postLedgerInvitation } from "@/app/api/ledgers/[ledgerId]/invitations/route";
import { POST as postLedgers } from "@/app/api/ledgers/route";

const authMock = (): Mock => auth as unknown as Mock;

/** 以降のリクエストを指定ユーザーのログイン状態にする。 */
export const signInAs = (userId: string): void => {
  authMock().mockResolvedValue({ user: { id: userId } });
};

/** 以降のリクエストを未認証状態にする。 */
export const signOutSession = (): void => {
  authMock().mockResolvedValue(null);
};

export type TestUser = { readonly id: string; readonly displayName: string };

/** テストユーザーを users へ直接作成する（表示名・LINE ID は実行ごとに一意）。 */
export const createTestUser = async (displayNamePrefix = "ITユーザー"): Promise<TestUser> => {
  const displayName = `${displayNamePrefix}-${randomUUID().slice(0, 8)}`;
  const { data, error } = await getSupabaseServerClient()
    .from("users")
    .insert({ line_user_id: `it-${randomUUID()}`, display_name: displayName })
    .select("id")
    .single<{ id: string }>();
  if (error !== null) {
    throw new Error(`テストユーザーの作成に失敗しました: ${error.message}`);
  }
  return { id: data.id, displayName };
};

/** Route Handler へ渡す Request を組み立てる（body は JSON 化）。 */
export const jsonRequest = (path: string, method: string, body?: unknown): Request =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** 動的ルートの context（params は Promise で渡る）を組み立てる。 */
export const routeContext = <T extends object>(params: T): { params: Promise<T> } => ({
  params: Promise.resolve(params),
});

/** 成功レスポンスの data を取り出す。 */
export const readData = async <T>(response: Response): Promise<T> => {
  const body = (await response.json()) as { data: T };
  return body.data;
};

/** エラーレスポンスのステータスとエラーコードを検証する。 */
export const expectErrorCode = async (
  response: Response,
  status: number,
  code: string,
): Promise<void> => {
  expect(response.status).toBe(status);
  const body = (await response.json()) as { error: { code: string } };
  expect(body.error.code).toBe(code);
};

/** 指定ユーザーで家計簿を作成し ID を返す（POST /api/ledgers 経由）。 */
export const createLedgerAs = async (
  userId: string,
  type: "personal" | "family",
  name: string,
): Promise<string> => {
  signInAs(userId);
  const response = await postLedgers(jsonRequest("/api/ledgers", "POST", { type, name }));
  if (response.status !== 201) {
    throw new Error(`家計簿の作成に失敗しました: status=${response.status}`);
  }
  const { id } = await readData<{ id: string }>(response);
  return id;
};

/** 招待→承諾を実行し、招待ユーザーを家族家計簿のメンバーへ追加する。 */
export const addFamilyMember = async (
  ledgerId: string,
  ownerUserId: string,
  inviteeUserId: string,
): Promise<void> => {
  signInAs(ownerUserId);
  const invitationResponse = await postLedgerInvitation(
    jsonRequest(`/api/ledgers/${ledgerId}/invitations`, "POST", { inviteeUserId }),
    routeContext({ ledgerId }),
  );
  if (invitationResponse.status !== 201) {
    throw new Error(`招待の作成に失敗しました: status=${invitationResponse.status}`);
  }
  const invitation = await readData<{ id: string }>(invitationResponse);

  signInAs(inviteeUserId);
  const acceptResponse = await postAcceptInvitation(
    jsonRequest(`/api/invitations/${invitation.id}/accept`, "POST", {}),
    routeContext({ invitationId: invitation.id }),
  );
  if (acceptResponse.status !== 200) {
    throw new Error(`招待の承諾に失敗しました: status=${acceptResponse.status}`);
  }
};

/** 実在しないリソースを指す UUID（アクセス不可＝403 の検証に使う）。 */
export const unknownUuid = (): string => randomUUID();
