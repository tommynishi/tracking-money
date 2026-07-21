import { describe, expect, it } from "vitest";

import { ValidationError } from "@/shared/errors/appError";

import { resolveSplitForCreate, resolveSplitForUpdate } from "./splitInput";

const TARO = "11111111-1111-1111-1111-111111111111";
const HANAKO = "22222222-2222-2222-2222-222222222222";
const OTHER = "33333333-3333-3333-3333-333333333333";
const MEMBERS = new Set([TARO, HANAKO]);

describe("resolveSplitForCreate", () => {
  it("個人家計簿では default 固定・支払者は既定値のみ", () => {
    const result = resolveSplitForCreate("personal", new Set([TARO]), TARO, {});
    expect(result).toEqual({
      paidByUserId: TARO,
      splitType: "default",
      splitShares: null,
      assignedUserId: null,
    });
  });

  it("個人家計簿で splitType=custom を指定すると ValidationError", () => {
    expect(() =>
      resolveSplitForCreate("personal", new Set([TARO]), TARO, { splitType: "custom" }),
    ).toThrow(ValidationError);
  });

  it("家族家計簿・未指定なら支払者=既定値・splitType=default", () => {
    const result = resolveSplitForCreate("family", MEMBERS, TARO, {});
    expect(result).toEqual({
      paidByUserId: TARO,
      splitType: "default",
      splitShares: null,
      assignedUserId: null,
    });
  });

  it("支払者がメンバーでなければ ValidationError", () => {
    expect(() =>
      resolveSplitForCreate("family", MEMBERS, TARO, { paidByUserId: OTHER }),
    ).toThrow(ValidationError);
  });

  it("custom: 2人以上の正の比重を指定できる", () => {
    const result = resolveSplitForCreate("family", MEMBERS, TARO, {
      splitType: "custom",
      splitShares: [
        { userId: TARO, weight: 70 },
        { userId: HANAKO, weight: 30 },
      ],
    });
    expect(result.splitType).toBe("custom");
    expect(result.splitShares).toHaveLength(2);
  });

  it("custom: 比重が1人分だけなら ValidationError", () => {
    expect(() =>
      resolveSplitForCreate("family", MEMBERS, TARO, {
        splitType: "custom",
        splitShares: [{ userId: TARO, weight: 100 }],
      }),
    ).toThrow(ValidationError);
  });

  it("custom: 重複ユーザーは ValidationError", () => {
    expect(() =>
      resolveSplitForCreate("family", MEMBERS, TARO, {
        splitType: "custom",
        splitShares: [
          { userId: TARO, weight: 50 },
          { userId: TARO, weight: 50 },
        ],
      }),
    ).toThrow(ValidationError);
  });

  it("custom: メンバー以外を含むと ValidationError", () => {
    expect(() =>
      resolveSplitForCreate("family", MEMBERS, TARO, {
        splitType: "custom",
        splitShares: [
          { userId: TARO, weight: 50 },
          { userId: OTHER, weight: 50 },
        ],
      }),
    ).toThrow(ValidationError);
  });

  it("assigned: 計上先を指定できる", () => {
    const result = resolveSplitForCreate("family", MEMBERS, TARO, {
      splitType: "assigned",
      assignedUserId: HANAKO,
    });
    expect(result).toEqual({
      paidByUserId: TARO,
      splitType: "assigned",
      splitShares: null,
      assignedUserId: HANAKO,
    });
  });

  it("assigned: 計上先の指定がなければ ValidationError", () => {
    expect(() =>
      resolveSplitForCreate("family", MEMBERS, TARO, { splitType: "assigned" }),
    ).toThrow(ValidationError);
  });

  it("default: splitShares/assignedUserId を指定すると ValidationError", () => {
    expect(() =>
      resolveSplitForCreate("family", MEMBERS, TARO, { assignedUserId: HANAKO }),
    ).toThrow(ValidationError);
  });
});

describe("resolveSplitForUpdate", () => {
  it("按分に関する指定が無ければ null（変更なし）", () => {
    expect(resolveSplitForUpdate("family", MEMBERS, {})).toBeNull();
    expect(resolveSplitForUpdate("family", MEMBERS, { paidByUserId: TARO })).toBeNull();
  });

  it("splitType のみ指定すれば新しい組み合わせとして解決する", () => {
    const result = resolveSplitForUpdate("family", MEMBERS, {
      splitType: "assigned",
      assignedUserId: HANAKO,
    });
    expect(result).toEqual({ splitType: "assigned", splitShares: null, assignedUserId: HANAKO });
  });

  it("個人家計簿で custom を指定すると ValidationError", () => {
    expect(() =>
      resolveSplitForUpdate("personal", new Set([TARO]), { splitType: "custom" }),
    ).toThrow(ValidationError);
  });
});
