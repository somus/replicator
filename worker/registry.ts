import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  AcceptedPlan,
  BehaviorContract,
  ReadyArtifactMetadata,
  ReferenceImageMetadata,
  RequestKind,
  ScenarioResult,
  StartAttemptCommand,
  ClarificationQuestion,
  UtilityFormat,
  UtilityState,
} from "./protocol.js";

export type OwnerTimelineEntry = {
  id: string;
  kind: "build_request" | "revision_request" | "clarification";
  createdAt: string;
  content: { text?: string; batchId?: string; questions?: unknown[]; answers?: Record<string, string> };
};

export type ActiveAttemptRecord = {
  id: string;
  requestId: string;
  kind: RequestKind;
  startedAt: string;
  activeElapsedMs: number;
  clarificationBatches: number;
  command?: StartAttemptCommand;
  pendingClarification?: { batchId: string; questions: ClarificationQuestion[] };
  snapshot?: string;
  phase?: "planning" | "building" | "verifying" | "preparing";
  currentDigest?: string;
  validatedDigest?: string;
  verifiedDigest?: string;
  binaryDigest?: string;
  finalizationNonce?: string;
  lastAcceptedTool?: string;
  lastRepairScope?: "source" | "scenario" | "host";
  queries?: Array<{
    phase: "planning" | "build";
    instructionVersion: string;
    instructionDigest: string;
    logicalModel: "haiku" | "sonnet";
    effort: "low" | "medium";
    resolvedModel: string;
    routeReason: string;
  }>;
};

export type OwnerFacingError = { code: string; message: string; occurredAt: string };

export type ReadyArtifactRecord = ReadyArtifactMetadata & {
  evidencePath: string;
  screenshots: string[];
  scenarioResults: ScenarioResult[];
  createdAt: string;
};

export type UtilityRecord = {
  id: string;
  displayName: string;
  format: UtilityFormat;
  state: UtilityState;
  folder: string;
  timeline: OwnerTimelineEntry[];
  session: { activeId: string; replacedIds: string[] };
  references: ReferenceImageMetadata[];
  acceptedPlan?: AcceptedPlan;
  behaviorContract?: BehaviorContract;
  readyArtifact?: ReadyArtifactRecord;
  activeAttempt?: ActiveAttemptRecord;
  lastError?: OwnerFacingError;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export type Registry = { version: 1; utilities: UtilityRecord[] };

const EMPTY_REGISTRY: Registry = { version: 1, utilities: [] };

function assertRelativePath(value: string, field: string): void {
  if (value.length === 0 || path.isAbsolute(value) || value.includes("\\") || value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`${field} must be a normalized relative path`);
  }
}

function validateRegistry(value: unknown): Registry {
  if (typeof value !== "object" || value === null) throw new Error("registry must be an object");
  const registry = value as Partial<Registry>;
  if (registry.version !== 1 || !Array.isArray(registry.utilities)) throw new Error("unsupported registry shape");
  const ids = new Set<string>();
  let activeAttempts = 0;
  for (const utility of registry.utilities) {
    if (!utility || typeof utility !== "object" || typeof utility.id !== "string" || ids.has(utility.id)) throw new Error("registry contains an invalid or duplicate Utility");
    ids.add(utility.id);
    assertRelativePath(utility.folder, `utilities.${utility.id}.folder`);
    if (utility.readyArtifact) {
      assertRelativePath(utility.readyArtifact.path, `utilities.${utility.id}.readyArtifact.path`);
      assertRelativePath(utility.readyArtifact.evidencePath, `utilities.${utility.id}.readyArtifact.evidencePath`);
      for (const screenshot of utility.readyArtifact.screenshots) assertRelativePath(screenshot, `utilities.${utility.id}.readyArtifact.screenshots`);
    }
    for (const reference of utility.references) assertRelativePath(reference.path, `utilities.${utility.id}.references.path`);
    if (utility.activeAttempt) activeAttempts += 1;
  }
  if (activeAttempts > 1) throw new Error("registry contains more than one active Request Attempt");
  return registry as Registry;
}

export class RegistryStore {
  readonly #registryPath: string;
  readonly #temporaryPath: string;
  readonly #backupPath: string;

  constructor(readonly dataRoot: string) {
    this.#registryPath = path.join(dataRoot, "registry.json");
    this.#temporaryPath = path.join(dataRoot, "registry.json.tmp");
    this.#backupPath = path.join(dataRoot, "registry.json.backup");
  }

  async initialize(): Promise<Registry> {
    await mkdir(this.dataRoot, { recursive: true });
    try {
      return await this.read();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        await this.write(EMPTY_REGISTRY);
        return structuredClone(EMPTY_REGISTRY);
      }
      try {
        const backup = validateRegistry(JSON.parse(await readFile(this.#backupPath, "utf8")));
        await this.write(backup);
        return backup;
      } catch {
        throw error;
      }
    }
  }

  async read(): Promise<Registry> {
    return validateRegistry(JSON.parse(await readFile(this.#registryPath, "utf8")));
  }

  async write(registry: Registry): Promise<void> {
    validateRegistry(registry);
    let hadPrevious = true;
    try {
      await copyFile(this.#registryPath, this.#backupPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      hadPrevious = false;
    }
    await writeFile(this.#temporaryPath, `${JSON.stringify(registry)}\n`, { mode: 0o600 });
    await rename(this.#temporaryPath, this.#registryPath);
    if (!hadPrevious) await copyFile(this.#registryPath, this.#backupPath);
  }

  async update(mutator: (registry: Registry) => void): Promise<Registry> {
    const registry = await this.read();
    mutator(registry);
    await this.write(registry);
    return registry;
  }

  async persistSession(utilityId: string, sessionId: string): Promise<void> {
    await this.update((registry) => {
      const utility = registry.utilities.find((candidate) => candidate.id === utilityId);
      if (!utility) throw new Error(`unknown Utility: ${utilityId}`);
      utility.session.activeId = sessionId;
      utility.updatedAt = new Date().toISOString();
    });
  }

  async persistQuery(
    utilityId: string,
    attemptId: string,
    query: NonNullable<ActiveAttemptRecord["queries"]>[number],
  ): Promise<void> {
    await this.update((registry) => {
      const utility = registry.utilities.find((candidate) => candidate.id === utilityId);
      if (!utility?.activeAttempt || utility.activeAttempt.id !== attemptId) throw new Error("Request Attempt is no longer active");
      utility.activeAttempt.queries ??= [];
      utility.activeAttempt.queries.push(query);
      utility.updatedAt = new Date().toISOString();
    });
  }
}
