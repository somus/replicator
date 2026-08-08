import { Cmd, asciiBytes } from "@native-sdk/core";
import { applyTextInputEvent, type TextEditState, type TextInputEvent } from "@native-sdk/core/text";

export interface Draft {
  readonly bytes: Uint8Array;
  readonly anchor: number;
  readonly focus: number;
  readonly compStart: number;
  readonly compEnd: number;
}

export type UtilityState = "planning" | "awaiting_clarification" | "building" | "verifying" | "preparing" | "ready" | "failed" | "interrupted";
export type RequestKind = "build" | "revision";

export interface LibraryItem {
  readonly utilityId: Uint8Array;
  readonly displayName: Uint8Array;
  readonly format: Uint8Array;
  readonly state: Uint8Array;
  readonly updatedAt: Uint8Array;
  readonly artifactPath: Uint8Array;
  readonly sourceDigest: Uint8Array;
  readonly binaryDigest: Uint8Array;
}

export interface TimelineItem {
  readonly utilityId: Uint8Array;
  readonly entryId: Uint8Array;
  readonly kind: Uint8Array;
  readonly createdAt: Uint8Array;
  readonly text: Uint8Array;
}

export interface Model {
  readonly brandImageId: number;
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
  readonly utilityState: UtilityState;
  readonly attemptId: Uint8Array;
  readonly acceptedPlan: Uint8Array;
  readonly stageResult: Uint8Array;
  readonly verificationEvidence: Uint8Array;
  readonly readyArtifactPath: Uint8Array;
  readonly sourceDigest: Uint8Array;
  readonly binaryDigest: Uint8Array;
  readonly ownerError: Uint8Array;
  readonly clarificationQuestion: Uint8Array;
  readonly nodePath: Uint8Array;
  readonly workerPath: Uint8Array;
  readonly dataRoot: Uint8Array;
  readonly referenceJson: Uint8Array;
  readonly pendingWorkerCommand: Uint8Array;
  readonly pendingWorkerInvocation: boolean;
  readonly clarificationBatchId: Uint8Array;
  readonly clarificationQuestionId: Uint8Array;
  readonly clarificationQuestionIds: readonly Uint8Array[];
  readonly clarificationQuestions: readonly Uint8Array[];
  readonly clarificationAnswers: readonly Draft[];
  readonly libraryItems: readonly LibraryItem[];
  readonly timelineItems: readonly TimelineItem[];
  readonly selectedUtilityId: Uint8Array;
  readonly nextLibraryCursor: Uint8Array;
  readonly nextTimelineCursor: Uint8Array;
  readonly pickerPath: Uint8Array;
  readonly pickerSelection: Uint8Array;
  readonly pickerActive: boolean;
  readonly pickerSelections: readonly Uint8Array[];
  readonly submittedKind: RequestKind;
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
  | { readonly kind: "retry_attempt" }
  | { readonly kind: "worker_line"; readonly bytes: Uint8Array }
  | { readonly kind: "worker_exit"; readonly code: number }
  | { readonly kind: "worker_error"; readonly bytes: Uint8Array }
  | { readonly kind: "launch_exit"; readonly code: number }
  | { readonly kind: "launch_error"; readonly bytes: Uint8Array }
  | { readonly kind: "node_path"; readonly bytes: Uint8Array }
  | { readonly kind: "worker_path"; readonly bytes: Uint8Array }
  | { readonly kind: "data_root"; readonly bytes: Uint8Array }
  | { readonly kind: "reference_json"; readonly bytes: Uint8Array }
  | { readonly kind: "registry_loaded"; readonly bytes: Uint8Array }
  | { readonly kind: "registry_error"; readonly bytes: Uint8Array }
  | { readonly kind: "command_written" }
  | { readonly kind: "command_write_error"; readonly bytes: Uint8Array }
  | { readonly kind: "select_library"; readonly slot: number }
  | { readonly kind: "clarification_answer_0"; readonly edit: TextInputEvent }
  | { readonly kind: "clarification_answer_1"; readonly edit: TextInputEvent }
  | { readonly kind: "clarification_answer_2"; readonly edit: TextInputEvent }
  | { readonly kind: "clarification_answer_3"; readonly edit: TextInputEvent }
  | { readonly kind: "clarification_answer_4"; readonly edit: TextInputEvent }
  | { readonly kind: "clarification_answer_5"; readonly edit: TextInputEvent }
  | { readonly kind: "picker_path"; readonly bytes: Uint8Array }
  | { readonly kind: "picker_line"; readonly bytes: Uint8Array }
  | { readonly kind: "picker_exit"; readonly code: number }
  | { readonly kind: "picker_error"; readonly bytes: Uint8Array }
  | { readonly kind: "quit_app" };

export const envMsgs = [
  { env: "REPLICATOR_NODE_PATH", msg: "node_path" },
  { env: "REPLICATOR_WORKER_PATH", msg: "worker_path" },
  { env: "REPLICATOR_DATA_ROOT", msg: "data_root" },
  { env: "REPLICATOR_REFERENCE_JSON", msg: "reference_json" },
  { env: "REPLICATOR_PICKER_PATH", msg: "picker_path" },
] as const;

export function commandMsg(name: string): Msg | null {
  if (name === "app.new-utility") return { kind: "new_utility" };
  if (name === "app.quit") return { kind: "quit_app" };
  return null;
}

export const viewUnbound = ["selectedUtility", "storageChosen", "importChosen", "attemptInterrupted", "launched", "utilityState", "attemptId", "readyArtifactPath", "sourceDigest", "binaryDigest", "nodePath", "workerPath", "dataRoot", "referenceJson", "submittedKind", "pendingWorkerCommand", "pendingWorkerInvocation", "clarificationBatchId", "clarificationQuestionId", "recipeSelected", "renamerSelected", "tallySelected", "planningState", "awaitingClarificationState", "buildingState", "verifyingState", "preparingState", "failedState", "interruptedState", "clarificationIncomplete", "revisionDraft", "select_recipe", "select_renamer", "select_tally", "choose_inside", "choose_markdown", "choose_url", "choose_text", "worker_line", "worker_exit", "worker_error", "launch_exit", "launch_error", "node_path", "worker_path", "data_root", "reference_json", "registry_loaded", "registry_error", "command_written", "command_write_error", "quit_app"] as const;

export function initialModel(): Model {
  return {
    brandImageId: 1,
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
    utilityState: "planning",
    attemptId: new Uint8Array(0),
    acceptedPlan: new Uint8Array(0),
    stageResult: new Uint8Array(0),
    verificationEvidence: new Uint8Array(0),
    readyArtifactPath: new Uint8Array(0),
    sourceDigest: new Uint8Array(0),
    binaryDigest: new Uint8Array(0),
    ownerError: new Uint8Array(0),
    clarificationQuestion: new Uint8Array(0),
    nodePath: new Uint8Array(0),
    workerPath: new Uint8Array(0),
    dataRoot: new Uint8Array(0),
    referenceJson: new Uint8Array(0),
    pendingWorkerCommand: new Uint8Array(0),
    pendingWorkerInvocation: false,
    clarificationBatchId: new Uint8Array(0),
    clarificationQuestionId: new Uint8Array(0),
    clarificationQuestionIds: [new Uint8Array(0), new Uint8Array(0), new Uint8Array(0), new Uint8Array(0), new Uint8Array(0), new Uint8Array(0)],
    clarificationQuestions: [new Uint8Array(0), new Uint8Array(0), new Uint8Array(0), new Uint8Array(0), new Uint8Array(0), new Uint8Array(0)],
    clarificationAnswers: [emptyDraft(), emptyDraft(), emptyDraft(), emptyDraft(), emptyDraft(), emptyDraft()],
    libraryItems: [],
    timelineItems: [],
    selectedUtilityId: asciiBytes("focus-sprint"),
    nextLibraryCursor: new Uint8Array(0),
    nextTimelineCursor: new Uint8Array(0),
    pickerPath: new Uint8Array(0),
    pickerSelection: new Uint8Array(0),
    pickerActive: false,
    pickerSelections: [],
    submittedKind: "build",
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
  if (model.utilityState === "awaiting_clarification") return asciiBytes("Needs input");
  if (model.utilityState === "failed") return asciiBytes("Needs attention");
  if (model.utilityState === "interrupted") return asciiBytes("Interrupted");
  if (model.utilityState === "ready") return asciiBytes("Ready");
  if (model.utilityState === "preparing") return asciiBytes("Preparing");
  if (model.utilityState === "verifying") return asciiBytes("Verifying");
  if (model.utilityState === "building") return asciiBytes("Building");
  return asciiBytes("Planning");
}

export function canLaunch(model: Model): boolean {
  return model.readyArtifactPath.length > 0;
}

export function requestControlsDisabled(model: Model): boolean {
  return model.globalBusy;
}

export function composerPlaceholder(model: Model): Uint8Array {
  if (model.globalBusy) return asciiBytes("Another request is active. You can browse and launch Ready Utilities.");
  if (model.nodePath.length === 0 || model.workerPath.length === 0 || model.dataRoot.length === 0) return asciiBytes("The bundled worker is unavailable in this launch.");
  return asciiBytes("Describe a change to this Utility...");
}

export function planningState(model: Model): boolean { return model.utilityState === "planning"; }
export function awaitingClarificationState(model: Model): boolean { return model.utilityState === "awaiting_clarification"; }
export function buildingState(model: Model): boolean { return model.utilityState === "building"; }
export function verifyingState(model: Model): boolean { return model.utilityState === "verifying"; }
export function preparingState(model: Model): boolean { return model.utilityState === "preparing"; }
export function failedState(model: Model): boolean { return model.utilityState === "failed"; }
export function interruptedState(model: Model): boolean { return model.utilityState === "interrupted"; }
export function hasPlan(model: Model): boolean { return model.acceptedPlan.length > 0; }
export function hasStageResult(model: Model): boolean { return model.stageResult.length > 0; }
export function hasEvidence(model: Model): boolean { return model.verificationEvidence.length > 0; }
export function hasOwnerError(model: Model): boolean { return model.ownerError.length > 0; }
export function hasClarification(model: Model): boolean { return model.clarificationQuestion.length > 0; }
export function retryDisabled(model: Model): boolean { return model.globalBusy || (!failedState(model) && !interruptedState(model)); }

export function clarificationIncomplete(model: Model): boolean {
  for (let index = 0; index < 6; index += 1) if (model.clarificationQuestionIds[index].length > 0 && trimBytes(model.clarificationAnswers[index].bytes).length === 0) return true;
  return false;
}

export function revisionText(model: Model): Uint8Array {
  return model.revisionDraft.bytes;
}

export function requestTitle(model: Model): Uint8Array { return model.readyArtifactPath.length > 0 ? asciiBytes("Revision Request") : asciiBytes("Build Request"); }
export function submittedTitle(model: Model): Uint8Array { return model.submittedKind === "revision" ? asciiBytes("Revision Request") : asciiBytes("Build Request"); }

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

function joinPath(root: Uint8Array, relative: Uint8Array): Uint8Array {
  const out = new Uint8Array(root.length + relative.length + 1); out.set(root, 0); out[root.length] = 47; out.set(relative, root.length + 1); return out;
}

const commandFileRelative = asciiBytes("commands/ui-command.json");
const nodeEnvFileArg = asciiBytes("--env-file-if-exists=.env");

function loadRegistryCommand(): Uint8Array {
  return asciiBytes("{\"type\":\"load_registry\",\"libraryLimit\":50,\"timelineLimit\":50}\n");
}

function answerClarificationCommand(model: Model): Uint8Array {
  const prefix = asciiBytes("{\"type\":\"answer_clarification\",\"attemptId\":");
  const batch = asciiBytes(",\"batchId\":");
  const answers = asciiBytes(",\"answers\":{");
  const attemptId = quoteJson(model.attemptId);
  const batchId = quoteJson(model.clarificationBatchId);
  let size = prefix.length + attemptId.length + batch.length + batchId.length + answers.length + 3;
  for (let index = 0; index < 6; index += 1) if (model.clarificationQuestionIds[index].length > 0) size += quoteJson(model.clarificationQuestionIds[index]).length + quoteJson(model.clarificationAnswers[index].bytes).length + 2;
  const out = new Uint8Array(size); let at = 0; let count = 0;
  out.set(prefix, at); at += prefix.length; out.set(attemptId, at); at += attemptId.length; out.set(batch, at); at += batch.length; out.set(batchId, at); at += batchId.length; out.set(answers, at); at += answers.length;
  for (let index = 0; index < 6; index += 1) {
    if (model.clarificationQuestionIds[index].length === 0) continue;
    if (count > 0) { out[at] = 44; at += 1; }
    const id = quoteJson(model.clarificationQuestionIds[index]); const answer = quoteJson(model.clarificationAnswers[index].bytes);
    out.set(id, at); at += id.length; out[at] = 58; at += 1; out.set(answer, at); at += answer.length; count += 1;
  }
  out[at] = 125; at += 1; out[at] = 125; at += 1; out[at] = 10;
  return out;
}

function extractNthString(line: Uint8Array, key: Uint8Array, occurrence: number): Uint8Array {
  let start = 0;
  for (let index = 0; index <= occurrence; index += 1) {
    const relative = findBytes(line.slice(start), key); if (relative < 0) return new Uint8Array(0); start += relative + key.length;
  }
  const out = new Uint8Array(line.length - start); let at = start; let count = 0; let escaped = false;
  while (at < line.length) { const byte = line[at]; at += 1; if (escaped) { out[count] = byte; count += 1; escaped = false; } else if (byte === 92) escaped = true; else if (byte === 34) break; else { out[count] = byte; count += 1; } }
  return out.slice(0, count);
}

function replaceAnswer(model: Model, index: number, edit: TextInputEvent): Model {
  const next = model.clarificationAnswers.slice(); next[index] = editDraft(next[index], edit); return { ...model, clarificationAnswers: next };
}

export function clarificationAnswer0(model: Model): Uint8Array { return model.clarificationAnswers[0].bytes; }
export function clarificationAnswer1(model: Model): Uint8Array { return model.clarificationAnswers[1].bytes; }
export function clarificationAnswer2(model: Model): Uint8Array { return model.clarificationAnswers[2].bytes; }
export function clarificationAnswer3(model: Model): Uint8Array { return model.clarificationAnswers[3].bytes; }
export function clarificationAnswer4(model: Model): Uint8Array { return model.clarificationAnswers[4].bytes; }
export function clarificationAnswer5(model: Model): Uint8Array { return model.clarificationAnswers[5].bytes; }
export function clarificationQuestion0(model: Model): Uint8Array { return model.clarificationQuestions[0]; }
export function clarificationQuestion1(model: Model): Uint8Array { return model.clarificationQuestions[1]; }
export function clarificationQuestion2(model: Model): Uint8Array { return model.clarificationQuestions[2]; }
export function clarificationQuestion3(model: Model): Uint8Array { return model.clarificationQuestions[3]; }
export function clarificationQuestion4(model: Model): Uint8Array { return model.clarificationQuestions[4]; }
export function clarificationQuestion5(model: Model): Uint8Array { return model.clarificationQuestions[5]; }
export function hasClarificationQuestion0(model: Model): boolean { return model.clarificationQuestionIds[0].length > 0; }
export function hasClarificationQuestion1(model: Model): boolean { return model.clarificationQuestionIds[1].length > 0; }
export function hasClarificationQuestion2(model: Model): boolean { return model.clarificationQuestionIds[2].length > 0; }
export function hasClarificationQuestion3(model: Model): boolean { return model.clarificationQuestionIds[3].length > 0; }
export function hasClarificationQuestion4(model: Model): boolean { return model.clarificationQuestionIds[4].length > 0; }
export function hasClarificationQuestion5(model: Model): boolean { return model.clarificationQuestionIds[5].length > 0; }

function quoteJson(value: Uint8Array): Uint8Array {
  let extra = 2;
  for (let i = 0; i < value.length; i += 1) { const b = value[i]; if (b === 34 || b === 92 || b === 10 || b === 13 || b === 9) extra += 1; }
  const out = new Uint8Array(value.length + extra); let at = 0; out[at] = 34; at += 1;
  for (let i = 0; i < value.length; i += 1) {
    const b = value[i];
    if (b === 34 || b === 92) { out[at] = 92; out[at + 1] = b; at += 2; }
    else if (b === 10 || b === 13 || b === 9) { out[at] = 92; out[at + 1] = b === 10 ? 110 : b === 13 ? 114 : 116; at += 2; }
    else { out[at] = b < 32 ? 32 : b; at += 1; }
  }
  out[at] = 34; return out;
}

function startAttempt(model: Model, request: Uint8Array): Uint8Array {
  const revision = model.readyArtifactPath.length > 0;
  const prefix = revision
    ? asciiBytes("{\"type\":\"start_attempt\",\"utilityId\":")
    : asciiBytes("{\"type\":\"start_attempt\",\"utilityId\":");
  const utilityId = quoteJson(model.selectedUtilityId);
  const requestId = revision ? asciiBytes(",\"requestId\":\"revision-1\",\"kind\":\"revision\",\"requestText\":") : asciiBytes(",\"requestId\":\"build-1\",\"kind\":\"build\",\"requestText\":");
  const middle = asciiBytes(",\"references\":"); const references = model.referenceJson.length > 0 ? model.referenceJson : asciiBytes("[]");
  let referencePathsSize = asciiBytes(",\"referencePaths\":[]").length;
  for (let index = 0; index < model.pickerSelections.length; index += 1) referencePathsSize += quoteJson(model.pickerSelections[index]).length + 1;
  const suffix = revision
    ? asciiBytes(",\"currentSourceDigest\":")
    : asciiBytes("}\n");
  const sourceDigest = revision ? quoteJson(model.sourceDigest) : new Uint8Array(0);
  const artifactPrefix = revision ? asciiBytes(",\"readyArtifact\":{\"path\":") : new Uint8Array(0);
  const artifactPath = revision ? quoteJson(model.readyArtifactPath) : new Uint8Array(0);
  const artifactSource = revision ? asciiBytes(",\"sourceDigest\":") : new Uint8Array(0);
  const artifactBinary = revision ? asciiBytes(",\"binaryDigest\":") : new Uint8Array(0);
  const binaryDigest = revision ? quoteJson(model.binaryDigest) : new Uint8Array(0);
  const ending = revision ? asciiBytes("}}\n") : new Uint8Array(0);
  const quoted = quoteJson(request);
  const out = new Uint8Array(prefix.length + utilityId.length + requestId.length + quoted.length + middle.length + references.length + referencePathsSize + suffix.length + sourceDigest.length + artifactPrefix.length + artifactPath.length + artifactSource.length + sourceDigest.length + artifactBinary.length + binaryDigest.length + ending.length); let at = 0;
  out.set(prefix, at); at += prefix.length;
  out.set(utilityId, at); at += utilityId.length;
  out.set(requestId, at); at += requestId.length;
  out.set(quoted, at); at += quoted.length;
  out.set(middle, at); at += middle.length;
  out.set(references, at); at += references.length;
  const pathPrefix = asciiBytes(",\"referencePaths\":["); out.set(pathPrefix, at); at += pathPrefix.length;
  for (let index = 0; index < model.pickerSelections.length; index += 1) { if (index > 0) { out[at] = 44; at += 1; } const path = quoteJson(model.pickerSelections[index]); out.set(path, at); at += path.length; }
  out[at] = 93; at += 1;
  out.set(suffix, at); at += suffix.length;
  out.set(sourceDigest, at); at += sourceDigest.length;
  out.set(artifactPrefix, at); at += artifactPrefix.length;
  out.set(artifactPath, at); at += artifactPath.length;
  out.set(artifactSource, at); at += artifactSource.length;
  out.set(sourceDigest, at); at += sourceDigest.length;
  out.set(artifactBinary, at); at += artifactBinary.length;
  out.set(binaryDigest, at); at += binaryDigest.length;
  out.set(ending, at);
  return out;
}

function consumeRegistry(model: Model, bytes: Uint8Array): Model {
  const readyPath = extractString(bytes, asciiBytes("\"readyArtifact\":{\"path\":\""));
  const plan = extractString(bytes, asciiBytes("\"acceptedPlan\":{\"summary\":\""));
  return {
    ...model,
    utilityState: stateFromEvent(bytes, readyPath.length > 0 ? "ready" : model.utilityState),
    acceptedPlan: plan,
    readyArtifactPath: readyPath,
    sourceDigest: extractString(bytes, asciiBytes("\"sourceDigest\":\"")),
    binaryDigest: extractString(bytes, asciiBytes("\"binaryDigest\":\"")),
    verificationEvidence: readyPath.length > 0 ? asciiBytes("Behavior verification evidence is retained for this Ready Artifact.") : model.verificationEvidence,
  };
}

function extractString(line: Uint8Array, key: Uint8Array): Uint8Array {
  const found = findBytes(line, key); if (found < 0) return new Uint8Array(0); let at = found + key.length; const out = new Uint8Array(line.length - at); let n = 0; let escaped = false;
  while (at < line.length) { const b = line[at]; at += 1; if (escaped) { out[n] = b === 110 ? 10 : b === 114 ? 13 : b === 116 ? 9 : b; n += 1; escaped = false; } else if (b === 92) escaped = true; else if (b === 34) break; else { out[n] = b; n += 1; } }
  return out.slice(0, n);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function findBytes(haystack: Uint8Array, needle: Uint8Array): number {
  if (needle.length === 0) return 0;
  for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    let same = true;
    for (let j = 0; j < needle.length; j += 1) if (haystack[i + j] !== needle[j]) same = false;
    if (same) return i;
  }
  return -1;
}

function trimBytes(bytes: Uint8Array): Uint8Array {
  let start = 0; let end = bytes.length;
  while (start < end && (bytes[start] === 32 || bytes[start] === 9 || bytes[start] === 10 || bytes[start] === 13)) start += 1;
  while (end > start && (bytes[end - 1] === 32 || bytes[end - 1] === 9 || bytes[end - 1] === 10 || bytes[end - 1] === 13)) end -= 1;
  return bytes.slice(start, end);
}

function stateFromEvent(line: Uint8Array, previous: UtilityState): UtilityState {
  if (findBytes(line, asciiBytes("\"state\":\"planning\"")) >= 0) return "planning";
  if (findBytes(line, asciiBytes("\"state\":\"awaiting_clarification\"")) >= 0) return "awaiting_clarification";
  if (findBytes(line, asciiBytes("\"state\":\"building\"")) >= 0) return "building";
  if (findBytes(line, asciiBytes("\"state\":\"verifying\"")) >= 0) return "verifying";
  if (findBytes(line, asciiBytes("\"state\":\"preparing\"")) >= 0) return "preparing";
  if (findBytes(line, asciiBytes("\"state\":\"ready\"")) >= 0) return "ready";
  if (findBytes(line, asciiBytes("\"state\":\"failed\"")) >= 0) return "failed";
  if (findBytes(line, asciiBytes("\"state\":\"interrupted\"")) >= 0) return "interrupted";
  return previous;
}

function consumeWorkerEvent(model: Model, line: Uint8Array): Model {
  const type = extractString(line, asciiBytes("\"type\":\""));
  if (bytesEqual(type, asciiBytes("state_changed"))) return { ...model, utilityState: stateFromEvent(line, model.utilityState), attemptId: extractString(line, asciiBytes("\"attemptId\":\"")) };
  if (bytesEqual(type, asciiBytes("clarification_required"))) {
    const ids: Uint8Array[] = []; const questions: Uint8Array[] = [];
    for (let index = 0; index < 6; index += 1) { ids[index] = extractNthString(line, asciiBytes("\"id\":\""), index); questions[index] = extractNthString(line, asciiBytes("\"question\":\""), index); }
    return { ...model, globalBusy: false, utilityState: "awaiting_clarification", clarificationBatchId: extractString(line, asciiBytes("\"batchId\":\"")), clarificationQuestionId: ids[0], clarificationQuestion: questions[0], clarificationQuestionIds: ids, clarificationQuestions: questions, clarificationAnswers: [emptyDraft(), emptyDraft(), emptyDraft(), emptyDraft(), emptyDraft(), emptyDraft()] };
  }
  if (bytesEqual(type, asciiBytes("library_item"))) {
    if (model.libraryItems.length >= 50) return model;
    const item: LibraryItem = { utilityId: extractString(line, asciiBytes("\"utilityId\":\"")), displayName: extractString(line, asciiBytes("\"displayName\":\"")), format: extractString(line, asciiBytes("\"format\":\"")), state: extractString(line, asciiBytes("\"state\":\"")), updatedAt: extractString(line, asciiBytes("\"updatedAt\":\"")), artifactPath: extractString(line, asciiBytes("\"artifactPath\":\"")), sourceDigest: extractString(line, asciiBytes("\"sourceDigest\":\"")), binaryDigest: extractString(line, asciiBytes("\"binaryDigest\":\"")) };
    return { ...model, libraryItems: [...model.libraryItems, item] };
  }
  if (bytesEqual(type, asciiBytes("timeline_item"))) {
    if (model.timelineItems.length >= 50) return model;
    const item: TimelineItem = { utilityId: extractString(line, asciiBytes("\"utilityId\":\"")), entryId: extractString(line, asciiBytes("\"entryId\":\"")), kind: extractString(line, asciiBytes("\"kind\":\"")), createdAt: extractString(line, asciiBytes("\"createdAt\":\"")), text: extractString(line, asciiBytes("\"text\":\"")) };
    return { ...model, timelineItems: [...model.timelineItems, item] };
  }
  if (bytesEqual(type, asciiBytes("registry_loaded"))) return { ...model, selectedUtilityId: extractString(line, asciiBytes("\"selectedUtilityId\":\"")), nextLibraryCursor: extractString(line, asciiBytes("\"nextLibraryCursor\":\"")), nextTimelineCursor: extractString(line, asciiBytes("\"nextTimelineCursor\":\"")) };
  if (bytesEqual(type, asciiBytes("plan_accepted"))) return { ...model, utilityState: "building", acceptedPlan: extractString(line, asciiBytes("\"summary\":\"")) };
  if (bytesEqual(type, asciiBytes("stage_result"))) {
    const summary = extractString(line, asciiBytes("\"summary\":\""));
    if (findBytes(line, asciiBytes("\"stage\":\"verification\"")) >= 0) return { ...model, utilityState: "verifying", verificationEvidence: summary };
    if (findBytes(line, asciiBytes("\"stage\":\"packaging\"")) >= 0 || findBytes(line, asciiBytes("\"stage\":\"launch\"")) >= 0) return { ...model, utilityState: "preparing", stageResult: summary };
    return { ...model, stageResult: summary };
  }
  if (bytesEqual(type, asciiBytes("artifact_ready"))) return { ...model, globalBusy: false, utilityState: "ready", readyArtifactPath: extractString(line, asciiBytes("\"path\":\"")), sourceDigest: extractString(line, asciiBytes("\"sourceDigest\":\"")), binaryDigest: extractString(line, asciiBytes("\"binaryDigest\":\"")), verificationEvidence: asciiBytes("Behavior Contract passed and evidence matches the verified source."), ownerError: new Uint8Array(0) };
  if (bytesEqual(type, asciiBytes("attempt_failed"))) return { ...model, globalBusy: false, utilityState: "failed", ownerError: extractString(line, asciiBytes("\"reason\":\"")) };
  if (bytesEqual(type, asciiBytes("attempt_interrupted"))) return { ...model, globalBusy: false, utilityState: "interrupted", attemptInterrupted: true, ownerError: extractString(line, asciiBytes("\"reason\":\"")) };
  return model;
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
    case "select_library": {
      const item = model.libraryItems[msg.slot];
      if (!item) return [model, Cmd.none];
      return [{ ...model, selectedUtilityId: item.utilityId, readyArtifactPath: item.artifactPath, sourceDigest: item.sourceDigest, binaryDigest: item.binaryDigest, utilityState: bytesEqual(item.state, asciiBytes("ready")) ? "ready" : model.utilityState }, Cmd.none];
    }
    case "revision_edit":
      if (requestControlsDisabled(model)) return [model, Cmd.none];
      return [{ ...model, revisionDraft: editDraft(model.revisionDraft, msg.edit) }, Cmd.none];
    case "send_revision":
      if (requestControlsDisabled(model) || trimBytes(model.revisionDraft.bytes).length === 0 || model.nodePath.length === 0 || model.workerPath.length === 0 || model.dataRoot.length === 0 || (model.readyArtifactPath.length > 0 && (model.sourceDigest.length === 0 || model.binaryDigest.length === 0))) return [model, Cmd.none];
      return [{ ...model, globalBusy: true, utilityState: "planning", revisionSubmitted: true, submittedKind: model.readyArtifactPath.length > 0 ? "revision" : "build", submittedRevision: trimBytes(model.revisionDraft.bytes), revisionDraft: emptyDraft(), attemptInterrupted: false, ownerError: new Uint8Array(0), clarificationQuestion: new Uint8Array(0), pendingWorkerInvocation: true, pendingWorkerCommand: startAttempt(model, trimBytes(model.revisionDraft.bytes)), stageResult: asciiBytes("Starting the Request Attempt...") }, Cmd.writeFile(joinPath(model.dataRoot, commandFileRelative), startAttempt(model, trimBytes(model.revisionDraft.bytes)), { key: "worker-command", ok: "command_written", err: "command_write_error" })];
    case "attach_reference":
      if (requestControlsDisabled(model) || model.pickerPath.length === 0) return [model, Cmd.none];
      return [{ ...model, pickerActive: true }, Cmd.spawn([model.pickerPath], { key: "reference-picker", line: "picker_line", exit: "picker_exit", err: "picker_error" })];
    case "remove_first_reference":
      if (requestControlsDisabled(model)) return [model, Cmd.none];
      return [{ ...model, firstReferenceAttached: false, pickerSelection: new Uint8Array(0), pickerSelections: [] }, Cmd.none];
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
      if (clarificationIncomplete(model) || model.attemptId.length === 0 || model.clarificationBatchId.length === 0 || model.clarificationQuestionId.length === 0) return [model, Cmd.none];
      return [{ ...model, globalBusy: true, pendingWorkerInvocation: true, pendingWorkerCommand: answerClarificationCommand(model), stageResult: asciiBytes("Resuming this Request Attempt...") }, Cmd.writeFile(joinPath(model.dataRoot, commandFileRelative), answerClarificationCommand(model), { key: "worker-command", ok: "command_written", err: "command_write_error" })];
    case "clarification_answer_0": return [replaceAnswer(model, 0, msg.edit), Cmd.none];
    case "clarification_answer_1": return [replaceAnswer(model, 1, msg.edit), Cmd.none];
    case "clarification_answer_2": return [replaceAnswer(model, 2, msg.edit), Cmd.none];
    case "clarification_answer_3": return [replaceAnswer(model, 3, msg.edit), Cmd.none];
    case "clarification_answer_4": return [replaceAnswer(model, 4, msg.edit), Cmd.none];
    case "clarification_answer_5": return [replaceAnswer(model, 5, msg.edit), Cmd.none];
    case "cancel_attempt":
      if (model.pickerActive) return [{ ...model, pickerActive: false }, Cmd.cancel("reference-picker")];
      if (model.utilityState === "awaiting_clarification" && model.attemptId.length > 0) {
        const command = new Uint8Array(asciiBytes("{\"type\":\"cancel_attempt\",\"attemptId\":").length + quoteJson(model.attemptId).length + 2); const prefix = asciiBytes("{\"type\":\"cancel_attempt\",\"attemptId\":"); command.set(prefix); command.set(quoteJson(model.attemptId), prefix.length); command[command.length - 2] = 125; command[command.length - 1] = 10;
        return [{ ...model, globalBusy: true, pendingWorkerInvocation: true, pendingWorkerCommand: command, stageResult: asciiBytes("Cancelling this Request Attempt...") }, Cmd.writeFile(joinPath(model.dataRoot, commandFileRelative), command, { key: "worker-command", ok: "command_written", err: "command_write_error" })];
      }
      if (!model.globalBusy) return [model, Cmd.none];
      return [{ ...model, stageResult: asciiBytes("Cancelling this Request Attempt...") }, Cmd.cancel("request-worker")];
    case "retry_attempt":
      if (model.globalBusy) return [model, Cmd.none];
      if (model.submittedRevision.length === 0 || model.nodePath.length === 0 || model.workerPath.length === 0) return [model, Cmd.none];
      return [{ ...model, globalBusy: true, utilityState: "planning", attemptInterrupted: false, ownerError: new Uint8Array(0), pendingWorkerInvocation: true, pendingWorkerCommand: startAttempt(model, model.submittedRevision) }, Cmd.writeFile(joinPath(model.dataRoot, commandFileRelative), startAttempt(model, model.submittedRevision), { key: "worker-command", ok: "command_written", err: "command_write_error" })];
    case "launch":
      if (!canLaunch(model)) return [model, Cmd.none];
      return [{ ...model, launched: true }, Cmd.spawn([asciiBytes("/usr/bin/open"), joinPath(model.dataRoot, model.readyArtifactPath)], { key: "launch-artifact", exit: "launch_exit", err: "launch_error" })];
    case "new_utility": {
      if (model.globalBusy) return [model, Cmd.none];
      const fresh = initialModel();
      return [{ ...fresh, nodePath: model.nodePath, workerPath: model.workerPath, dataRoot: model.dataRoot, referenceJson: model.referenceJson }, Cmd.none];
    }
    case "quit_app": return [model, Cmd.quitApp()];
    case "worker_line":
      return [consumeWorkerEvent(model, msg.bytes), Cmd.none];
    case "picker_line":
      if (bytesEqual(extractString(msg.bytes, asciiBytes("\"type\":\"")), asciiBytes("selected"))) { const path = extractString(msg.bytes, asciiBytes("\"path\":\"")); if (model.pickerSelections.length >= 4) return [model, Cmd.none]; return [{ ...model, firstReferenceAttached: true, pickerSelection: path, pickerSelections: [...model.pickerSelections, path] }, Cmd.none]; }
      if (bytesEqual(extractString(msg.bytes, asciiBytes("\"type\":\"")), asciiBytes("error"))) return [{ ...model, ownerError: extractString(msg.bytes, asciiBytes("\"reason\":\"")) }, Cmd.none];
      return [model, Cmd.none];
    case "picker_exit": return [{ ...model, pickerActive: false }, Cmd.none];
    case "picker_error":
      if (bytesEqual(msg.bytes, asciiBytes("cancelled"))) return [model, Cmd.none];
      return [{ ...model, pickerActive: false, ownerError: asciiBytes("Reference Image selection could not continue.") }, Cmd.none];
    case "worker_exit":
      if (!model.globalBusy) return [model, Cmd.none];
      return [{ ...model, globalBusy: false, utilityState: "failed", ownerError: asciiBytes("The worker ended before the Utility became ready.") }, Cmd.none];
    case "worker_error":
      if (bytesEqual(msg.bytes, asciiBytes("cancelled"))) return [{ ...model, globalBusy: false, utilityState: "interrupted", attemptInterrupted: true, ownerError: asciiBytes("The Request Attempt was cancelled. Saved work remains available for retry.") }, Cmd.none];
      return [{ ...model, globalBusy: false, utilityState: "failed", ownerError: asciiBytes("The Request Attempt could not continue. Your request and previous Ready Artifact are safe.") }, Cmd.none];
    case "launch_exit":
    case "launch_error":
      return [model, Cmd.none];
    case "node_path":
      if (model.workerPath.length === 0 || model.dataRoot.length === 0) return [{ ...model, nodePath: msg.bytes }, Cmd.none];
      return [{ ...model, nodePath: msg.bytes, pendingWorkerInvocation: true, pendingWorkerCommand: loadRegistryCommand() }, Cmd.writeFile(joinPath(model.dataRoot, commandFileRelative), loadRegistryCommand(), { key: "worker-command", ok: "command_written", err: "command_write_error" })];
    case "worker_path":
      if (model.nodePath.length === 0 || model.dataRoot.length === 0) return [{ ...model, workerPath: msg.bytes }, Cmd.none];
      return [{ ...model, workerPath: msg.bytes, pendingWorkerInvocation: true, pendingWorkerCommand: loadRegistryCommand() }, Cmd.writeFile(joinPath(model.dataRoot, commandFileRelative), loadRegistryCommand(), { key: "worker-command", ok: "command_written", err: "command_write_error" })];
    case "data_root":
      if (model.nodePath.length === 0 || model.workerPath.length === 0) return [{ ...model, dataRoot: msg.bytes }, Cmd.none];
      return [{ ...model, dataRoot: msg.bytes, pendingWorkerInvocation: true, pendingWorkerCommand: loadRegistryCommand() }, Cmd.writeFile(joinPath(msg.bytes, commandFileRelative), loadRegistryCommand(), { key: "worker-command", ok: "command_written", err: "command_write_error" })];
    case "reference_json": return [{ ...model, referenceJson: msg.bytes, firstReferenceAttached: msg.bytes.length > 0 }, Cmd.none];
    case "picker_path": return [{ ...model, pickerPath: msg.bytes }, Cmd.none];
    case "registry_loaded": return [consumeRegistry(model, msg.bytes), Cmd.none];
    case "registry_error": return [model, Cmd.none];
    case "command_written":
      if (!model.pendingWorkerInvocation || model.nodePath.length === 0 || model.workerPath.length === 0) return [model, Cmd.none];
      return [{ ...model, pendingWorkerInvocation: false, pendingWorkerCommand: new Uint8Array(0) }, Cmd.spawn([model.nodePath, nodeEnvFileArg, model.workerPath, commandFileRelative], { key: "request-worker", line: "worker_line", exit: "worker_exit", err: "worker_error" })];
    case "command_write_error":
      return [{ ...model, globalBusy: false, pendingWorkerInvocation: false, utilityState: "failed", ownerError: asciiBytes("Replicator could not prepare the worker command. Your prior Ready Artifact is safe.") }, Cmd.none];
  }
}
