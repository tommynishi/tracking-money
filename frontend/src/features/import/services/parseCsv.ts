/**
 * CSVテキストのレコード分解（RFC 4180 準拠の最小実装）。
 * ダブルクォート囲み・囲み内のカンマ / 改行 / "" エスケープに対応する。
 * カード会社CSVは列構成が多様なため、ここでは分解のみ行い解釈は各パーサーに委ねる。
 */

/** CSVテキストを2次元配列へ分解する。末尾の空行は除外する。 */
export const parseCsv = (text: string): string[][] => {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let index = 0;

  const pushField = (): void => {
    record.push(field);
    field = "";
  };
  const pushRecord = (): void => {
    pushField();
    records.push(record);
    record = [];
  };

  while (index < text.length) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }
    if (char === ",") {
      pushField();
      index += 1;
      continue;
    }
    if (char === "\r") {
      index += text[index + 1] === "\n" ? 2 : 1;
      pushRecord();
      continue;
    }
    if (char === "\n") {
      index += 1;
      pushRecord();
      continue;
    }
    field += char;
    index += 1;
  }
  if (field !== "" || record.length > 0) {
    pushRecord();
  }

  // 末尾や途中の完全な空行（空文字セルのみ）は除外せず保持すると行番号がずれるため、
  // 空行もレコードとして残し、判定は各パーサーが行う。ただし最終行の空レコードは除外する。
  return records.filter((cells, i) => i < records.length - 1 || cells.some((cell) => cell !== ""));
};
