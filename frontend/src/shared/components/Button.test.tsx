// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./Button";

describe("Button", () => {
  it("子要素を描画し、クリックで onClick が発火する", () => {
    // Arrange
    const onClick = vi.fn();
    render(<Button onClick={onClick}>保存</Button>);

    // Act
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    // Assert
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("isLoading は disabled＋aria-busy になり、クリックできない", () => {
    // Arrange
    const onClick = vi.fn();
    render(
      <Button isLoading onClick={onClick}>
        送信
      </Button>,
    );
    const button = screen.getByRole("button", { name: "送信" });

    // Act
    fireEvent.click(button);

    // Assert
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("type は既定で button（フォーム誤送信防止）", () => {
    // Act
    render(<Button>x</Button>);

    // Assert
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });
});
