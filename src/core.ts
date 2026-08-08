import { Cmd, asciiBytes } from "@native-sdk/core";
import { applyTextInputEvent, type TextEditState, type TextInputEvent } from "@native-sdk/core/text";

export interface Draft {
  readonly bytes: Uint8Array;
  readonly anchor: number;
  readonly focus: number;
  readonly compStart: number;
  readonly compEnd: number;
}

export interface Model {
  readonly selectedUtility: number;
  readonly globalBusy: boolean;
  readonly revisionDraft: Draft;
  readonly submittedRevision: Uint8Array;
  readonly revisionSubmitted: boolean;
  readonly firstReferenceAttached: boolean;
  readonly secondReferenceAttached: boolean;
  readonly storageChosen: boolean;
  readonly importChosen: boolean;
  readonly attemptInterrupted: boolean;
  readonly launched: boolean;
}

export type Msg =
  | { readonly kind: "select_focus" }
  | { readonly kind: "select_recipe" }
  | { readonly kind: "select_renamer" }
  | { readonly kind: "select_tally" }
  | { readonly kind: "new_utility" }
  | { readonly kind: "launch" }
  | { readonly kind: "revision_edit"; readonly edit: TextInputEvent }
  | { readonly kind: "send_revision" }
  | { readonly kind: "attach_reference" }
  | { readonly kind: "remove_first_reference" }
  | { readonly kind: "remove_second_reference" }
  | { readonly kind: "choose_inside" }
  | { readonly kind: "choose_markdown" }
  | { readonly kind: "choose_url" }
  | { readonly kind: "choose_text" }
  | { readonly kind: "continue_clarification" }
  | { readonly kind: "cancel_attempt" }
  | { readonly kind: "retry_attempt" };

export const viewUnbound = ["launched"] as const;

export function initialModel(): Model {
  return {
    selectedUtility: 1,
    globalBusy: false,
    revisionDraft: emptyDraft(),
    submittedRevision: new Uint8Array(0),
    revisionSubmitted: false,
    firstReferenceAttached: true,
    secondReferenceAttached: false,
    storageChosen: false,
    importChosen: false,
    attemptInterrupted: false,
    launched: false,
  };
}

export function focusSelected(model: Model): boolean {
  return model.selectedUtility === 1;
}

export function recipeSelected(model: Model): boolean {
  return model.selectedUtility === 2;
}

export function renamerSelected(model: Model): boolean {
  return model.selectedUtility === 3;
}

export function tallySelected(model: Model): boolean {
  return model.selectedUtility === 4;
}

export function selectedInitial(model: Model): Uint8Array {
  if (model.selectedUtility === 1) return asciiBytes("F");
  if (model.selectedUtility === 2) return asciiBytes("R");
  if (model.selectedUtility === 3) return asciiBytes("F");
  return asciiBytes("T");
}

export function selectedName(model: Model): Uint8Array {
  if (model.selectedUtility === 1) return asciiBytes("Focus Sprint");
  if (model.selectedUtility === 2) return asciiBytes("Recipe Clipper");
  if (model.selectedUtility === 3) return asciiBytes("File Renamer");
  return asciiBytes("Menu Bar Tally");
}

export function selectedDescription(model: Model): Uint8Array {
  if (model.selectedUtility === 1) return asciiBytes("Stay focused. Get more done.");
  if (model.selectedUtility === 2) return asciiBytes("Save recipes in one place.");
  if (model.selectedUtility === 3) return asciiBytes("Batch rename files quickly.");
  return asciiBytes("Track counts from anywhere.");
}

export function selectedStatus(model: Model): Uint8Array {
  if (model.selectedUtility === 1) return model.globalBusy && model.revisionSubmitted ? asciiBytes("Building") : asciiBytes("Ready");
  if (model.selectedUtility === 2) return asciiBytes("Needs input");
  if (model.selectedUtility === 3) return model.attemptInterrupted ? asciiBytes("Interrupted") : asciiBytes("Building");
  return asciiBytes("Needs attention");
}

export function canLaunch(model: Model): boolean {
  return model.selectedUtility === 1;
}

export function requestControlsDisabled(model: Model): boolean {
  return model.globalBusy || model.selectedUtility !== 1;
}

export function composerPlaceholder(model: Model): Uint8Array {
  if (model.globalBusy) return asciiBytes("Another request is active. You can browse and launch Ready Utilities.");
  if (model.selectedUtility !== 1) return asciiBytes("Select a Ready Utility to request a revision.");
  return asciiBytes("Describe a change to this Utility...");
}

export function clarificationIncomplete(model: Model): boolean {
  return !model.storageChosen || !model.importChosen;
}

export function revisionText(model: Model): Uint8Array {
  return model.revisionDraft.bytes;
}

function emptyDraft(): Draft {
  return { bytes: new Uint8Array(0), anchor: 0, focus: 0, compStart: -1, compEnd: -1 };
}

function editDraft(current: Draft, event: TextInputEvent): Draft {
  const state: TextEditState = {
    text: current.bytes,
    selection: { anchor: current.anchor, focus: current.focus },
    composition: current.compStart >= 0 ? { start: current.compStart, end: current.compEnd } : null,
  };
  const next = applyTextInputEvent(state, event, 2000);
  if (next === null) return current;
  const compStart = next.composition === null ? -1 : next.composition.start;
  const compEnd = next.composition === null ? -1 : next.composition.end;
  return {
    bytes: next.text,
    anchor: next.selection.anchor,
    focus: next.selection.focus,
    compStart: compStart >= -1 && compStart <= 9007199254740991 ? Math.trunc(compStart) : -1,
    compEnd: compEnd >= -1 && compEnd <= 9007199254740991 ? Math.trunc(compEnd) : -1,
  };
}

export function update(model: Model, msg: Msg): [Model, Cmd<Msg>] {
  switch (msg.kind) {
    case "select_focus":
      return [{ ...model, selectedUtility: 1 }, Cmd.none];
    case "select_recipe":
      return [{ ...model, selectedUtility: 2, globalBusy: true }, Cmd.none];
    case "select_renamer":
      return [{ ...model, selectedUtility: 3, globalBusy: !model.attemptInterrupted }, Cmd.none];
    case "select_tally":
      return [{ ...model, selectedUtility: 4 }, Cmd.none];
    case "revision_edit":
      if (requestControlsDisabled(model)) return [model, Cmd.none];
      return [{ ...model, revisionDraft: editDraft(model.revisionDraft, msg.edit) }, Cmd.none];
    case "send_revision":
      if (requestControlsDisabled(model) || model.revisionDraft.bytes.length === 0) return [model, Cmd.none];
      return [{ ...model, globalBusy: true, revisionSubmitted: true, submittedRevision: model.revisionDraft.bytes, revisionDraft: emptyDraft() }, Cmd.none];
    case "attach_reference":
      if (requestControlsDisabled(model)) return [model, Cmd.none];
      return [{ ...model, secondReferenceAttached: true }, Cmd.none];
    case "remove_first_reference":
      if (requestControlsDisabled(model)) return [model, Cmd.none];
      return [{ ...model, firstReferenceAttached: false }, Cmd.none];
    case "remove_second_reference":
      if (requestControlsDisabled(model)) return [model, Cmd.none];
      return [{ ...model, secondReferenceAttached: false }, Cmd.none];
    case "choose_inside":
    case "choose_markdown":
      return [{ ...model, storageChosen: true }, Cmd.none];
    case "choose_url":
    case "choose_text":
      return [{ ...model, importChosen: true }, Cmd.none];
    case "continue_clarification":
      if (clarificationIncomplete(model)) return [model, Cmd.none];
      return [{ ...model, globalBusy: true }, Cmd.none];
    case "cancel_attempt":
      return [{ ...model, globalBusy: false, attemptInterrupted: true }, Cmd.none];
    case "retry_attempt":
      if (model.globalBusy) return [model, Cmd.none];
      return [{ ...model, globalBusy: true, attemptInterrupted: false }, Cmd.none];
    case "launch":
      if (!canLaunch(model)) return [model, Cmd.none];
      return [{ ...model, launched: true }, Cmd.none];
    case "new_utility":
      if (model.globalBusy) return [model, Cmd.none];
      return [model, Cmd.none];
  }
}
