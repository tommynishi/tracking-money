// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToastProvider, useToast } from "./ToastProvider";
import type { ToastType } from "./toast";

const MESSAGES: Record<"success" | "error", string> = {
  success: "保存しました",
  error: "失敗しました",
};

const Trigger = ({ type }: { type: "success" | "error" }) => {
  const { showToast } = useToast();
  return (
    <button onClick={() => showToast({ type: type as ToastType, message: MESSAGES[type] })}>
      show
    </button>
  );
};

afterEach(() => {
  vi.useRealTimers();
});

describe("ToastProvider", () => {
  it("成功トーストは4秒後に自動消去される", () => {
    // Arrange
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger type="success" />
      </ToastProvider>,
    );

    // Act
    fireEvent.click(screen.getByText("show"));

    // Assert（表示 → 4秒経過で消去）
    expect(screen.getByText(MESSAGES.success)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByText(MESSAGES.success)).toBeNull();
  });

  it("エラートーストは自動消去されず、閉じるボタンで消える", () => {
    // Arrange
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger type="error" />
      </ToastProvider>,
    );

    // Act
    fireEvent.click(screen.getByText("show"));
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    // Assert（時間経過後も残る → クローズで消える）
    expect(screen.getByText(MESSAGES.error)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "通知を閉じる" }));
    expect(screen.queryByText(MESSAGES.error)).toBeNull();
  });
});
