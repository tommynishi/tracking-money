import { describe, expect, it } from "vitest";

import { calculateSettlement } from "./settlementCalc";

const TARO = "11111111-1111-1111-1111-111111111111";
const HANAKO = "22222222-2222-2222-2222-222222222222";
const RETIRED = "33333333-3333-3333-3333-333333333333";

const members = [
  { userId: TARO, displayName: "たろう", weight: 60 },
  { userId: HANAKO, displayName: "はなこ", weight: 40 },
];

describe("calculateSettlement", () => {
  it("default: 既定比重で按分し、支払額との差から精算額を計算する", () => {
    // たろうが10,000円払う（既定比重60/40）→ 本来はたろう6,000・はなこ4,000
    // はなこは負担0のに0円しか払っていないので、はなこがたろうへ4,000円支払えば精算完了
    const result = calculateSettlement("2026-07", members, [
      { amount: 10000, paidByUserId: TARO, splitType: "default", splitShares: null, assignedUserId: null },
    ]);

    expect(result.members).toEqual([
      { userId: TARO, displayName: "たろう", weight: 60, fairShareAmount: 6000, paidAmount: 10000, balance: 4000 },
      { userId: HANAKO, displayName: "はなこ", weight: 40, fairShareAmount: 4000, paidAmount: 0, balance: -4000 },
    ]);
    expect(result.transfers).toEqual([{ fromUserId: HANAKO, toUserId: TARO, amount: 4000 }]);
    expect(result.excludedEntryCount).toBe(0);
  });

  it("custom: 明細ごとの独自比重を使う", () => {
    const result = calculateSettlement("2026-07", members, [
      {
        amount: 1000,
        paidByUserId: HANAKO,
        splitType: "custom",
        splitShares: [
          { userId: TARO, weight: 1 },
          { userId: HANAKO, weight: 1 },
        ],
        assignedUserId: null,
      },
    ]);
    const taro = result.members.find((m) => m.userId === TARO);
    expect(taro?.fairShareAmount).toBe(500);
  });

  it("assigned: 1人に全額計上する", () => {
    const result = calculateSettlement("2026-07", members, [
      { amount: 3000, paidByUserId: TARO, splitType: "assigned", splitShares: null, assignedUserId: HANAKO },
    ]);
    const hanako = result.members.find((m) => m.userId === HANAKO);
    const taro = result.members.find((m) => m.userId === TARO);
    expect(hanako?.fairShareAmount).toBe(3000);
    expect(taro?.fairShareAmount).toBe(0);
    expect(result.transfers).toEqual([{ fromUserId: HANAKO, toUserId: TARO, amount: 3000 }]);
  });

  it("端数は最大剰余法で合計が amount と一致するように配分する", () => {
    const result = calculateSettlement("2026-07", members, [
      { amount: 1001, paidByUserId: TARO, splitType: "default", splitShares: null, assignedUserId: null },
    ]);
    const total = result.members.reduce((sum, m) => sum + m.fairShareAmount, 0);
    expect(total).toBe(1001);
  });

  it("退出済みメンバーが関与する明細は除外し excludedEntryCount へ計上する", () => {
    const result = calculateSettlement("2026-07", members, [
      { amount: 500, paidByUserId: RETIRED, splitType: "default", splitShares: null, assignedUserId: null },
      { amount: 1000, paidByUserId: TARO, splitType: "default", splitShares: null, assignedUserId: null },
    ]);
    expect(result.excludedEntryCount).toBe(1);
    const total = result.members.reduce((sum, m) => sum + m.fairShareAmount, 0);
    expect(total).toBe(1000);
  });

  it("メンバーが1名でも空にならず計算できる", () => {
    const result = calculateSettlement("2026-07", [members[0]], []);
    expect(result.members).toEqual([
      { userId: TARO, displayName: "たろう", weight: 60, fairShareAmount: 0, paidAmount: 0, balance: 0 },
    ]);
    expect(result.transfers).toEqual([]);
  });
});
