import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { homedir } from "node:os";
import { lstat, mkdir, readFile, rename, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import { dirname, parse, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { SaxesParser, type SaxesTag } from "saxes";
import { z } from "zod";

const SvgAssetIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/, "Use 1-80 letters, numbers, dots, underscores, or hyphens.");

export const SvgAssetSchema = z.object({
  id: SvgAssetIdSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()).default([]),
  license: z.string().default("custom"),
  decorative: z.boolean().default(false),
  altText: z.string().optional(),
  svg: z.string().min(1).max(200_000)
});

export type SvgAsset = z.infer<typeof SvgAssetSchema>;

export const SvgAssetRegistrySchema = z.object({
  version: z.literal("0.1"),
  assets: z.array(SvgAssetSchema).default([])
});

export type SvgAssetRegistry = z.infer<typeof SvgAssetRegistrySchema>;

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}){1,2}$/;
const FORBIDDEN_XML_PATTERN = /<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i;
const SAFE_ELEMENTS = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "title",
  "desc",
  "defs",
  "marker",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask"
]);
const SAFE_ATTRIBUTES = new Set([
  "aria-label",
  "cx",
  "cy",
  "d",
  "dominant-baseline",
  "fill",
  "fill-opacity",
  "font-family",
  "font-size",
  "font-weight",
  "height",
  "id",
  "marker-end",
  "marker-mid",
  "marker-start",
  "markerHeight",
  "markerWidth",
  "offset",
  "opacity",
  "orient",
  "points",
  "r",
  "refX",
  "refY",
  "role",
  "rx",
  "ry",
  "stop-color",
  "stop-opacity",
  "stroke",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "stroke-width",
  "text-anchor",
  "transform",
  "viewBox",
  "width",
  "x",
  "x1",
  "x2",
  "xmlns",
  "y",
  "y1",
  "y2"
]);
const URL_ATTRIBUTES = new Set(["clip-path", "fill", "href", "marker-end", "marker-mid", "marker-start", "mask", "stroke", "xlink:href"]);
const REGISTRY_LOCK_STALE_MS = 30_000;
const REGISTRY_LOCK_OWNER_FILE = "owner.json";

function assertHexColor(color: string): void {
  if (!HEX_COLOR_PATTERN.test(color)) {
    throw new Error(`Invalid SVG color: ${color}`);
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeElementName(name: string): string {
  if (name.includes(":")) {
    throw new Error(`Namespaced SVG elements are not allowed: ${name}`);
  }

  return name;
}

function isSafeUrlValue(value: string): boolean {
  const trimmed = value.trim();
  return /^#[-_a-zA-Z0-9:.]+$/.test(trimmed) || /^url\(\s*#[-_a-zA-Z0-9:.]+\s*\)$/.test(trimmed);
}

function isSafeAttributeValue(name: string, value: string): boolean {
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    return false;
  }

  if (/url\s*\(/i.test(value)) {
    return isSafeUrlValue(value);
  }

  if (URL_ATTRIBUTES.has(name)) {
    return !/(?:https?:|file:|javascript:|data:|\/\/)/i.test(value) && (value.startsWith("#") || isSafeUrlValue(value));
  }

  return !/(?:https?:|file:|javascript:|data:|\/\/|@import)/i.test(value);
}

function safeAttributeName(attributeName: string): string | undefined {
  const normalized = attributeName.trim();
  const lower = normalized.toLowerCase();

  if (lower.startsWith("on") || lower === "style") {
    return undefined;
  }

  if (lower === "href" || lower === "xlink:href") {
    return lower;
  }

  if (normalized.includes(":")) {
    return undefined;
  }

  return SAFE_ATTRIBUTES.has(normalized) ? normalized : undefined;
}

function serializeSafeAttributes(tag: SaxesTag): string {
  return Object.entries(tag.attributes)
    .map(([rawName, rawAttribute]) => {
      const attribute =
        typeof rawAttribute === "string"
          ? { name: rawName, value: rawAttribute }
          : { name: rawAttribute.name, value: rawAttribute.value };
      const name = safeAttributeName(attribute.name);
      if (!name || !isSafeAttributeValue(name, attribute.value)) {
        return "";
      }

      return ` ${name}="${escapeXml(attribute.value)}"`;
    })
    .join("");
}

export function sanitizeSvg(svg: string): string {
  if (FORBIDDEN_XML_PATTERN.test(svg)) {
    throw new Error("SVG contains forbidden XML declarations.");
  }

  const parser = new SaxesParser({ xmlns: false });
  const output: string[] = [];
  const stack: string[] = [];

  parser.on("opentag", (tag) => {
    const name = normalizeElementName(tag.name);
    if (!SAFE_ELEMENTS.has(name)) {
      throw new Error(`SVG element is not allowed: ${name}`);
    }

    output.push(`<${name}${serializeSafeAttributes(tag)}>`);
    stack.push(name);
  });

  parser.on("closetag", (tag) => {
    const name = normalizeElementName(typeof tag === "string" ? tag : tag.name);
    const expected = stack.pop();
    if (expected !== name) {
      throw new Error(`Unexpected SVG closing tag: ${name}`);
    }

    output.push(`</${name}>`);
  });

  parser.on("text", (text) => {
    if (text.trim()) {
      output.push(escapeXml(text));
    }
  });

  parser.on("cdata", () => {
    throw new Error("SVG CDATA sections are not allowed.");
  });

  parser.write(svg).close();

  const sanitized = output.join("");
  if (!sanitized.startsWith("<svg")) {
    throw new Error("SVG root element is required.");
  }

  return sanitized;
}

export function recolorSvg(svg: string, color: string): string {
  assertHexColor(color);
  const sanitized = sanitizeSvg(svg);
  return sanitized.replace(/\b(fill|stroke)="(?!none)[^"]*"/g, `$1="${color}"`);
}

export function createSimpleIconSvg(name: string, color = "#1d4ed8"): SvgAsset {
  assertHexColor(color);
  const normalizedName = name.trim().toLowerCase();
  const path =
    normalizedName === "check"
      ? "<path d=\"M4 10.5 8.2 14.7 16.5 5.8\" />"
      : normalizedName === "warning"
        ? "<path d=\"M10 3 18 17H2L10 3Z\" /><path d=\"M10 8v4\" /><path d=\"M10 15h.01\" />"
        : "<circle cx=\"10\" cy=\"10\" r=\"7\" /><path d=\"M10 6v5\" /><path d=\"M10 14h.01\" />";

  return SvgAssetSchema.parse({
    id: `icon-${normalizedName || "info"}`,
    title: `${normalizedName || "info"} icon`,
    description: `Simple ${normalizedName || "info"} icon for slide use.`,
    tags: ["icon", normalizedName || "info"],
    license: "generated",
    decorative: false,
    altText: `${normalizedName || "info"} icon`,
    svg: sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`
    )
  });
}

export const BUILTIN_SVG_ASSETS: SvgAsset[] = [
  createSimpleIconSvg("check", "#047857"),
  createSimpleIconSvg("warning", "#b91c1c"),
  createSimpleIconSvg("info", "#1d4ed8")
];

function defaultConfigRoot(): string {
  if (process.env.PPTCREATER_HOME) {
    return resolve(process.env.PPTCREATER_HOME);
  }

  if (process.platform === "win32") {
    return resolve(process.env.APPDATA ?? homedir(), "pptcreater");
  }

  if (process.platform === "darwin") {
    return resolve(homedir(), "Library", "Application Support", "pptcreater");
  }

  return resolve(process.env.XDG_CONFIG_HOME ?? resolve(homedir(), ".config"), "pptcreater");
}

export function getDefaultSvgRegistryPath(): string {
  return process.env.PPTCREATER_SVG_REGISTRY_PATH ?? resolve(defaultConfigRoot(), "assets", "svg", "registry.json");
}

async function readJsonFile(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
  } catch (error) {
    const nodeError = error as Error & { code?: string };
    if (nodeError.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

export async function readSvgAssetRegistry(registryPath = getDefaultSvgRegistryPath()): Promise<SvgAssetRegistry> {
  const registry = await readJsonFile(registryPath);
  if (!registry) {
    return { version: "0.1", assets: [] };
  }

  const parsed = SvgAssetRegistrySchema.parse(registry);
  return {
    version: parsed.version,
    assets: parsed.assets.map((asset) =>
      SvgAssetSchema.parse({
        ...asset,
        svg: sanitizeSvg(asset.svg)
      })
    )
  };
}

async function getPathStats(path: string): Promise<Stats | undefined> {
  try {
    return await lstat(path);
  } catch (error) {
    const nodeError = error as Error & { code?: string };
    if (nodeError.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

async function ensureSafeDirectoryPath(targetDirectory: string): Promise<void> {
  const resolvedDirectory = resolve(targetDirectory);
  const parsed = parse(resolvedDirectory);
  const segments = resolvedDirectory.slice(parsed.root.length).split(/[\\/]+/).filter(Boolean);
  let current = parsed.root;

  for (const segment of segments) {
    current = resolve(current, segment);
    const stats = await getPathStats(current);

    if (stats) {
      if (stats.isSymbolicLink()) {
        throw new Error(`Registry directory cannot contain symbolic links: ${current}`);
      }

      if (!stats.isDirectory()) {
        throw new Error(`Registry path component must be a directory: ${current}`);
      }
    } else {
      await mkdir(current).catch(async (error: Error & { code?: string }) => {
        if (error.code !== "EEXIST") {
          throw error;
        }

        const statsAfterRace = await getPathStats(current);
        if (statsAfterRace?.isSymbolicLink()) {
          throw new Error(`Registry directory cannot contain symbolic links: ${current}`);
        }

        if (!statsAfterRace?.isDirectory()) {
          throw new Error(`Registry path component must be a directory: ${current}`);
        }
      });
    }
  }
}

async function safeWriteRegistryFile(path: string, contents: string): Promise<void> {
  const directory = dirname(path);
  await ensureSafeDirectoryPath(directory);
  const targetStats = await getPathStats(path);
  if (targetStats?.isSymbolicLink()) {
    throw new Error(`Refusing to write registry through a symbolic link: ${path}`);
  }

  const tempPath = resolve(directory, `.registry-${process.pid}-${Date.now()}-${randomUUID()}.tmp`);
  await writeFile(tempPath, contents, { flag: "wx" });
  await rename(tempPath, path);
}

type RegistryLockMetadata = {
  pid: number;
  token: string;
  createdAt: number;
};

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const nodeError = error as Error & { code?: string };
    return nodeError.code === "EPERM";
  }
}

async function readRegistryLockMetadata(lockDir: string): Promise<RegistryLockMetadata | undefined> {
  const stats = await getPathStats(lockDir);
  if (!stats) {
    return undefined;
  }

  if (stats.isSymbolicLink()) {
    throw new Error(`Registry lock cannot be a symbolic link: ${lockDir}`);
  }

  if (!stats.isDirectory()) {
    throw new Error(`Registry lock path must be a directory: ${lockDir}`);
  }

  try {
    const metadata = JSON.parse((await readFile(resolve(lockDir, REGISTRY_LOCK_OWNER_FILE), "utf8")).replace(/^\uFEFF/, "")) as Partial<RegistryLockMetadata>;
    if (typeof metadata.pid === "number" && typeof metadata.token === "string" && typeof metadata.createdAt === "number") {
      return {
        pid: metadata.pid,
        token: metadata.token,
        createdAt: metadata.createdAt
      };
    }
  } catch {
    return {
      pid: 0,
      token: "",
      createdAt: stats.mtimeMs
    };
  }

  return {
    pid: 0,
    token: "",
    createdAt: stats.mtimeMs
  };
}

async function removeStaleLock(lockDir: string): Promise<boolean> {
  const metadata = await readRegistryLockMetadata(lockDir);
  if (!metadata) {
    return true;
  }

  if (isProcessAlive(metadata.pid) || Date.now() - metadata.createdAt <= REGISTRY_LOCK_STALE_MS) {
    return false;
  }

  const staleDir = `${lockDir}.stale-${process.pid}-${Date.now()}-${randomUUID()}`;
  try {
    await rename(lockDir, staleDir);
  } catch (error) {
    const nodeError = error as Error & { code?: string };
    if (nodeError.code === "ENOENT") {
      return true;
    }

    throw error;
  }

  await rm(staleDir, { recursive: true, force: true });
  return true;
}

async function releaseRegistryLock(lockDir: string, token: string): Promise<void> {
  const metadata = await readRegistryLockMetadata(lockDir).catch(() => undefined);
  if (metadata?.token !== token) {
    return;
  }

  await unlink(resolve(lockDir, REGISTRY_LOCK_OWNER_FILE)).catch((error: Error & { code?: string }) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
  });
  await rmdir(lockDir).catch((error: Error & { code?: string }) => {
    if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") {
      throw error;
    }
  });
}

async function withRegistryLock<T>(registryPath: string, operation: () => Promise<T>): Promise<T> {
  const lockDir = `${registryPath}.lock`;
  await ensureSafeDirectoryPath(dirname(registryPath));

  for (let attempt = 0; attempt < 100; attempt += 1) {
    let token = "";
    try {
      await mkdir(lockDir);
      try {
        token = randomUUID();
        await writeFile(resolve(lockDir, REGISTRY_LOCK_OWNER_FILE), JSON.stringify({ pid: process.pid, token, createdAt: Date.now() }), {
          flag: "wx"
        });
        return await operation();
      } finally {
        if (token) {
          await releaseRegistryLock(lockDir, token);
        } else {
          await rmdir(lockDir).catch(() => undefined);
        }
      }
    } catch (error) {
      const nodeError = error as Error & { code?: string };
      if (nodeError.code !== "EEXIST") {
        throw error;
      }

      await removeStaleLock(lockDir);
      await delay(25);
    }
  }

  throw new Error(`Timed out waiting for SVG registry lock: ${registryPath}`);
}

async function writeSvgAssetRegistryUnlocked(registry: SvgAssetRegistry, registryPath = getDefaultSvgRegistryPath()): Promise<void> {
  await safeWriteRegistryFile(registryPath, `${JSON.stringify(SvgAssetRegistrySchema.parse(registry), null, 2)}\n`);
}

export async function writeSvgAssetRegistry(registry: SvgAssetRegistry, registryPath = getDefaultSvgRegistryPath()): Promise<void> {
  await withRegistryLock(registryPath, async () => writeSvgAssetRegistryUnlocked(registry, registryPath));
}

export async function registerSvgAsset(
  input: unknown,
  options: { overwrite?: boolean; registryPath?: string } = {}
): Promise<{ asset: SvgAsset; registryPath: string }> {
  const candidate = SvgAssetSchema.parse(input);
  const asset = SvgAssetSchema.parse({
    ...candidate,
    svg: sanitizeSvg(candidate.svg)
  });
  const registryPath = options.registryPath ?? getDefaultSvgRegistryPath();

  await withRegistryLock(registryPath, async () => {
    const existingBuiltin = BUILTIN_SVG_ASSETS.some((item) => item.id === asset.id);
    const registry = await readSvgAssetRegistry(registryPath);
    const existingIndex = registry.assets.findIndex((item) => item.id === asset.id);

    if (existingBuiltin) {
      throw new Error(`SVG asset "${asset.id}" is built in. Register custom assets with a different id.`);
    }

    if (existingIndex >= 0 && !options.overwrite) {
      throw new Error(`SVG asset "${asset.id}" already exists. Use overwrite to replace it.`);
    }

    const nextAssets = [...registry.assets];
    if (existingIndex >= 0) {
      nextAssets[existingIndex] = asset;
    } else {
      nextAssets.push(asset);
    }

    await writeSvgAssetRegistryUnlocked({ version: "0.1", assets: nextAssets }, registryPath);
  });

  return { asset, registryPath };
}

export async function listSvgAssets(options: { includeBuiltins?: boolean; registryPath?: string } = {}): Promise<SvgAsset[]> {
  const includeBuiltins = options.includeBuiltins ?? true;
  const registry = await readSvgAssetRegistry(options.registryPath);
  return includeBuiltins ? [...BUILTIN_SVG_ASSETS, ...registry.assets] : registry.assets;
}

export function searchSvgAssets(query: string, assets: SvgAsset[] = BUILTIN_SVG_ASSETS): SvgAsset[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return assets;
  }

  return assets.filter((asset) => {
    const haystack = [asset.id, asset.title, asset.description, ...asset.tags].join(" ").toLowerCase();
    return haystack.includes(normalized);
  });
}

export async function searchAllSvgAssets(query: string, options: { registryPath?: string } = {}): Promise<SvgAsset[]> {
  return searchSvgAssets(query, await listSvgAssets({ registryPath: options.registryPath }));
}
