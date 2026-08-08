type ScenarioStep =
  | { action: "selector"; selector: string }
  | { action: "click"; selector: string }
  | { action: "input"; selector: string; value: string }
  | { action: "focus"; selector: string }
  | {
      action: "assert";
      selector: string;
      property: "focused" | "text" | "value" | "visible";
      equals?: string | boolean;
    };

type Scenario = { id: string; steps: ScenarioStep[] };
type StepResult = { index: number; ok: boolean; error?: string };

const MAX_HANDLER_RESULT_BYTES = 12 * 1024;
const MAX_SCENARIO_STEPS = 40;
const MAX_SCENARIO_ID_BYTES = 128;
const MAX_SELECTOR_BYTES = 512;
const MAX_VALUE_BYTES = 2048;
const MAX_ERROR_BYTES = 512;
const encoder = new TextEncoder();

declare global {
  interface Window {
    zero?: {
      invoke(command: string, payload: unknown): Promise<unknown>;
    };
  }
}

function select(selector: string): HTMLElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`selector did not match an element: ${selector}`);
  return element;
}

function byteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

function boundedText(value: unknown, maximumBytes: number): string {
  const text = value instanceof Error ? value.message : String(value);
  if (byteLength(text) <= maximumBytes) return text;
  let end = Math.min(text.length, maximumBytes);
  while (end > 0 && byteLength(text.slice(0, end)) > maximumBytes - 3) end -= 1;
  return `${text.slice(0, end)}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, name: string, maximumBytes: number): string {
  if (typeof value !== "string" || value.length === 0 || byteLength(value) > maximumBytes) {
    throw new Error(`${name} must be a non-empty string no larger than ${maximumBytes} bytes`);
  }
  return value;
}

function parseStep(value: unknown): ScenarioStep {
  if (!isRecord(value)) throw new Error("each Behavior Scenario step must be an object");
  const action = value.action;
  if (!["selector", "click", "input", "focus", "assert"].includes(String(action))) {
    throw new Error("Behavior Scenario step has an unsupported action");
  }
  const selector = boundedString(value.selector, "selector", MAX_SELECTOR_BYTES);
  if (action === "input") {
    return { action, selector, value: boundedString(value.value, "input value", MAX_VALUE_BYTES) };
  }
  if (action === "assert") {
    if (!["focused", "text", "value", "visible"].includes(String(value.property))) {
      throw new Error("assert step has an unsupported property");
    }
    if (value.property === "focused" || value.property === "visible") {
      if (typeof value.equals !== "boolean") throw new Error(`${value.property} assertion requires a boolean`);
      return { action, selector, property: value.property, equals: value.equals };
    }
    return {
      action,
      selector,
      property: value.property,
      equals: boundedString(value.equals, "assertion value", MAX_VALUE_BYTES),
    };
  }
  return { action, selector } as ScenarioStep;
}

function parseScenario(value: unknown): Scenario {
  if (!isRecord(value)) throw new Error("Behavior Scenario must be an object");
  if (byteLength(JSON.stringify(value)) > MAX_HANDLER_RESULT_BYTES) {
    throw new Error("Behavior Scenario exceeds the 12 KiB handler-result limit");
  }
  const id = boundedString(value.id, "scenario id", MAX_SCENARIO_ID_BYTES);
  if (!Array.isArray(value.steps) || value.steps.length === 0 || value.steps.length > MAX_SCENARIO_STEPS) {
    throw new Error(`Behavior Scenario must contain 1-${MAX_SCENARIO_STEPS} steps`);
  }
  return { id, steps: value.steps.map(parseStep) };
}

function visible(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  const bounds = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && bounds.width > 0 && bounds.height > 0;
}

function execute(step: ScenarioStep): void {
  const element = select(step.selector);
  if (step.action === "selector") return;
  if (step.action === "click") {
    element.click();
    return;
  }
  if (step.action === "focus") {
    element.focus();
    return;
  }
  if (step.action === "input") {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
      throw new Error(`input action requires an input or textarea: ${step.selector}`);
    }
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
    setter?.call(element, step.value);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: step.value }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  let actual: string | boolean;
  if (step.property === "focused") actual = document.activeElement === element;
  else if (step.property === "visible") actual = visible(element);
  else if (step.property === "value") actual = "value" in element ? String(element.value) : "";
  else actual = element.textContent?.trim() ?? "";
  if (actual !== step.equals) {
    throw new Error(`${step.property} assertion failed for ${step.selector}`);
  }
}

async function run(): Promise<void> {
  if (!window.zero) return;
  const rawScenario = await window.zero.invoke("replicator.scenario", {});
  if (rawScenario === null) return;

  let scenario: Scenario;
  try {
    scenario = parseScenario(rawScenario);
  } catch (error) {
    await submitResult({
      scenarioId: "invalid",
      passed: false,
      steps: [],
      error: boundedText(error, MAX_ERROR_BYTES),
    });
    return;
  }

  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

  const steps: StepResult[] = [];
  for (const [index, step] of scenario.steps.entries()) {
    try {
      execute(step);
      steps.push({ index, ok: true });
    } catch (error) {
      steps.push({ index, ok: false, error: boundedText(error, MAX_ERROR_BYTES) });
      break;
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  await submitResult({
    scenarioId: scenario.id,
    passed: steps.length === scenario.steps.length && steps.every((step) => step.ok),
    steps,
  });
}

async function submitResult(result: {
  scenarioId: string;
  passed: boolean;
  steps: StepResult[];
  error?: string;
}): Promise<void> {
  if (byteLength(JSON.stringify(result)) > MAX_HANDLER_RESULT_BYTES) {
    throw new Error("Behavior Scenario result exceeds the 12 KiB handler-result limit");
  }
  await window.zero!.invoke("replicator.submitResult", result);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void run(), { once: true });
} else {
  void run();
}

export {};
