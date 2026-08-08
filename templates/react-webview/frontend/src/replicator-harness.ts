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
  const scenario = (await window.zero.invoke("replicator.scenario", {})) as Scenario | null;
  if (!scenario) return;
  if (typeof scenario.id !== "string" || !Array.isArray(scenario.steps) || scenario.steps.length > 40) {
    throw new Error("invalid or oversized Behavior Scenario");
  }

  const steps: Array<{ index: number; ok: boolean; error?: string }> = [];
  for (const [index, step] of scenario.steps.entries()) {
    try {
      execute(step);
      steps.push({ index, ok: true });
    } catch (error) {
      steps.push({ index, ok: false, error: error instanceof Error ? error.message : String(error) });
      break;
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  await window.zero.invoke("replicator.submitResult", {
    scenarioId: scenario.id,
    passed: steps.length === scenario.steps.length && steps.every((step) => step.ok),
    steps,
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void run(), { once: true });
} else {
  void run();
}

export {};
