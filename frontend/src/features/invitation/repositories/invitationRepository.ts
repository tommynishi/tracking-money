/**
 * ledger_invitations への DB アクセス（Repository 層）。DB行⇔ドメイン型の変換を担い、業務判断は持たない。
 * 認可・状態遷移の妥当性検証は Service 層の責務とする。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { ConflictError, ValidationError } from "@/shared/errors/appError";
import {
  FAMILY_MEMBERSHIP_CONFLICT_CODE,
  FOREIGN_KEY_VIOLATION_CODE,
  RAISE_EXCEPTION_CODE,
  hasErrorCode,
  isUniqueViolation,
} from "@/shared/lib/dbErrorCodes";

import type { Invitation, InvitationDirection, InvitationStatus } from "../types";

const INVITATIONS_TABLE = "ledger_invitations";
const INVITATION_COLUMNS =
  "id, ledger_id, inviter_user_id, invitee_user_id, status, responded_at, created_at, updated_at";
const ACCEPT_INVITATION_RPC = "accept_family_invitation";

const invitationRowSchema = z.object({
  id: z.string(),
  ledger_id: z.string(),
  inviter_user_id: z.string(),
  invitee_user_id: z.string(),
  status: z.enum(["pending", "accepted", "declined", "canceled"]),
  responded_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const toInvitation = (row: z.infer<typeof invitationRowSchema>): Invitation => ({
  id: row.id,
  ledgerId: row.ledger_id,
  inviterUserId: row.inviter_user_id,
  inviteeUserId: row.invitee_user_id,
  status: row.status,
  respondedAt: row.responded_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export type CreatePendingInvitationInput = {
  readonly ledgerId: string;
  readonly inviterUserId: string;
  readonly inviteeUserId: string;
};

export type ListInvitationsInput = {
  readonly userId: string;
  readonly direction: InvitationDirection;
  readonly status: InvitationStatus;
};

export type InvitationRepository = {
  /** pending 招待を作成する。相手不存在は ValidationError、pending 重複は ConflictError。 */
  createPending(input: CreatePendingInvitationInput): Promise<Invitation>;
  /** 招待を1件取得する。存在しなければ null。 */
  getById(invitationId: string): Promise<Invitation | null>;
  /** 自分宛/自分発の招待を状態で絞り込み、新しい順で取得する（api.md 4.2）。 */
  listForUser(input: ListInvitationsInput): Promise<Invitation[]>;
  /**
   * pending の招待を応答済み状態へ更新し、responded_at を記録する（accepted / declined）。
   * 既に pending でない場合は ConflictError。
   */
  markResponded(invitationId: string, status: "accepted" | "declined"): Promise<Invitation>;
  /** pending の招待を取消（canceled）にする。既に pending でない場合は ConflictError。 */
  cancel(invitationId: string): Promise<Invitation>;
  /**
   * 招待を承諾し、家族家計簿へ参加して更新後の招待を返す（RPC・原子的）。
   * ownFamilyLedgerId が非 null の場合は自分の家族家計簿を削除してから参加する。
   * pending でない場合や既にメンバー・家族所属済みの場合は ConflictError。
   */
  acceptFamilyInvitation(
    invitationId: string,
    inviteeUserId: string,
    ownFamilyLedgerId: string | null,
  ): Promise<Invitation>;
};

const NOT_PENDING_MESSAGE = "この招待は既に処理されています";

export const createInvitationRepository = (client: SupabaseClient): InvitationRepository => ({
  async createPending({ ledgerId, inviterUserId, inviteeUserId }) {
    const { data, error } = await client
      .from(INVITATIONS_TABLE)
      .insert({
        ledger_id: ledgerId,
        inviter_user_id: inviterUserId,
        invitee_user_id: inviteeUserId,
        status: "pending",
      })
      .select(INVITATION_COLUMNS)
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("この相手には既に招待中です");
      }
      if (hasErrorCode(error, FOREIGN_KEY_VIOLATION_CODE)) {
        throw new ValidationError("指定されたユーザーが存在しません");
      }
      throw new Error(`Failed to create invitation: ${error.message}`);
    }

    return toInvitation(invitationRowSchema.parse(data));
  },

  async getById(invitationId) {
    const { data, error } = await client
      .from(INVITATIONS_TABLE)
      .select(INVITATION_COLUMNS)
      .eq("id", invitationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get invitation: ${error.message}`);
    }

    return data === null ? null : toInvitation(invitationRowSchema.parse(data));
  },

  async listForUser({ userId, direction, status }) {
    const column = direction === "received" ? "invitee_user_id" : "inviter_user_id";
    const { data, error } = await client
      .from(INVITATIONS_TABLE)
      .select(INVITATION_COLUMNS)
      .eq(column, userId)
      .eq("status", status)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to list invitations: ${error.message}`);
    }

    return z.array(invitationRowSchema).parse(data).map(toInvitation);
  },

  async markResponded(invitationId, status) {
    const { data, error } = await client
      .from(INVITATIONS_TABLE)
      .update({ status, responded_at: new Date().toISOString() })
      .eq("id", invitationId)
      .eq("status", "pending")
      .is("deleted_at", null)
      .select(INVITATION_COLUMNS)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to update invitation: ${error.message}`);
    }
    if (data === null) {
      throw new ConflictError(NOT_PENDING_MESSAGE);
    }

    return toInvitation(invitationRowSchema.parse(data));
  },

  async cancel(invitationId) {
    const { data, error } = await client
      .from(INVITATIONS_TABLE)
      .update({ status: "canceled" })
      .eq("id", invitationId)
      .eq("status", "pending")
      .is("deleted_at", null)
      .select(INVITATION_COLUMNS)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to cancel invitation: ${error.message}`);
    }
    if (data === null) {
      throw new ConflictError(NOT_PENDING_MESSAGE);
    }

    return toInvitation(invitationRowSchema.parse(data));
  },

  async acceptFamilyInvitation(invitationId, inviteeUserId, ownFamilyLedgerId) {
    const { data, error } = await client.rpc(ACCEPT_INVITATION_RPC, {
      p_invitation_id: invitationId,
      p_invitee_user_id: inviteeUserId,
      p_own_family_ledger_id: ownFamilyLedgerId,
    });

    if (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("既にこの家計簿のメンバーです");
      }
      // 承諾不能（pending でない等）を表す RPC の raise exception
      if (hasErrorCode(error, RAISE_EXCEPTION_CODE)) {
        throw new ConflictError(NOT_PENDING_MESSAGE);
      }
      if (hasErrorCode(error, FAMILY_MEMBERSHIP_CONFLICT_CODE)) {
        throw new ConflictError("既に別の家族家計簿に参加しています");
      }
      throw new Error(`Failed to accept invitation: ${error.message}`);
    }

    return toInvitation(invitationRowSchema.parse(data));
  },
});
