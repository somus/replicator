import { createHash } from "node:crypto";
import {
  constants,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { UtilityFormat } from "./protocol.js";

const generatedComponents = new Set([
  "dist",
  "node_modules",
  "zig-cache",
  "zig-out",
]);

const protectedWebViewFiles = new Set([
  "frontend/src/replicator-harness.ts",
]);

export const utilityFormatMarkerName = ".replicator-format-v1.json";
const boundedNativeEditableFiles = ["app.zon", "src/app.native", "src/core.ts"] as const;
const boundedNativeProtectedFiles = [
  ".gitignore",
  "README.md",
  "package.json",
  "tsconfig.json",
  "assets/icon.png",
] as const;
const multiModuleBaseFiles = ["app.zon", "src/app.native", "src/core.ts"] as const;
const reactWebViewEditableFiles = ["frontend/index.html"] as const;
const reactWebViewProtectedFiles = [
  "app.zon",
  "build.zig",
  "build.zig.zon",
  "frontend/package-lock.json",
  "frontend/package.json",
  "frontend/vite.config.js",
  "frontend/src/replicator-harness.ts",
] as const;

export type ProjectFilePolicy = {
  readable: readonly string[];
  editable: readonly string[];
  creatable: readonly string[];
  protected: readonly string[];
  digest: readonly string[];
};

export function projectFilePolicy(format: UtilityFormat): ProjectFilePolicy {
  if (format === "native-bounded") {
    return {
      readable: boundedNativeEditableFiles,
      editable: boundedNativeEditableFiles,
      creatable: [],
      protected: boundedNativeProtectedFiles,
      digest: [...boundedNativeEditableFiles, ...boundedNativeProtectedFiles].sort(),
    };
  }
  if (format === "native-multimodule") {
    return {
      readable: multiModuleBaseFiles,
      editable: multiModuleBaseFiles,
      creatable: ["src/<module>.ts"],
      protected: [],
      digest: multiModuleBaseFiles,
    };
  }
  return {
    readable: reactWebViewEditableFiles,
    editable: reactWebViewEditableFiles,
    creatable: [],
    protected: reactWebViewProtectedFiles,
    digest: [...reactWebViewEditableFiles, ...reactWebViewProtectedFiles].sort(),
  };
}

function markerContents(format: UtilityFormat): string {
  return `${JSON.stringify({ version: 1, format })}\n`;
}

export async function createUtilityFormatMarker(
  utilityRoot: string,
  format: UtilityFormat,
): Promise<string> {
  const root = await realpath(utilityRoot);
  const marker = path.join(root, utilityFormatMarkerName);
  const handle = await open(marker, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try {
    await handle.writeFile(markerContents(format), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  return marker;
}

export async function assertUtilityFormatMarker(
  utilityRoot: string,
  format: UtilityFormat,
): Promise<string> {
  const marker = path.join(await realpath(utilityRoot), utilityFormatMarkerName);
  const entry = await lstat(marker);
  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw new Error("Utility Format marker is not a regular file");
  }
  const contents = await readFile(marker, "utf8");
  if (contents !== markerContents(format)) {
    throw new Error("Utility Format marker is missing, changed, or does not match the locked format");
  }
  return createHash("sha256").update(contents).digest("hex");
}

const configuredTemplateRoot = process.env.REPLICATOR_TEMPLATE_ROOT;
if (configuredTemplateRoot && !path.isAbsolute(configuredTemplateRoot)) {
  throw new Error("REPLICATOR_TEMPLATE_ROOT must be an absolute path");
}

export const defaultTemplateRoot = configuredTemplateRoot ?? path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../templates",
);

export function normalizeProjectPath(candidate: string): string | null {
  if (
    candidate.length === 0 ||
    candidate.includes("\\") ||
    candidate.includes("\0") ||
    path.posix.isAbsolute(candidate)
  ) {
    return null;
  }

  const normalized = path.posix.normalize(candidate);
  if (normalized !== candidate || normalized === ".") return null;
  const components = normalized.split("/");
  if (
    components.some(
      (component) =>
        component.length === 0 ||
        component === ".." ||
        component.startsWith(".") ||
        generatedComponents.has(component),
    )
  ) {
    return null;
  }
  return normalized;
}

export function isEditableProjectPath(
  format: UtilityFormat,
  candidate: string,
): boolean {
  const file = normalizeProjectPath(candidate);
  if (!file) return false;

  if (format === "native-bounded") {
    return boundedNativeEditableFiles.includes(file as (typeof boundedNativeEditableFiles)[number]);
  }

  if (format === "native-multimodule") {
    return (
      file === "app.zon" ||
      file === "src/app.native" ||
      /^src\/[A-Za-z][A-Za-z0-9_-]*\.ts$/.test(file)
    );
  }

  if (protectedWebViewFiles.has(file)) return false;
  return (
    file === "frontend/index.html" ||
    /^frontend\/src\/[A-Za-z0-9][A-Za-z0-9_/-]*\.(?:css|ts|tsx)$/.test(file)
  );
}

async function rejectSymlinkComponents(
  projectRoot: string,
  relativePath: string,
): Promise<void> {
  let current = projectRoot;
  const components = relativePath.split("/");
  for (const [index, component] of components.entries()) {
    current = path.join(current, component);
    try {
      const entry = await lstat(current);
      if (entry.isSymbolicLink()) {
        throw new Error(`symbolic links are forbidden: ${relativePath}`);
      }
      if (index < components.length - 1 && !entry.isDirectory()) {
        throw new Error(`path parent is not a directory: ${relativePath}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

export async function resolveEditableProjectPath(
  projectRoot: string,
  format: UtilityFormat,
  candidate: string,
): Promise<{ file: string; absolutePath: string }> {
  const file = normalizeProjectPath(candidate);
  if (!file || !isEditableProjectPath(format, file)) {
    throw new Error(`path is not editable for ${format}: ${candidate}`);
  }

  const canonicalRoot = await realpath(projectRoot);
  await rejectSymlinkComponents(canonicalRoot, file);
  const absolutePath = path.resolve(canonicalRoot, file);
  if (!absolutePath.startsWith(`${canonicalRoot}${path.sep}`)) {
    throw new Error(`path escapes the Utility source root: ${candidate}`);
  }
  return { file, absolutePath };
}

export async function writeEditableProjectFile(
  projectRoot: string,
  format: UtilityFormat,
  candidate: string,
  contents: string,
): Promise<string> {
  if (Buffer.byteLength(contents) > 512 * 1024) {
    throw new Error("source file exceeds the 512 KiB bounded edit limit");
  }
  const { file, absolutePath } = await resolveEditableProjectPath(
    projectRoot,
    format,
    candidate,
  );
  const handle = await open(
    absolutePath,
    constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW,
  );
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  return file;
}

export async function createEditableProjectFile(
  projectRoot: string,
  format: UtilityFormat,
  candidate: string,
  contents: string,
): Promise<string> {
  if (format !== "native-multimodule") throw new Error(`new source files are not allowed for ${format}`);
  if (Buffer.byteLength(contents) > 120 * 1024) throw new Error("source file exceeds the 120 KiB creation limit");
  const { file, absolutePath } = await resolveEditableProjectPath(projectRoot, format, candidate);
  if (!/^src\/[A-Za-z][A-Za-z0-9_-]*\.ts$/.test(file) || file === "src/core.ts") {
    throw new Error("multi-module Native may create only additional top-level TypeScript modules");
  }
  const modules = (await sourceFilesIn(projectRoot, "src")).filter((entry) => entry.endsWith(".ts"));
  if (modules.length >= 8) throw new Error("multi-module Native permits core.ts plus seven additional modules");
  const handle = await open(absolutePath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  return file;
}

async function sourceFilesIn(
  projectRoot: string,
  relativeDirectory: string,
): Promise<string[]> {
  const directory = path.join(projectRoot, relativeDirectory);
  const files: string[] = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return files;
    throw error;
  }

  for (const entry of entries) {
    const file = path.posix.join(relativeDirectory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`symbolic links are forbidden: ${file}`);
    if (entry.name.startsWith(".") || generatedComponents.has(entry.name)) {
      throw new Error(`hidden and generated paths are forbidden in source: ${file}`);
    }
    if (entry.isDirectory()) files.push(...(await sourceFilesIn(projectRoot, file)));
    if (entry.isFile()) files.push(file);
  }
  return files;
}

export async function sourceFiles(
  projectRoot: string,
  format: UtilityFormat,
): Promise<string[]> {
  if (format === "native-bounded") {
    const files = projectFilePolicy(format).digest;
    const canonicalRoot = await realpath(projectRoot);
    for (const file of files) {
      await rejectSymlinkComponents(canonicalRoot, file);
      const entry = await lstat(path.join(projectRoot, file));
      if (entry.isSymbolicLink() || !entry.isFile()) {
        throw new Error(`required bounded Native file is not a regular file: ${file}`);
      }
    }
    return [...files];
  }
  const files = new Set<string>();
  for (const file of ["app.zon"]) {
    const entry = await lstat(path.join(projectRoot, file));
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new Error(`required source file is not a regular file: ${file}`);
    }
    files.add(file);
  }

  if (format !== "react-webview") {
    for (const file of await sourceFilesIn(projectRoot, "src")) {
      files.add(file);
    }
  } else {
    for (const file of [
      "build.zig",
      "build.zig.zon",
      "frontend/index.html",
      "frontend/package-lock.json",
      "frontend/package.json",
      "frontend/vite.config.js",
    ]) {
      const entry = await lstat(path.join(projectRoot, file));
      if (entry.isSymbolicLink() || !entry.isFile()) {
        throw new Error(`required source file is not a regular file: ${file}`);
      }
      files.add(file);
    }
    for (const directory of ["src", "frontend/src"]) {
      for (const file of await sourceFilesIn(projectRoot, directory)) files.add(file);
    }
  }

  return [...files].sort();
}

export async function sourceDigest(
  projectRoot: string,
  format: UtilityFormat,
): Promise<string> {
  const digest = createHash("sha256");
  for (const file of await sourceFiles(projectRoot, format)) {
    const contents = await readFile(path.join(projectRoot, file));
    digest.update(`${file.length}:${file}:${contents.length}:`);
    digest.update(contents);
  }
  return digest.digest("hex");
}

export async function assertProjectPolicy(
  projectRoot: string,
  format: UtilityFormat,
): Promise<void> {
  const files = await sourceFiles(projectRoot, format);
  const manifest = await readFile(path.join(projectRoot, "app.zon"), "utf8");
  if (!/\.name\s*=\s*"generated-app"/.test(manifest)) {
    throw new Error('app.zon must retain .name = "generated-app"');
  }

  if (format === "native-bounded") {
    const allowedRoot = new Set([
      ...boundedNativeEditableFiles.map((file) => file.split("/")[0]!),
      ...boundedNativeProtectedFiles.map((file) => file.split("/")[0]!),
      ".native",
      ".zig-cache",
      "node_modules",
      "zig-out",
    ]);
    for (const entry of await readdir(projectRoot, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error(`symbolic links are forbidden: ${entry.name}`);
      if (!allowedRoot.has(entry.name)) {
        throw new Error(`bounded Native contains unauthorized path: ${entry.name}`);
      }
    }
  }

  if (format === "native-multimodule") {
    const unexpected = files.filter(
      (file) =>
        file !== "app.zon" &&
        file !== "src/app.native" &&
        !/^src\/[A-Za-z][A-Za-z0-9_-]*\.ts$/.test(file),
    );
    if (unexpected.length > 0) {
      throw new Error(`multi-module Native contains unauthorized source: ${unexpected[0]}`);
    }
    const modules = files.filter((file) => file.endsWith(".ts"));
    if (modules.length > 8) {
      throw new Error("multi-module Native permits core.ts plus seven top-level modules");
    }
  }
}

async function copyTemplateDirectory(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`template contains a symbolic link: ${sourcePath}`);
    if (entry.isDirectory()) await copyTemplateDirectory(sourcePath, destinationPath);
    if (entry.isFile()) await copyFile(sourcePath, destinationPath);
  }
}

export async function scaffoldUtility(
  destination: string,
  format: UtilityFormat,
  templateRoot = defaultTemplateRoot,
): Promise<void> {
  try {
    const entries = await readdir(destination);
    if (entries.length > 0) throw new Error("Utility source destination must be empty");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await copyTemplateDirectory(path.join(templateRoot, format), destination);
  await assertProjectPolicy(destination, format);
}
