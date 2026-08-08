#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  lstat,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CATALOG_URL = "https://native-sdk.dev/llms.txt";
const EXPECTED_PAGES = 96;
const EXPECTED_COMPONENT_PAGES = 48;
const MAX_CONCURRENCY = 8;
const EXPECTED_NATIVE_COMMIT = "b21849c";
const EXPECTED_AUTOMATION_PROTOCOL = "0x096c8aa4730c11ec";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const resourcesRoot = path.join(repositoryRoot, "resources");
const destination = path.join(resourcesRoot, "native-docs");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeRelativePath(url) {
  if (url.protocol !== "https:" || url.hostname !== "native-sdk.dev") {
    throw new Error(`unapproved documentation origin: ${url.href}`);
  }
  if (url.search || url.hash || !url.pathname.startsWith("/docs/") || !url.pathname.endsWith(".md")) {
    throw new Error(`unapproved documentation URL: ${url.href}`);
  }
  const relative = decodeURIComponent(url.pathname.slice(1));
  if (relative.startsWith("/") || path.posix.normalize(relative) !== relative || relative.split("/").includes("..")) {
    throw new Error(`escaping documentation path: ${relative}`);
  }
  return relative;
}

function slug(value) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[`*_~[\]{}()<>]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "section";
}

function headingIndex(markdown) {
  const lines = markdown.match(/.*(?:\n|$)/g)?.filter(Boolean) ?? [];
  const headings = [];
  const ids = new Map();
  let byteOffset = 0;

  for (const line of lines) {
    const content = line.endsWith("\n") ? line.slice(0, -1).replace(/\r$/, "") : line;
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(content);
    if (match) {
      const title = match[2].trim();
      const base = slug(title);
      const count = (ids.get(base) ?? 0) + 1;
      ids.set(base, count);
      headings.push({
        id: count === 1 ? base : `${base}-${count}`,
        title,
        level: match[1].length,
        startByte: byteOffset,
        endByte: 0,
      });
    }
    byteOffset += Buffer.byteLength(line);
  }

  for (let index = 0; index < headings.length; index += 1) {
    headings[index].endByte = headings[index + 1]?.startByte ?? byteOffset;
  }
  return headings;
}

async function fetchMarkdown(url, allowPlainText = false) {
  const response = await fetch(url, { headers: { accept: "text/markdown" } });
  if (!response.ok) throw new Error(`documentation fetch failed (${response.status}): ${url}`);
  const contentType = response.headers.get("content-type") ?? "";
  const mediaType = contentType.toLowerCase().split(";", 1)[0].trim();
  if (mediaType !== "text/markdown" && !(allowPlainText && mediaType === "text/plain")) {
    throw new Error(`expected Markdown response for ${url}, got ${contentType || "no content type"}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error(`empty Markdown response: ${url}`);
  return bytes;
}

async function mapConcurrent(values, limit, mapper) {
  const results = new Array(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

function assertIndexedPath(relative, prefix, suffix) {
  if (typeof relative !== "string" || !relative.startsWith(prefix) || !relative.endsWith(suffix)
      || path.posix.normalize(relative) !== relative || relative.split("/").includes("..")) {
    throw new Error(`invalid indexed path: ${relative}`);
  }
}

async function assertRegularFile(root, relative) {
  const target = path.join(root, ...relative.split("/"));
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error(`escaping indexed path: ${relative}`);
  const metadata = await lstat(target);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`indexed entry is not a regular file: ${relative}`);
  return readFile(target);
}

async function listCorpusFiles(root, relative = "") {
  const directory = relative ? path.join(root, ...relative.split("/")) : root;
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`corpus contains a symbolic link: ${child}`);
    if (entry.isDirectory()) files.push(...await listCorpusFiles(root, child));
    else if (entry.isFile()) files.push(child);
    else throw new Error(`corpus contains an unsupported entry: ${child}`);
  }
  return files;
}

async function verifyDocs(root = destination) {
  const index = JSON.parse(await readFile(path.join(root, "index.json"), "utf8"));
  if (index.schemaVersion !== 1 || index.catalog?.url !== CATALOG_URL
      || index.pageCount !== EXPECTED_PAGES || index.componentPageCount !== EXPECTED_COMPONENT_PAGES
      || !Array.isArray(index.pages) || index.pages.length !== EXPECTED_PAGES) {
    throw new Error("invalid Native documentation index header");
  }
  const ids = new Set();
  const records = [];
  for (const page of index.pages) {
    assertIndexedPath(page.path, "docs/", ".md");
    if (page.id !== page.path || ids.has(page.id)) throw new Error(`duplicate or mismatched page ID: ${page.id}`);
    ids.add(page.id);
    const bytes = await assertRegularFile(root, page.path);
    if (bytes.length !== page.bytes || sha256(bytes) !== page.sha256
        || JSON.stringify(headingIndex(bytes.toString("utf8"))) !== JSON.stringify(page.headings)) {
      throw new Error(`documentation digest or heading mismatch: ${page.path}`);
    }
    records.push(`${page.path}\0${page.sha256}\n`);
  }
  records.sort();
  if (sha256(records.join("")) !== index.snapshotSha256) throw new Error("documentation snapshot digest mismatch");
  const expectedFiles = new Set(["index.json", ...index.pages.map((page) => page.path)]);
  const actualFiles = await listCorpusFiles(root);
  if (actualFiles.length !== expectedFiles.size || actualFiles.some((file) => !expectedFiles.has(file))) {
    throw new Error("documentation corpus contains an unindexed file");
  }
  return { pageCount: index.pageCount, componentPageCount: index.componentPageCount, snapshotSha256: index.snapshotSha256 };
}

const SKILL_FILES = [
  { id: "native-ui", full: false, path: "native-ui.md" },
  { id: "ts-core", full: false, path: "ts-core.md" },
  { id: "automation", full: false, path: "automation.md" },
  { id: "core", full: true, path: "core-full.md" },
  { id: "zig", full: false, path: "zig.md" },
];

async function indexSkills(root, versionFile) {
  const versionOutput = (await readFile(versionFile, "utf8")).trim();
  const versionMatch = /^native (\S+) \(commit ([0-9a-f]+), automation protocol (0x[0-9a-f]+)\)$/.exec(versionOutput);
  if (!versionMatch || versionMatch[1] !== "0.8.1" || versionMatch[2] !== EXPECTED_NATIVE_COMMIT
      || versionMatch[3] !== EXPECTED_AUTOMATION_PROTOCOL) {
    throw new Error(`unexpected Native version: ${versionOutput}`);
  }
  const listBytes = await assertRegularFile(root, "skills-list.txt");
  if (listBytes.length === 0) throw new Error("empty Native skills list");
  const listedIds = new Set(listBytes.toString("utf8").split("\n").filter(Boolean).map((line) => line.split("\t", 1)[0]));
  const skills = [];
  for (const definition of SKILL_FILES) {
    if (!listedIds.has(definition.id)) throw new Error(`required Native skill is not listed: ${definition.id}`);
    const bytes = await assertRegularFile(root, definition.path);
    if (bytes.length === 0) throw new Error(`empty Native skill: ${definition.id}`);
    skills.push({
      ...definition,
      bytes: bytes.length,
      sha256: sha256(bytes),
      headings: headingIndex(bytes.toString("utf8")),
    });
  }
  const list = { path: "skills-list.txt", bytes: listBytes.length, sha256: sha256(listBytes) };
  const records = [`${list.path}\0${list.sha256}\n`, ...skills.map((skill) => `${skill.path}\0${skill.sha256}\n`)].sort();
  const manifest = {
    schemaVersion: 1,
    native: { version: versionMatch[1], commit: versionMatch[2], automationProtocol: versionMatch[3], versionOutput },
    generatedAt: new Date().toISOString(),
    list,
    skillCount: skills.length,
    snapshotSha256: sha256(records.join("")),
    skills,
  };
  await writeFile(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { skillCount: skills.length, snapshotSha256: manifest.snapshotSha256 };
}

async function verifySkills(root) {
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
  if (manifest.schemaVersion !== 1 || manifest.native?.version !== "0.8.1"
      || manifest.native?.commit !== EXPECTED_NATIVE_COMMIT || manifest.native?.automationProtocol !== EXPECTED_AUTOMATION_PROTOCOL
      || manifest.skillCount !== SKILL_FILES.length || !Array.isArray(manifest.skills)) {
    throw new Error("invalid Native skills manifest header");
  }
  const expected = new Map(SKILL_FILES.map((entry) => [entry.id, entry]));
  const records = [];
  for (const entry of [manifest.list, ...manifest.skills]) {
    assertIndexedPath(entry.path, entry === manifest.list ? "skills-list" : "", entry === manifest.list ? ".txt" : ".md");
    const bytes = await assertRegularFile(root, entry.path);
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) throw new Error(`Native skill digest mismatch: ${entry.path}`);
    records.push(`${entry.path}\0${entry.sha256}\n`);
    if (entry !== manifest.list) {
      const definition = expected.get(entry.id);
      if (!definition || definition.path !== entry.path || definition.full !== entry.full
          || JSON.stringify(headingIndex(bytes.toString("utf8"))) !== JSON.stringify(entry.headings)) {
        throw new Error(`invalid Native skill entry: ${entry.id}`);
      }
      expected.delete(entry.id);
    }
  }
  if (expected.size !== 0 || sha256(records.sort().join("")) !== manifest.snapshotSha256) {
    throw new Error("Native skills snapshot digest mismatch");
  }
  const expectedFiles = new Set(["manifest.json", manifest.list.path, ...manifest.skills.map((skill) => skill.path)]);
  const actualFiles = await listCorpusFiles(root);
  if (actualFiles.length !== expectedFiles.size || actualFiles.some((file) => !expectedFiles.has(file))) {
    throw new Error("Native skills corpus contains an unindexed file");
  }
  return { skillCount: manifest.skillCount, snapshotSha256: manifest.snapshotSha256 };
}

async function syncDocs() {
await mkdir(resourcesRoot, { recursive: true });
const temporary = await mkdtemp(path.join(resourcesRoot, ".native-docs-"));
const backup = `${destination}.previous`;

try {
  const catalogBytes = await fetchMarkdown(CATALOG_URL, true);
  const catalogText = catalogBytes.toString("utf8");
  const links = [];
  const seenUrls = new Set();
  const seenPaths = new Set();
  const linkPattern = /\[[^\]]+\]\((https:\/\/native-sdk\.dev\/docs\/[^)\s]+\.md)\)/g;
  for (const match of catalogText.matchAll(linkPattern)) {
    const sourceUrl = match[1];
    if (seenUrls.has(sourceUrl)) throw new Error(`duplicate documentation URL: ${sourceUrl}`);
    const relativePath = safeRelativePath(new URL(sourceUrl));
    if (seenPaths.has(relativePath)) throw new Error(`duplicate documentation path: ${relativePath}`);
    seenUrls.add(sourceUrl);
    seenPaths.add(relativePath);
    links.push({ sourceUrl, relativePath });
  }

  if (links.length !== EXPECTED_PAGES) {
    throw new Error(`expected ${EXPECTED_PAGES} documentation pages, found ${links.length}`);
  }
  const componentPageCount = links.filter(({ relativePath }) => relativePath.startsWith("docs/components/")).length;
  if (componentPageCount !== EXPECTED_COMPONENT_PAGES) {
    throw new Error(`expected ${EXPECTED_COMPONENT_PAGES} component pages, found ${componentPageCount}`);
  }

  const pages = await mapConcurrent(links, MAX_CONCURRENCY, async ({ sourceUrl, relativePath }) => {
    const bytes = await fetchMarkdown(sourceUrl);
    const outputPath = path.join(temporary, ...relativePath.split("/"));
    if (!outputPath.startsWith(`${temporary}${path.sep}`)) throw new Error(`escaping output path: ${relativePath}`);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, bytes, { flag: "wx" });
    const markdown = bytes.toString("utf8");
    const headings = headingIndex(markdown);
    const title = headings.find(({ level }) => level === 1)?.title;
    if (!title) throw new Error(`documentation page has no level-one heading: ${sourceUrl}`);
    return {
      id: relativePath,
      title,
      sourceUrl,
      path: relativePath,
      bytes: bytes.length,
      sha256: sha256(bytes),
      headings,
    };
  });

  pages.sort((left, right) => left.path.localeCompare(right.path));
  const snapshotSha256 = sha256(pages.map((page) => `${page.path}\0${page.sha256}\n`).join(""));
  const index = {
    schemaVersion: 1,
    catalog: {
      url: CATALOG_URL,
      sha256: sha256(catalogBytes),
      generatedAt: new Date().toISOString(),
    },
    pageCount: pages.length,
    componentPageCount,
    snapshotSha256,
    pages,
  };
  await writeFile(path.join(temporary, "index.json"), `${JSON.stringify(index, null, 2)}\n`, { flag: "wx" });

  await rm(backup, { recursive: true, force: true });
  try {
    await rename(destination, backup);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await rename(temporary, destination);
  await rm(backup, { recursive: true, force: true });

  const written = JSON.parse(await readFile(path.join(destination, "index.json"), "utf8"));
  const writtenStat = await stat(destination);
  if (!writtenStat.isDirectory() || written.snapshotSha256 !== snapshotSha256) {
    throw new Error("documentation snapshot verification failed after rename");
  }
  process.stdout.write(`${JSON.stringify({ pageCount: pages.length, componentPageCount, snapshotSha256 })}\n`);
} catch (error) {
  await rm(temporary, { recursive: true, force: true });
  throw error;
}
}

const [command, first, second] = process.argv.slice(2);
let result;
if (!command) result = await syncDocs();
else if (command === "--verify-docs") result = await verifyDocs(first ? path.resolve(first) : destination);
else if (command === "--index-skills" && first && second) result = await indexSkills(path.resolve(first), path.resolve(second));
else if (command === "--verify-skills" && first) result = await verifySkills(path.resolve(first));
else throw new Error("usage: sync-native-docs.mjs [--verify-docs [DIR] | --index-skills DIR VERSION_FILE | --verify-skills DIR]");
if (result) process.stdout.write(`${JSON.stringify(result)}\n`);
