import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { UtilityFormat, UtilityState } from "./protocol.js";

export type OwnerTimelineEntry = {
  id: string;
  kind: "build_request" | "revision_request" | "clarification";
  createdAt: string;
  content: unknown;
};

export type UtilityRecord = {
  id: string;
  displayName: string;
  format: UtilityFormat;
  state: UtilityState;
  folder: string;
  timeline: OwnerTimelineEntry[];
  session: { activeId: string; replacedIds: string[] };
  references: unknown[];
  acceptedPlan?: unknown;
  behaviorContract?: unknown;
  readyArtifact?: unknown;
  activeAttempt?: unknown;
  lastError?: unknown;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export type Registry = {
  version: 1;
  utilities: UtilityRecord[];
};

const EMPTY_REGISTRY: Registry = { version: 1, utilities: [] };

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
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.write(EMPTY_REGISTRY);
      return structuredClone(EMPTY_REGISTRY);
    }
  }

  async read(): Promise<Registry> {
    const registry = JSON.parse(await readFile(this.#registryPath, "utf8")) as Registry;
    if (registry.version !== 1 || !Array.isArray(registry.utilities)) {
      throw new Error("unsupported registry shape");
    }
    return registry;
  }

  async write(registry: Registry): Promise<void> {
    let hadPrevious = true;
    try {
      await copyFile(this.#registryPath, this.#backupPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      hadPrevious = false;
    }
    await writeFile(this.#temporaryPath, `${JSON.stringify(registry, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(this.#temporaryPath, this.#registryPath);
    if (!hadPrevious) await copyFile(this.#registryPath, this.#backupPath);
  }

  async persistSession(utilityId: string, sessionId: string): Promise<void> {
    const registry = await this.read();
    const utility = registry.utilities.find((candidate) => candidate.id === utilityId);
    if (!utility) throw new Error(`unknown Utility: ${utilityId}`);
    utility.session.activeId = sessionId;
    utility.updatedAt = new Date().toISOString();
    await this.write(registry);
  }
}
