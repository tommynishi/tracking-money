import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ConflictError, ValidationError } from "@/shared/errors/appError";

import { handleApiError, jsonData, noContent } from "./response";

describe("jsonData", () => {
  it("{ data } 形式で返す（既定 200）", async () => {
    const response = jsonData({ id: "1" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { id: "1" } });
  });

  it("meta 指定時は { data, meta } 形式で返す", async () => {
    const meta = { page: 1, perPage: 20, totalCount: 0, totalPages: 1 };
    const response = jsonData([], { meta });
    expect(await response.json()).toEqual({ data: [], meta });
  });

  it("status を指定できる（201）", () => {
    expect(jsonData({}, { status: 201 }).status).toBe(201);
  });
});

describe("noContent", () => {
  it("204・ボディなしで返す", async () => {
    const response = noContent();
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });
});

describe("handleApiError", () => {
  it("AppError はステータス・コード・details をそのまま返す", async () => {
    const error = new ConflictError("衝突しました", [{ code: "X", message: "詳細" }]);
    const response = handleApiError(error);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: "CONFLICT",
        message: "衝突しました",
        details: [{ code: "X", message: "詳細" }],
      },
    });
  });

  it("details なしの AppError は details を含めない", async () => {
    const response = handleApiError(new ValidationError("不正です"));
    const body = (await response.json()) as { error: Record<string, unknown> };
    expect(response.status).toBe(400);
    expect(body.error).toEqual({ code: "VALIDATION_ERROR", message: "不正です" });
  });

  it("ZodError は 400 VALIDATION_ERROR（field 付き details）へ変換する", async () => {
    const result = z.object({ displayName: z.string() }).safeParse({});
    if (result.success) throw new Error("expected parse failure");

    const response = handleApiError(result.error);
    const body = (await response.json()) as {
      error: { code: string; details: { field?: string }[] };
    };
    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details[0]?.field).toBe("displayName");
  });

  it("想定外の例外は 500 INTERNAL_ERROR（内容を漏らさない）", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = handleApiError(new Error("secret detail"));
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).not.toContain("secret");
  });
});
