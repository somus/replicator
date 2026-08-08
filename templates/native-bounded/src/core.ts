import { Cmd, Sub, asciiBytes } from "@native-sdk/core";

export type Mode = "focus" | "short_break" | "demo";

export interface Model {
  readonly mode: Mode;
  readonly remainingMs: number;
  readonly running: boolean;
  readonly completed: number;
  readonly pickerOpen: boolean;
}

export type Msg =
  | { readonly kind: "start" }
  | { readonly kind: "pause" }
  | { readonly kind: "reset" }
  | { readonly kind: "toggle_picker" }
  | { readonly kind: "close_picker" }
  | { readonly kind: "pick_focus" }
  | { readonly kind: "pick_break" }
  | { readonly kind: "pick_demo" }
  | { readonly kind: "tick"; readonly at: number };

export const viewUnbound = ["remainingMs", "completed", "tick"] as const;

const TICK_STEP_MS = 1000;

function durationForMode(mode: Mode): number {
  if (mode === "focus") return 25 * 60 * 1000;
  if (mode === "short_break") return 5 * 60 * 1000;
  return 10 * 1000;
}

export function initialModel(): Model {
  return {
    mode: "focus",
    remainingMs: durationForMode("focus"),
    running: false,
    completed: 0,
    pickerOpen: false,
  };
}

export function modeLabel(model: Model): Uint8Array {
  if (model.mode === "focus") return asciiBytes("Focus");
  if (model.mode === "short_break") return asciiBytes("Break");
  return asciiBytes("Demo");
}

export function timeDisplay(model: Model): Uint8Array {
  const totalSeconds = Math.floor(model.remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  const mm = minutes < 10 ? `0${minutes}` : `${minutes}`;
  const ss = seconds < 10 ? `0${seconds}` : `${seconds}`;
  return asciiBytes(`${mm}:${ss}`);
}

export function progressFraction(model: Model): number {
  const duration = durationForMode(model.mode);
  const fraction = (duration - model.remainingMs) / duration;
  return fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
}

export function completedText(model: Model): Uint8Array {
  return asciiBytes(`${model.completed} completed`);
}

export function canStart(model: Model): boolean {
  return !model.running && model.remainingMs > 0;
}

export function update(model: Model, msg: Msg): Model | [Model, Cmd<Msg>] {
  switch (msg.kind) {
    case "start":
      return model.remainingMs > 0 ? { ...model, running: true } : model;
    case "pause":
      return { ...model, running: false };
    case "reset":
      return { ...model, running: false, remainingMs: durationForMode(model.mode) };
    case "toggle_picker":
      return { ...model, pickerOpen: !model.pickerOpen };
    case "close_picker":
      return { ...model, pickerOpen: false };
    case "pick_focus":
      return { ...model, mode: "focus", remainingMs: durationForMode("focus"), running: false, pickerOpen: false };
    case "pick_break":
      return { ...model, mode: "short_break", remainingMs: durationForMode("short_break"), running: false, pickerOpen: false };
    case "pick_demo":
      return { ...model, mode: "demo", remainingMs: durationForMode("demo"), running: false, pickerOpen: false };
    case "tick": {
      if (!model.running) return model;
      const next = model.remainingMs - TICK_STEP_MS;
      if (next <= 0) {
        const completesSprint = model.mode === "focus" || model.mode === "demo";
        return {
          ...model,
          remainingMs: 0,
          running: false,
          completed: completesSprint && model.completed < 1000000 ? model.completed + 1 : model.completed,
        };
      }
      return { ...model, remainingMs: next };
    }
  }
}

export function subscriptions(model: Model): Sub<Msg> {
  if (!model.running) return Sub.none;
  return Sub.timer("tick", model.mode === "demo" ? 200 : 1000, "tick");
}
