// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Modal } from "./Modal";

const noop = () => {};

describe("Modal", () => {
  it("isOpen=false のとき何も描画しない", () => {
    // Act
    render(
      <Modal isOpen={false} onClose={noop} title="確認">
        <p>本文</p>
      </Modal>,
    );

    // Assert
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("開いているとき dialog を role/aria 付きで描画し、タイトルへ関連付ける", () => {
    // Act
    render(
      <Modal isOpen onClose={noop} title="削除の確認">
        <p>本文</p>
      </Modal>,
    );

    // Assert
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const heading = screen.getByRole("heading", { name: "削除の確認" });
    expect(dialog.getAttribute("aria-labelledby")).toBe(heading.id);
  });

  it("Esc キーで onClose が呼ばれる", () => {
    // Arrange
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="t">
        <button>中身</button>
      </Modal>,
    );

    // Act
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    // Assert
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("背景クリックで閉じ、closeOnBackdrop=false では閉じない", () => {
    // Arrange
    const onClose = vi.fn();
    const { rerender } = render(
      <Modal isOpen onClose={onClose} title="t">
        <p>x</p>
      </Modal>,
    );
    const backdrop = screen.getByRole("dialog").parentElement;

    // Act & Assert（既定は閉じる）
    fireEvent.mouseDown(backdrop as HTMLElement);
    expect(onClose).toHaveBeenCalledOnce();

    // Act & Assert（closeOnBackdrop=false は閉じない）
    onClose.mockClear();
    rerender(
      <Modal isOpen onClose={onClose} title="t" closeOnBackdrop={false}>
        <p>x</p>
      </Modal>,
    );
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });
});
