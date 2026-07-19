"use client";

/** ログイン中ユーザー情報（GET /api/me）の取得フック。各画面の帳簿解決に使う。 */
import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/shared/api/client";

export type Me = {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly personalLedgerId: string | null;
  readonly familyLedgerId: string | null;
};

export type MeState = "loading" | "ready" | "error";

export const useMe = () => {
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<MeState>("loading");

  const reload = useCallback(
    (): Promise<void> =>
      apiFetch<Me>("/api/me")
        .then(({ data }) => {
          setMe(data);
          setState("ready");
        })
        .catch(() => setState("error")),
    [],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const retry = () => {
    setState("loading");
    void reload();
  };

  return { me, state, reload, retry };
};
