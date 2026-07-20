/**
 * csv_column_mappings の Repository（database.md 3.8・api.md 8）。
 * mapping（jsonb）は入出力とも zod（columnMappingSchema）で検証する。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { ConflictError, NotFoundError } from "@/shared/errors/appError";
import { isUniqueViolation } from "@/shared/lib/dbErrorCodes";

import { columnMappingSchema, type ColumnMapping } from "../services/columnMapping";

const TABLE = "csv_column_mappings";
const COLUMNS = "id, ledger_id, name, mapping";

const rowSchema = z.object({
  id: z.uuid(),
  ledger_id: z.uuid(),
  name: z.string(),
  mapping: columnMappingSchema,
});

export type CsvColumnMapping = {
  readonly id: string;
  readonly ledgerId: string;
  readonly name: string;
  readonly mapping: ColumnMapping;
};

const toMapping = (row: z.infer<typeof rowSchema>): CsvColumnMapping => ({
  id: row.id,
  ledgerId: row.ledger_id,
  name: row.name,
  mapping: row.mapping,
});

export type CsvColumnMappingRepository = {
  list(ledgerId: string): Promise<CsvColumnMapping[]>;
  getById(ledgerId: string, mappingId: string): Promise<CsvColumnMapping | null>;
  create(input: {
    ledgerId: string;
    name: string;
    mapping: ColumnMapping;
  }): Promise<CsvColumnMapping>;
  update(
    ledgerId: string,
    mappingId: string,
    fields: { name?: string; mapping?: ColumnMapping },
  ): Promise<CsvColumnMapping>;
  softDelete(ledgerId: string, mappingId: string): Promise<void>;
};

export const createCsvColumnMappingRepository = (
  client: SupabaseClient,
): CsvColumnMappingRepository => ({
  async list(ledgerId) {
    const { data, error } = await client
      .from(TABLE)
      .select(COLUMNS)
      .eq("ledger_id", ledgerId)
      .is("deleted_at", null)
      .order("name", { ascending: true });

    if (error) {
      throw new Error(`Failed to list csv mappings: ${error.message}`);
    }
    return z.array(rowSchema).parse(data).map(toMapping);
  },

  async getById(ledgerId, mappingId) {
    const { data, error } = await client
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", mappingId)
      .eq("ledger_id", ledgerId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get csv mapping: ${error.message}`);
    }
    return data === null ? null : toMapping(rowSchema.parse(data));
  },

  async create(input) {
    const { data, error } = await client
      .from(TABLE)
      .insert({ ledger_id: input.ledgerId, name: input.name, mapping: input.mapping })
      .select(COLUMNS)
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("同じ名前のマッピングが既に存在します");
      }
      throw new Error(`Failed to create csv mapping: ${error.message}`);
    }
    return toMapping(rowSchema.parse(data));
  },

  async update(ledgerId, mappingId, fields) {
    const patch: Record<string, unknown> = {};
    if (fields.name !== undefined) patch.name = fields.name;
    if (fields.mapping !== undefined) patch.mapping = fields.mapping;

    const { data, error } = await client
      .from(TABLE)
      .update(patch)
      .eq("id", mappingId)
      .eq("ledger_id", ledgerId)
      .is("deleted_at", null)
      .select(COLUMNS)
      .maybeSingle();

    if (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("同じ名前のマッピングが既に存在します");
      }
      throw new Error(`Failed to update csv mapping: ${error.message}`);
    }
    if (data === null) {
      throw new NotFoundError("マッピングが見つかりません");
    }
    return toMapping(rowSchema.parse(data));
  },

  async softDelete(ledgerId, mappingId) {
    const { data, error } = await client
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", mappingId)
      .eq("ledger_id", ledgerId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to delete csv mapping: ${error.message}`);
    }
    if (data === null) {
      throw new NotFoundError("マッピングが見つかりません");
    }
  },
});
