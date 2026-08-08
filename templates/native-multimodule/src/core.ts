import { Cmd, asciiBytes } from "@native-sdk/core";
import {
  applyTextInputEvent,
  type TextEditState,
  type TextInputEvent,
} from "@native-sdk/core/text";
import { analyzeRows, formatRow, headerRow } from "./csv.ts";

const MAX_CSV_BYTES = 100000;

const SAMPLE_CSV = asciiBytes(
  "name,age,city\nAlice,30,NYC\nBob,,LA\nAlice,30,NYC\nCara,25,SF",
);

export interface Model {
  readonly csvText: Uint8Array;
  readonly selectionAnchor: number;
  readonly selectionFocus: number;
}

export type Msg =
  | { readonly kind: "edit_csv"; readonly event: TextInputEvent }
  | { readonly kind: "reset" };

export interface RowView {
  readonly id: number;
  readonly text: Uint8Array;
  readonly flag: Uint8Array;
}

export function initialModel(): Model {
  const length = SAMPLE_CSV.length;
  const selection = length > 0 && length < 100000 ? Math.trunc(length) : 0;
  return { csvText: SAMPLE_CSV, selectionAnchor: selection, selectionFocus: selection };
}

export function headerText(model: Model): Uint8Array {
  const header = headerRow(model.csvText);
  return header.length === 0 ? asciiBytes("no header") : formatRow(header);
}

export function dataRows(model: Model): readonly RowView[] {
  const results = analyzeRows(model.csvText);
  const rows: RowView[] = [];
  for (let index = 0; index < results.length && index < 500; index = index + 1) {
    const result = results[index];
    let flag = asciiBytes("ok");
    if (result.isDuplicate && result.hasMissing) flag = asciiBytes("duplicate + missing");
    else if (result.isDuplicate) flag = asciiBytes("duplicate");
    else if (result.hasMissing) flag = asciiBytes("missing");
    rows.push({ id: index, text: formatRow(result.cells), flag });
  }
  return rows;
}

export function summaryText(model: Model): Uint8Array {
  const results = analyzeRows(model.csvText);
  let duplicates = 0;
  let missing = 0;
  for (let index = 0; index < results.length; index = index + 1) {
    if (results[index].isDuplicate) duplicates = duplicates + 1;
    if (results[index].hasMissing) missing = missing + 1;
  }
  return asciiBytes(`${results.length} rows, ${duplicates} duplicate, ${missing} missing`);
}

export function update(model: Model, msg: Msg): [Model, Cmd<Msg>] {
  switch (msg.kind) {
    case "edit_csv": {
      const editState: TextEditState = {
        text: model.csvText,
        selection: { anchor: model.selectionAnchor, focus: model.selectionFocus },
        composition: null,
      };
      const next = applyTextInputEvent(editState, msg.event, MAX_CSV_BYTES);
      if (next === null) return [model, Cmd.none];
      const selectionAnchor = next.selection.anchor >= 0 && next.selection.anchor <= 100000
        ? Math.trunc(next.selection.anchor)
        : 0;
      const selectionFocus = next.selection.focus >= 0 && next.selection.focus <= 100000
        ? Math.trunc(next.selection.focus)
        : 0;
      return [
        { ...model, csvText: next.text, selectionAnchor, selectionFocus },
        Cmd.none,
      ];
    }
    case "reset": {
      const length = SAMPLE_CSV.length;
      const selection = length > 0 && length < 100000 ? Math.trunc(length) : 0;
      return [
        { ...model, csvText: SAMPLE_CSV, selectionAnchor: selection, selectionFocus: selection },
        Cmd.none,
      ];
    }
  }
}
