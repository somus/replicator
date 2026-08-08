import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import type { NativeGuidanceSelection, UtilityFormat } from "./protocol.js";

export type GuidanceCorpus = "native-doc" | "native-skill";
export type GuidanceSelection = {
  corpus: GuidanceCorpus;
  id: string;
  sectionId: string;
  digest: string;
  purpose: string;
};

type Heading = { id: string; title: string; level: number; startByte: number; endByte: number };
type Entry = { id: string; path: string; bytes: number; sha256: string; headings: Heading[] };
type SearchHit = { corpus: GuidanceCorpus; id: string; sectionId: string; excerpt: string };

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} is invalid`);
  return value as Record<string, unknown>;
}

function safeRelative(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || path.isAbsolute(value) || value.includes("\\") || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`${label} is not a safe relative path`);
  }
  return value;
}

function parseHeadings(value: unknown, bytes: number, label: string): Heading[] {
  if (!Array.isArray(value)) throw new Error(`${label}.headings is invalid`);
  let previousEnd = 0;
  return value.map((raw, index) => {
    const item = record(raw, `${label}.headings.${index}`);
    if (typeof item.id !== "string" || typeof item.title !== "string" || typeof item.level !== "number" || typeof item.startByte !== "number" || typeof item.endByte !== "number") {
      throw new Error(`${label}.headings.${index} is invalid`);
    }
    if (item.startByte < previousEnd || item.endByte <= item.startByte || item.endByte > bytes) throw new Error(`${label}.headings.${index} range is invalid`);
    previousEnd = item.endByte;
    return item as Heading;
  });
}

function parseEntry(raw: unknown, label: string): Entry {
  const item = record(raw, label);
  const file = safeRelative(item.path, `${label}.path`);
  if (typeof item.id !== "string" || typeof item.bytes !== "number" || typeof item.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(item.sha256)) {
    throw new Error(`${label} is invalid`);
  }
  return { id: item.id, path: file, bytes: item.bytes, sha256: item.sha256, headings: parseHeadings(item.headings, item.bytes, label) };
}

async function loadEntries(indexPath: string, field: "pages" | "skills"): Promise<Entry[]> {
  const index = record(JSON.parse(await readFile(indexPath, "utf8")), indexPath);
  if (index.schemaVersion !== 1 || !Array.isArray(index[field])) throw new Error(`${indexPath} has an unsupported schema`);
  const entries = index[field].map((raw, position) => parseEntry(raw, `${field}.${position}`));
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`${indexPath} contains duplicate ID ${entry.id}`);
    ids.add(entry.id);
  }
  return entries;
}

export class NativeGuidance {
  private readonly reads: Array<GuidanceSelection & { bytes: number }> = [];

  private constructor(
    private readonly roots: Record<GuidanceCorpus, string>,
    private readonly entries: Record<GuidanceCorpus, Entry[]>,
  ) {}

  static async load(resourcesRoot: string): Promise<NativeGuidance> {
    const docsRoot = path.join(resourcesRoot, "native-docs");
    const skillsRoot = path.join(resourcesRoot, "native-skills", "0.8.1");
    return new NativeGuidance(
      { "native-doc": docsRoot, "native-skill": skillsRoot },
      {
        "native-doc": await loadEntries(path.join(docsRoot, "index.json"), "pages"),
        "native-skill": await loadEntries(path.join(skillsRoot, "manifest.json"), "skills"),
      },
    );
  }

  list(corpus: GuidanceCorpus): Array<{ id: string; digest: string; sections: Array<{ id: string; title: string }> }> {
    return this.entries[corpus].map((entry) => ({
      id: entry.id,
      digest: entry.sha256,
      sections: entry.headings.map((heading) => ({ id: heading.id, title: heading.title })),
    }));
  }

  compactCatalog(): string {
    return JSON.stringify({
      skills: this.compactList("native-skill"),
      official: this.compactList("native-doc"),
    });
  }

  compactList(corpus: GuidanceCorpus): Array<{ id: string; digest: string; sections: string[] }> {
    return this.entries[corpus].map((entry) => ({ id: entry.id, digest: entry.sha256, sections: entry.headings.map((heading) => heading.id) }));
  }

  readTelemetry(): ReadonlyArray<GuidanceSelection & { bytes: number }> {
    return this.reads.map((entry) => ({ ...entry }));
  }

  assertSelectionsRead(selections: readonly NativeGuidanceSelection[], fromIndex: number): void {
    if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex > this.reads.length) throw new Error("Native guidance read boundary is invalid");
    const reads = this.reads.slice(fromIndex);
    const missing: string[] = [];
    for (const selection of selections) {
      const corpus: GuidanceCorpus = selection.corpus === "skill" ? "native-skill" : "native-doc";
      for (const sectionId of selection.sectionIds) {
        const read = reads.some((entry) => entry.corpus === corpus && entry.id === selection.id && entry.sectionId === sectionId && entry.digest === selection.digest && entry.bytes > 0);
        if (!read) missing.push(`${selection.id}#${sectionId}`);
      }
    }
    if (missing.length > 0) throw new Error(`Read every approved Native guidance section before behavior verification. Missing: ${missing.join(", ")}`);
  }

  assertSelections(selections: readonly NativeGuidanceSelection[], format: UtilityFormat): void {
    let skillSections = 0;
    let officialPages = 0;
    const selectedSkills = new Set<string>();
    let selectedComponent = false;
    for (const selection of selections) {
      const corpus: GuidanceCorpus = selection.corpus === "skill" ? "native-skill" : "native-doc";
      const entry = this.entries[corpus].find((candidate) => candidate.id === selection.id);
      if (!entry || entry.sha256 !== selection.digest) throw new Error(`unknown or stale Native guidance: ${selection.id}`);
      if (new Set(selection.sectionIds).size !== selection.sectionIds.length) throw new Error(`duplicate Native guidance section: ${selection.id}`);
      for (const sectionId of selection.sectionIds) {
        if (!entry.headings.some((heading) => heading.id === sectionId)) throw new Error(`unknown Native guidance section: ${selection.id}#${sectionId}`);
      }
      if (selection.corpus === "skill") {
        if (selection.id === "zig") throw new Error("generated Utility coding cannot select the protected Zig skill");
        selectedSkills.add(selection.id);
        skillSections += selection.sectionIds.length;
      } else {
        officialPages += 1;
        if (selection.component) {
          if (!selection.id.startsWith("docs/components/")) throw new Error("component metadata requires its exact official component page");
          if (!selection.component.element) throw new Error("component guidance requires an element name");
          selectedComponent = true;
        }
      }
    }
    if (skillSections > 8 || officialPages > 16) throw new Error("Native guidance selection exceeds its plan cap");
    if (format !== "react-webview") {
      if (!selectedSkills.has("native-ui") || !selectedSkills.has("ts-core")) throw new Error("Native plans require native-ui and ts-core guidance");
      if (!selectedComponent) throw new Error("Native plans require exact official component guidance");
    }
  }

  async read(selection: GuidanceSelection, cursor = 0): Promise<{ text: string; nextCursor?: number }> {
    const entry = this.entries[selection.corpus].find((candidate) => candidate.id === selection.id);
    if (!entry || entry.sha256 !== selection.digest) throw new Error("Native guidance selection is unknown or stale");
    const heading = entry.headings.find((candidate) => candidate.id === selection.sectionId);
    if (!heading) throw new Error("Native guidance section is unknown");
    const filePath = path.join(this.roots[selection.corpus], entry.path);
    const metadata = await lstat(filePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Native guidance file is not an immutable regular file");
    const data = await readFile(filePath);
    if (data.byteLength !== entry.bytes || sha256(data) !== entry.sha256) throw new Error("Native guidance digest changed");
    const section = data.subarray(heading.startByte, heading.endByte);
    if (!Number.isInteger(cursor) || cursor < 0 || cursor >= section.byteLength) throw new Error("Native guidance cursor is invalid");
    const end = Math.min(section.byteLength, cursor + 12 * 1024);
    this.reads.push({ ...selection, bytes: end - cursor });
    return { text: section.subarray(cursor, end).toString("utf8"), ...(end < section.byteLength ? { nextCursor: end } : {}) };
  }

  async search(query: string, onlyCorpus?: GuidanceCorpus): Promise<SearchHit[]> {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2 || needle.length > 120) throw new Error("Native guidance search query is invalid");
    const hits: SearchHit[] = [];
    for (const corpus of (onlyCorpus ? [onlyCorpus] : ["native-skill", "native-doc"] as const)) {
      for (const entry of this.entries[corpus]) {
        const filePath = path.join(this.roots[corpus], entry.path);
        const data = await readFile(filePath);
        if (data.byteLength !== entry.bytes || sha256(data) !== entry.sha256) throw new Error("Native guidance digest changed");
        const lower = data.toString("utf8").toLowerCase();
        const position = lower.indexOf(needle);
        if (position < 0) continue;
        const heading = entry.headings.find((candidate) => position >= candidate.startByte && position < candidate.endByte) ?? entry.headings[0];
        if (!heading) continue;
        const start = Math.max(heading.startByte, position - 256);
        const end = Math.min(heading.endByte, start + 1024);
        hits.push({ corpus, id: entry.id, sectionId: heading.id, excerpt: data.subarray(start, end).toString("utf8") });
        if (hits.length === 8) return hits;
      }
    }
    return hits;
  }
}
