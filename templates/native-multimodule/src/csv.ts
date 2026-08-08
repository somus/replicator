import { asciiBytes } from "@native-sdk/core";

const NEWLINE = 10;
const COMMA = 44;

export interface RowResult {
  readonly cells: readonly Uint8Array[];
  readonly isDuplicate: boolean;
  readonly hasMissing: boolean;
}

export function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const joined = new Uint8Array(left.length + right.length);
  joined.set(left, 0);
  joined.set(right, left.length);
  return joined;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index = index + 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function rowsEqual(
  left: readonly Uint8Array[],
  right: readonly Uint8Array[],
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index = index + 1) {
    if (!bytesEqual(left[index], right[index])) return false;
  }
  return true;
}

function splitCells(line: Uint8Array): readonly Uint8Array[] {
  const cells: Uint8Array[] = [];
  let start = 0;
  for (let index = 0; index <= line.length; index = index + 1) {
    if (index === line.length || line[index] === COMMA) {
      cells.push(line.slice(start, index));
      start = index + 1;
    }
  }
  return cells;
}

function parseRows(csv: Uint8Array): readonly (readonly Uint8Array[])[] {
  const rows: (readonly Uint8Array[])[] = [];
  let lineStart = 0;
  for (let index = 0; index <= csv.length; index = index + 1) {
    if (index === csv.length || csv[index] === NEWLINE) {
      if (index > lineStart) rows.push(splitCells(csv.slice(lineStart, index)));
      lineStart = index + 1;
    }
  }
  return rows;
}

export function headerRow(csv: Uint8Array): readonly Uint8Array[] {
  const rows = parseRows(csv);
  return rows.length === 0 ? [] : rows[0];
}

export function analyzeRows(csv: Uint8Array): readonly RowResult[] {
  const rows = parseRows(csv);
  if (rows.length < 2) return [];

  const dataRows: (readonly Uint8Array[])[] = [];
  for (let index = 1; index < rows.length; index = index + 1) {
    dataRows.push(rows[index]);
  }

  const results: RowResult[] = [];
  for (let index = 0; index < dataRows.length; index = index + 1) {
    let duplicateMatches = 0;
    for (let candidate = 0; candidate < dataRows.length; candidate = candidate + 1) {
      if (rowsEqual(dataRows[candidate], dataRows[index])) duplicateMatches = duplicateMatches + 1;
    }

    let hasMissing = false;
    for (let cell = 0; cell < dataRows[index].length; cell = cell + 1) {
      if (dataRows[index][cell].length === 0) hasMissing = true;
    }
    results.push({
      cells: dataRows[index],
      isDuplicate: duplicateMatches > 1,
      hasMissing,
    });
  }
  return results;
}

export function formatRow(cells: readonly Uint8Array[]): Uint8Array {
  let formatted = asciiBytes("");
  for (let index = 0; index < cells.length; index = index + 1) {
    const cell = cells[index].length === 0 ? asciiBytes("(empty)") : cells[index];
    formatted = index === 0
      ? cell
      : concatBytes(concatBytes(formatted, asciiBytes(" | ")), cell);
  }
  return formatted;
}
