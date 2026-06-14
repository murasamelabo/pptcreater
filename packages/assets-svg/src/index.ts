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

export const BUILTIN_ICON_NAMES = [
  "check",
  "warning",
  "info",
  "arrow-right",
  "cloud",
  "database",
  "server",
  "user-group",
  "chart-up",
  "shield",
  "lightbulb",
  "workflow",
  "spark",
  "rocket",
  "presentation"
] as const;

export type BuiltinIconName = (typeof BUILTIN_ICON_NAMES)[number];

type BuiltinIconDefinition = {
  title: string;
  description: string;
  tags: string[];
  path: string;
};

const BUILTIN_ICON_DEFINITIONS: Record<BuiltinIconName, BuiltinIconDefinition> = {
  check: {
    title: "Check icon",
    description: "Check mark for completion or approval.",
    tags: ["icon", "check", "success", "approval"],
    path: '<path d="M4 10.5 8.2 14.7 16.5 5.8" />'
  },
  warning: {
    title: "Warning icon",
    description: "Warning triangle for risks or cautions.",
    tags: ["icon", "warning", "risk", "caution"],
    path: '<path d="M10 3 18 17H2L10 3Z" /><path d="M10 8v4" /><path d="M10 15h.01" />'
  },
  info: {
    title: "Info icon",
    description: "Information icon for notes or context.",
    tags: ["icon", "info", "note", "context"],
    path: '<circle cx="10" cy="10" r="7" /><path d="M10 9v5" /><path d="M10 6h.01" />'
  },
  "arrow-right": {
    title: "Arrow right icon",
    description: "Right arrow for flow or next step.",
    tags: ["icon", "arrow", "flow", "next"],
    path: '<path d="M4 10h11" /><path d="M11 6l4 4-4 4" />'
  },
  cloud: {
    title: "Cloud icon",
    description: "Cloud icon for cloud platforms or remote services.",
    tags: ["icon", "cloud", "platform", "infrastructure"],
    path: '<path d="M7 15h8.3A3.7 3.7 0 0 0 16 7.7 5.2 5.2 0 0 0 6.2 6 4.5 4.5 0 0 0 7 15Z" />'
  },
  database: {
    title: "Database icon",
    description: "Database cylinder for storage or data sources.",
    tags: ["icon", "database", "data", "storage"],
    path: '<ellipse cx="10" cy="5" rx="6" ry="2.5" /><path d="M4 5v8c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5" /><path d="M4 9c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" />'
  },
  server: {
    title: "Server icon",
    description: "Server rack for compute or backend components.",
    tags: ["icon", "server", "compute", "backend"],
    path: '<rect x="4" y="4" width="12" height="5" rx="1.2" /><rect x="4" y="11" width="12" height="5" rx="1.2" /><path d="M7 6.5h.01M7 13.5h.01M10 6.5h3M10 13.5h3" />'
  },
  "user-group": {
    title: "User group icon",
    description: "User group for audience, customers, or teams.",
    tags: ["icon", "user", "group", "audience", "team"],
    path: '<circle cx="7.5" cy="7" r="2.5" /><circle cx="14" cy="8" r="2" /><path d="M3 16c.8-2.5 2.4-4 4.5-4s3.7 1.5 4.5 4" /><path d="M11.5 13.3c1.9.2 3.2 1.2 4 2.7" />'
  },
  "chart-up": {
    title: "Chart up icon",
    description: "Rising chart for growth or improvement.",
    tags: ["icon", "chart", "growth", "analytics"],
    path: '<path d="M4 16h12" /><path d="M5 14l3.4-3.4 2.6 2.1L16 6" /><path d="M12.5 6H16v3.5" />'
  },
  shield: {
    title: "Shield icon",
    description: "Shield for security, governance, or reliability.",
    tags: ["icon", "shield", "security", "governance"],
    path: '<path d="M10 3 16 5v4.7c0 3.4-2.2 5.9-6 7.3-3.8-1.4-6-3.9-6-7.3V5l6-2Z" /><path d="M7.5 10.3 9.3 12 12.8 8" />'
  },
  lightbulb: {
    title: "Lightbulb icon",
    description: "Lightbulb for ideas or insights.",
    tags: ["icon", "idea", "insight", "innovation"],
    path: '<path d="M7 9a3 3 0 1 1 6 0c0 1.2-.6 2-1.4 2.8-.5.5-.8 1.1-.8 1.7H9.2c0-.6-.3-1.2-.8-1.7C7.6 11 7 10.2 7 9Z" /><path d="M8.8 16h2.4" /><path d="M9 13.5h2" />'
  },
  workflow: {
    title: "Workflow icon",
    description: "Connected nodes for process or architecture flows.",
    tags: ["icon", "workflow", "process", "architecture"],
    path: '<rect x="3" y="4" width="5" height="4" rx="1" /><rect x="12" y="4" width="5" height="4" rx="1" /><rect x="7.5" y="13" width="5" height="4" rx="1" /><path d="M8 6h4" /><path d="M10 8v5" />'
  },
  spark: {
    title: "Spark icon",
    description: "Spark for emphasis, quality, or AI moments.",
    tags: ["icon", "spark", "quality", "ai"],
    path: '<path d="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6L10 3Z" /><path d="M16 14l.6 1.4L18 16l-1.4.6L16 18l-.6-1.4L14 16l1.4-.6L16 14Z" />'
  },
  rocket: {
    title: "Rocket icon",
    description: "Rocket for launch, acceleration, or growth.",
    tags: ["icon", "rocket", "launch", "growth"],
    path: '<path d="M11 4c2.5-.7 4.2-.3 5 1-.7 3.1-2.4 5.8-5 8l-4-4c2.2-2.6 4.9-4.3 8-5Z" /><path d="M7 9 4 10l-1 3 3-1" /><path d="M11 13l-1 3-3 1 1-3" /><circle cx="12.8" cy="7.2" r="1" />'
  },
  presentation: {
    title: "Presentation icon",
    description: "Presentation screen for slide decks or reporting.",
    tags: ["icon", "presentation", "slides", "report"],
    path: '<rect x="3" y="4" width="14" height="9" rx="1.5" /><path d="M10 13v4" /><path d="M7 17h6" /><path d="M6.5 10.5 9 8l2 1.5 2.5-3" />'
  }
};

export type IconSourceCatalog = {
  id: string;
  name: string;
  url: string;
  licenseNote: string;
  registrationNote: string;
};

export const ICON_SOURCE_CATALOGS: IconSourceCatalog[] = [
  {
    id: "fluentui-system-icons",
    name: "Microsoft Fluent UI System Icons",
    url: "https://github.com/microsoft/fluentui-system-icons",
    licenseNote: "Use according to the upstream repository license.",
    registrationNote: "Good source for general UI icons. Register selected SVGs with register_svg_asset."
  },
  {
    id: "google-material-symbols",
    name: "Google Material Symbols",
    url: "https://fonts.google.com/icons",
    licenseNote: "Use according to Google Fonts / Material Symbols license terms.",
    registrationNote: "Good source for generic product, action, and object icons."
  },
  {
    id: "aws-architecture-icons",
    name: "AWS Architecture Icons",
    url: "https://aws.amazon.com/jp/architecture/icons/",
    licenseNote: "Use according to AWS architecture icon terms and brand guidelines.",
    registrationNote: "Use for AWS architecture diagrams after confirming the intended brand usage."
  },
  {
    id: "azure-architecture-icons",
    name: "Azure Architecture Icons",
    url: "https://learn.microsoft.com/ja-jp/azure/architecture/icons/",
    licenseNote: "Use according to Microsoft architecture icon terms and brand guidelines.",
    registrationNote: "Use for Azure architecture diagrams after confirming the intended brand usage."
  },
  {
    id: "entra-architecture-icons",
    name: "Microsoft Entra Architecture Icons",
    url: "https://learn.microsoft.com/ja-jp/entra/architecture/architecture-icons",
    licenseNote: "Use according to Microsoft icon terms and brand guidelines.",
    registrationNote: "Use for identity/security architecture diagrams."
  },
  {
    id: "microsoft-365-architecture-icons",
    name: "Microsoft 365 Architecture Icons and Templates",
    url: "https://learn.microsoft.com/ja-jp/previous-versions/microsoft-365/solutions/architecture-icons-templates",
    licenseNote: "Use according to Microsoft icon terms and brand guidelines.",
    registrationNote: "Use for Microsoft 365 solution diagrams."
  },
  {
    id: "dynamics-365-icons",
    name: "Dynamics 365 Icons",
    url: "https://learn.microsoft.com/ja-jp/dynamics365/get-started/icons",
    licenseNote: "Use according to Microsoft icon terms and brand guidelines.",
    registrationNote: "Use for Dynamics 365 solution slides."
  },
  {
    id: "power-platform-icons",
    name: "Power Platform Icons",
    url: "https://learn.microsoft.com/ja-jp/power-platform/guidance/icons",
    licenseNote: "Use according to Microsoft icon terms and brand guidelines.",
    registrationNote: "Use for Power Platform architecture and governance slides."
  },
  {
    id: "google-cloud-icons",
    name: "Google Cloud Icons",
    url: "https://cloud.google.com/icons?hl=ja",
    licenseNote: "Use according to Google Cloud icon terms and brand guidelines.",
    registrationNote: "Use for Google Cloud architecture diagrams after confirming the intended brand usage."
  }
];

export function listIconSourceCatalogs(): IconSourceCatalog[] {
  return [...ICON_SOURCE_CATALOGS];
}

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
const PAINT_ATTRIBUTES = new Set(["fill", "stroke"]);
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

  if (name === "xmlns") {
    return value === "http://www.w3.org/2000/svg";
  }

  if (/url\s*\(/i.test(value)) {
    return isSafeUrlValue(value);
  }

  if (URL_ATTRIBUTES.has(name)) {
    const hasUnsafeProtocol = /(?:https?:|file:|javascript:|data:|\/\/)/i.test(value);
    if (hasUnsafeProtocol) {
      return false;
    }

    if (PAINT_ATTRIBUTES.has(name) && !/url\s*\(/i.test(value)) {
      return /^[#a-zA-Z0-9(),.%\s-]+$/.test(value);
    }

    return value.startsWith("#") || isSafeUrlValue(value);
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
  if (!BUILTIN_ICON_NAMES.includes(normalizedName as BuiltinIconName)) {
    throw new Error(`Unsupported built-in icon name: ${name}`);
  }

  const iconName = normalizedName as BuiltinIconName;
  const definition = BUILTIN_ICON_DEFINITIONS[iconName];

  return SvgAssetSchema.parse({
    id: `icon-${iconName}`,
    title: definition.title,
    description: definition.description,
    tags: definition.tags,
    license: "generated-free",
    decorative: false,
    altText: definition.title,
    svg: sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${definition.path}</svg>`
    )
  });
}

const ICON_COLOR_BY_NAME: Partial<Record<BuiltinIconName, string>> = {
  check: "#047857",
  warning: "#b91c1c",
  info: "#1d4ed8",
  shield: "#0f766e",
  "chart-up": "#047857",
  spark: "#7c3aed",
  rocket: "#ea580c",
  cloud: "#0284c7"
};

export const BUILTIN_SVG_ASSETS: SvgAsset[] = BUILTIN_ICON_NAMES.map((name) => createSimpleIconSvg(name, ICON_COLOR_BY_NAME[name] ?? "#1d4ed8"));

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
