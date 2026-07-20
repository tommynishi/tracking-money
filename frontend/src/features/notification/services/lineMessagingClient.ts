/**
 * LINE Messaging API のプッシュ送信（CON-04・FR-NOTIFY-01〜02）。
 * LINE Login とは別チャネル（LINE公式アカウント）のアクセストークンを使う。
 * 依存追加を避け SDK は使わず fetch で呼び出す。失敗は ExternalServiceError（呼び出し側でログのみ・FR-NOTIFY-04）。
 */
import { ExternalServiceError } from "@/shared/errors/appError";
import { getServerEnv } from "@/shared/config/env";

const PUSH_URL = "https://api.line.me/v2/bot/message/push";

export type LineMessagingClient = {
  pushText(lineUserId: string, text: string): Promise<void>;
};

export const createLineMessagingClient = (): LineMessagingClient => ({
  async pushText(lineUserId, text) {
    const { LINE_MESSAGING_CHANNEL_ACCESS_TOKEN } = getServerEnv();
    const response = await fetch(PUSH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${LINE_MESSAGING_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: "text", text }],
      }),
    });
    if (!response.ok) {
      throw new ExternalServiceError(`LINE通知の送信に失敗しました（status=${response.status}）`);
    }
  },
});
