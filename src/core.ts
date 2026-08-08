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
  | { readonly kind: "registry_error"; readonly bytes: Uint8Array };

export const envMsgs = [
  { env: "REPLICATOR_NODE_PATH", msg: "node_path" },
  { env: "REPLICATOR_WORKER_PATH", msg: "worker_path" },
  { env: "REPLICATOR_DATA_ROOT", msg: "data_root" },
  { env: "REPLICATOR_REFERENCE_JSON", msg: "reference_json" },
] as const;

export const viewUnbound = ["launched", "attemptId", "sourceDigest", "binaryDigest", "nodePath", "workerPath", "dataRoot", "referenceJson", "worker_line", "worker_exit", "worker_error", "launch_exit", "launch_error", "node_path", "worker_path", "data_root", "reference_json", "registry_loaded", "registry_error"] as const;

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
  return !model.storageChosen || !model.importChosen;
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
    ? asciiBytes("{\"type\":\"start_attempt\",\"utilityId\":\"focus-sprint\",\"requestId\":\"revision-1\",\"kind\":\"revision\",\"requestText\":")
    : asciiBytes("{\"type\":\"start_attempt\",\"utilityId\":\"focus-sprint\",\"requestId\":\"build-1\",\"kind\":\"build\",\"requestText\":");
  const middle = asciiBytes(",\"references\":"); const references = model.referenceJson.length > 0 ? model.referenceJson : asciiBytes("[]");
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
  const out = new Uint8Array(prefix.length + quoted.length + middle.length + references.length + suffix.length + sourceDigest.length + artifactPrefix.length + artifactPath.length + artifactSource.length + sourceDigest.length + artifactBinary.length + binaryDigest.length + ending.length); let at = 0;
  out.set(prefix, at); at += prefix.length;
  out.set(quoted, at); at += quoted.length;
  out.set(middle, at); at += middle.length;
  out.set(references, at); at += references.length;
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
  if (bytesEqual(type, asciiBytes("clarification_required"))) return { ...model, utilityState: "awaiting_clarification", clarificationQuestion: extractString(line, asciiBytes("\"question\":\"")) };
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
    case "revision_edit":
      if (requestControlsDisabled(model)) return [model, Cmd.none];
      return [{ ...model, revisionDraft: editDraft(model.revisionDraft, msg.edit) }, Cmd.none];
    case "send_revision":
      if (requestControlsDisabled(model) || trimBytes(model.revisionDraft.bytes).length === 0 || model.nodePath.length === 0 || model.workerPath.length === 0 || model.dataRoot.length === 0 || (model.readyArtifactPath.length > 0 && (model.sourceDigest.length === 0 || model.binaryDigest.length === 0))) return [model, Cmd.none];
      return [{ ...model, globalBusy: true, utilityState: "planning", revisionSubmitted: true, submittedKind: model.readyArtifactPath.length > 0 ? "revision" : "build", submittedRevision: trimBytes(model.revisionDraft.bytes), revisionDraft: emptyDraft(), attemptInterrupted: false, ownerError: new Uint8Array(0), clarificationQuestion: new Uint8Array(0), stageResult: asciiBytes("Starting the Request Attempt...") }, Cmd.spawn([model.nodePath, model.workerPath], { key: "request-worker", stdin: startAttempt(model, trimBytes(model.revisionDraft.bytes)), line: "worker_line", exit: "worker_exit", err: "worker_error" })];
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
      if (!model.globalBusy) return [model, Cmd.none];
      return [{ ...model, stageResult: asciiBytes("Cancelling this Request Attempt...") }, Cmd.cancel("request-worker")];
    case "retry_attempt":
      if (model.globalBusy) return [model, Cmd.none];
      if (model.submittedRevision.length === 0 || model.nodePath.length === 0 || model.workerPath.length === 0) return [model, Cmd.none];
      return [{ ...model, globalBusy: true, utilityState: "planning", attemptInterrupted: false, ownerError: new Uint8Array(0) }, Cmd.spawn([model.nodePath, model.workerPath], { key: "request-worker", stdin: startAttempt(model, model.submittedRevision), line: "worker_line", exit: "worker_exit", err: "worker_error" })];
    case "launch":
      if (!canLaunch(model)) return [model, Cmd.none];
      return [{ ...model, launched: true }, Cmd.spawn([asciiBytes("/usr/bin/open"), joinPath(model.dataRoot, model.readyArtifactPath)], { key: "launch-artifact", exit: "launch_exit", err: "launch_error" })];
    case "new_utility": {
      if (model.globalBusy) return [model, Cmd.none];
      const fresh = initialModel();
      return [{ ...fresh, nodePath: model.nodePath, workerPath: model.workerPath, dataRoot: model.dataRoot, referenceJson: model.referenceJson }, Cmd.none];
    }
    case "worker_line":
      return [consumeWorkerEvent(model, msg.bytes), Cmd.none];
    case "worker_exit":
      if (!model.globalBusy) return [model, Cmd.none];
      return [{ ...model, globalBusy: false, utilityState: "failed", ownerError: asciiBytes("The worker ended before the Utility became ready.") }, Cmd.none];
    case "worker_error":
      if (bytesEqual(msg.bytes, asciiBytes("cancelled"))) return [{ ...model, globalBusy: false, utilityState: "interrupted", attemptInterrupted: true, ownerError: asciiBytes("The Request Attempt was cancelled. Saved work remains available for retry.") }, Cmd.none];
      return [{ ...model, globalBusy: false, utilityState: "failed", ownerError: asciiBytes("The Request Attempt could not continue. Your request and previous Ready Artifact are safe.") }, Cmd.none];
    case "launch_exit":
    case "launch_error":
      return [model, Cmd.none];
    case "node_path": return [{ ...model, nodePath: msg.bytes }, Cmd.none];
    case "worker_path": return [{ ...model, workerPath: msg.bytes }, Cmd.none];
    case "data_root": return [{ ...model, dataRoot: msg.bytes }, Cmd.readFile(joinPath(msg.bytes, asciiBytes("registry.json")), { key: "registry", ok: "registry_loaded", err: "registry_error" })];
    case "reference_json": return [{ ...model, referenceJson: msg.bytes, firstReferenceAttached: msg.bytes.length > 0 }, Cmd.none];
    case "registry_loaded": return [consumeRegistry(model, msg.bytes), Cmd.none];
    case "registry_error": return [model, Cmd.none];
  }
}
