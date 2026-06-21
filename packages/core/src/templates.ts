import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { lstat, mkdir, readFile, rename, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, parse, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { contrastRatio, defaultTokens } from "./color.js";
import { SLIDE_WIDE } from "./layout.js";
import {
  DesignTokensSchema,
  HeaderFooterSchema,
  LocaleSchema,
  SlideSizeSchema,
  TemplateScaffoldSlideSchema,
  type ContentMode,
  type DeckSpec,
  type DesignTokens,
  type Locale,
  type ScaffoldImage,
  type ScaffoldTextBox,
  type SlideBackground,
  type SlideElement,
  type TemplateScaffoldSlide
} from "./schema.js";

export const TemplateLayoutSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  placeholders: z.array(z.string().min(1)).default([])
});

export const TemplateManifestSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/, "Use 1-80 letters, numbers, dots, underscores, or hyphens."),
  name: z.string().min(1),
  locale: LocaleSchema,
  description: z.string().min(1),
  tokens: DesignTokensSchema,
  layouts: z.array(TemplateLayoutSchema).min(1),
  accessibility: z.object({
    minimumBodyFontSize: z.number().min(12),
    minimumContrast: z.number().min(1),
    requiresSlideTitles: z.boolean(),
    requiresReadingOrder: z.boolean(),
    requiresAltText: z.boolean()
  }),
  slideSize: SlideSizeSchema.optional(),
  headerFooter: HeaderFooterSchema.optional(),
  titleSlide: TemplateScaffoldSlideSchema.optional(),
  closingSlide: TemplateScaffoldSlideSchema.optional(),
  tags: z.array(z.string()).default([])
});

export type TemplateManifest = z.infer<typeof TemplateManifestSchema>;

export const STYLE_PROFILES = ["minimal", "stylish", "report", "presentation", "technical"] as const;
export type StyleProfile = (typeof STYLE_PROFILES)[number];

function localeFonts(locale: Locale): { heading: string; body: string; fallback: DesignTokens["typography"]["fallbackFonts"] } {
  if (locale === "ja-JP") {
    return {
      heading: "Yu Gothic",
      body: "Yu Gothic",
      fallback: ["Meiryo", "Hiragino Kaku Gothic ProN", "Arial", "sans-serif"]
    };
  }

  return {
    heading: "Aptos Display",
    body: "Aptos",
    fallback: ["Segoe UI", "Arial", "sans-serif"]
  };
}

export function styleProfileTokens(locale: Locale, profile: StyleProfile): DesignTokens {
  const { heading, body, fallback } = localeFonts(locale);

  if (profile === "stylish") {
    return {
      colors: {
        background: "#0b1020",
        surface: "#151c2f",
        text: "#f8fafc",
        mutedText: "#c6d0df",
        accent: "#2dd4bf",
        danger: "#fda4af",
        success: "#5eead4"
      },
      typography: { headingFont: heading, bodyFont: body, fallbackFonts: fallback, titleSize: 44, bodySize: 22, captionSize: 14 },
      spacing: { margin: 0.6, gutter: 0.3, radius: 0.16 }
    };
  }

  if (profile === "report") {
    return {
      colors: {
        background: "#fbfaf7",
        surface: "#f1eee7",
        text: "#24211d",
        mutedText: "#5f5a52",
        accent: "#8f3d35",
        danger: "#9f3a38",
        success: "#2f6f55"
      },
      typography: { headingFont: heading, bodyFont: body, fallbackFonts: fallback, titleSize: 30, bodySize: 18, captionSize: 12 },
      spacing: { margin: 0.45, gutter: 0.2, radius: 0.02 }
    };
  }

  if (profile === "presentation") {
    return {
      colors: {
        background: "#f7f9fc",
        surface: "#ffffff",
        text: "#152033",
        mutedText: "#53627a",
        accent: "#2f6fb3",
        danger: "#b4534d",
        success: "#2f7d62"
      },
      typography: { headingFont: heading, bodyFont: body, fallbackFonts: fallback, titleSize: 48, bodySize: 26, captionSize: 16 },
      spacing: { margin: 0.6, gutter: 0.3, radius: 0.12 }
    };
  }

  if (profile === "technical") {
    return {
      colors: {
        background: "#101827",
        surface: "#1b283a",
        text: "#f8fafc",
        mutedText: "#c7d2df",
        accent: "#4bb8d8",
        danger: "#fca5a5",
        success: "#67d6b2"
      },
      typography: { headingFont: heading, bodyFont: body, fallbackFonts: fallback, titleSize: 36, bodySize: 22, captionSize: 14 },
      spacing: { margin: 0.5, gutter: 0.24, radius: 0.08 }
    };
  }

  return {
    colors: {
      background: "#ffffff",
      surface: "#f6f5f2",
      text: "#1f2933",
      mutedText: "#59636e",
      accent: "#315f9f",
      danger: "#9f3a38",
      success: "#2f6f55"
    },
    typography: { headingFont: heading, bodyFont: body, fallbackFonts: fallback, titleSize: 38, bodySize: 22, captionSize: 14 },
    spacing: { margin: 0.6, gutter: 0.28, radius: 0.1 }
  };
}

const TEMPLATE_FOR_STYLE: Record<StyleProfile, string> = {
  minimal: "modern-simple",
  stylish: "stylish-editorial",
  report: "report-formal",
  presentation: "presentation-bold",
  technical: "technical-architecture"
};

const STYLE_FOR_CONTENT_MODE: Record<ContentMode, StyleProfile> = {
  presentation: "presentation",
  report: "report",
  technical: "technical",
  handout: "report",
  decision: "minimal"
};

export function styleProfileForContentMode(contentMode: ContentMode): StyleProfile {
  return STYLE_FOR_CONTENT_MODE[contentMode];
}

export function templateForStyleProfile(styleProfile: StyleProfile): string {
  return TEMPLATE_FOR_STYLE[styleProfile];
}

export function recommendTemplateForContentMode(contentMode: ContentMode): { templateId: string; styleProfile: StyleProfile } {
  const styleProfile = styleProfileForContentMode(contentMode);
  return { templateId: TEMPLATE_FOR_STYLE[styleProfile], styleProfile };
}

export const TemplateRegistrySchema = z.object({
  version: z.literal("0.1"),
  templates: z.array(TemplateManifestSchema).default([])
});

export type TemplateRegistry = z.infer<typeof TemplateRegistrySchema>;
export type TemplateRegistrySource = "preset" | "registered";
export type TemplateRegistryEntry = {
  template: TemplateManifest;
  source: TemplateRegistrySource;
  deletable: boolean;
  deleteReason?: string;
};
const REGISTRY_LOCK_STALE_MS = 30_000;
const REGISTRY_LOCK_OWNER_FILE = "owner.json";

export const BUILTIN_TEMPLATES: TemplateManifest[] = [
  {
    id: "minimal-consulting",
    name: "Minimal Consulting",
    locale: "ja-JP",
    description: "Executive-ready slides with strong whitespace, assertion titles, and restrained blue accents.",
    tokens: defaultTokens("ja-JP"),
    layouts: [
      {
        id: "title-content",
        name: "Title and content",
        description: "Assertion title, concise body, and one optional visual.",
        placeholders: ["title", "body", "visual"]
      },
      {
        id: "section-divider",
        name: "Section divider",
        description: "High-contrast section transition with one key message.",
        placeholders: ["title", "subtitle"]
      }
    ],
    accessibility: {
      minimumBodyFontSize: 20,
      minimumContrast: 4.5,
      requiresSlideTitles: true,
      requiresReadingOrder: true,
      requiresAltText: true
    },
    tags: ["consulting", "minimal", "japanese", "accessible"]
  },
  {
    id: "technical-architecture",
    name: "Technical Architecture",
    locale: "en-US",
    description: "Calm technical layouts for architecture diagrams, flows, and implementation plans.",
    tokens: {
      ...defaultTokens("en-US"),
      colors: {
        background: "#0f172a",
        surface: "#1e293b",
        text: "#f8fafc",
        mutedText: "#cbd5e1",
        accent: "#38bdf8",
        danger: "#f87171",
        success: "#34d399"
      }
    },
    layouts: [
      {
        id: "architecture-diagram",
        name: "Architecture diagram",
        description: "Large diagram area with explanatory notes and reading-order-safe labels.",
        placeholders: ["title", "diagram", "notes"]
      },
      {
        id: "comparison",
        name: "Comparison",
        description: "Two-column tradeoff layout with explicit labels beyond color.",
        placeholders: ["title", "left", "right"]
      }
    ],
    accessibility: {
      minimumBodyFontSize: 20,
      minimumContrast: 4.5,
      requiresSlideTitles: true,
      requiresReadingOrder: true,
      requiresAltText: true
    },
    tags: ["technical", "architecture", "dark", "accessible"]
  },
  {
    id: "modern-simple",
    name: "Modern Simple",
    locale: "ja-JP",
    description: "Clean modern slides with generous whitespace, one accent color, and editable shapes. Good for crisp internal decks.",
    tokens: styleProfileTokens("ja-JP", "minimal"),
    layouts: [
      {
        id: "title-content",
        name: "Title and content",
        description: "Assertion title, concise body, and one optional visual.",
        placeholders: ["title", "body", "visual"]
      },
      {
        id: "statement",
        name: "Statement",
        description: "One large statement with generous whitespace.",
        placeholders: ["title", "subtitle"]
      }
    ],
    accessibility: {
      minimumBodyFontSize: 18,
      minimumContrast: 4.5,
      requiresSlideTitles: true,
      requiresReadingOrder: true,
      requiresAltText: true
    },
    tags: ["modern", "simple", "minimal", "accessible"]
  },
  {
    id: "stylish-editorial",
    name: "Stylish Editorial",
    locale: "ja-JP",
    description: "Dark, image-friendly editorial style with bold display type and a vivid accent. Good for brand, vision, and culture decks.",
    tokens: styleProfileTokens("ja-JP", "stylish"),
    layouts: [
      {
        id: "image-hero",
        name: "Image hero",
        description: "Full-bleed image area with overlaid title and short message.",
        placeholders: ["background", "title", "subtitle"]
      },
      {
        id: "value-cards",
        name: "Value cards",
        description: "Translucent cards over a dark background for values or principles.",
        placeholders: ["title", "cards"]
      }
    ],
    accessibility: {
      minimumBodyFontSize: 18,
      minimumContrast: 4.5,
      requiresSlideTitles: true,
      requiresReadingOrder: true,
      requiresAltText: true
    },
    tags: ["stylish", "editorial", "dark", "brand", "accessible"]
  },
  {
    id: "report-formal",
    name: "Report Formal",
    locale: "ja-JP",
    description: "Formal report style with a side index, dense supporting text, and restrained red accent. Good for integrated reports and reviews.",
    tokens: styleProfileTokens("ja-JP", "report"),
    layouts: [
      {
        id: "report-cover",
        name: "Report cover",
        description: "Cover with title block, large image area, and a side table of contents.",
        placeholders: ["title", "image", "index"]
      },
      {
        id: "report-body",
        name: "Report body",
        description: "Two-column body text with a persistent side index and page number.",
        placeholders: ["title", "body", "index"]
      }
    ],
    accessibility: {
      minimumBodyFontSize: 16,
      minimumContrast: 4.5,
      requiresSlideTitles: true,
      requiresReadingOrder: true,
      requiresAltText: true
    },
    tags: ["report", "formal", "dense", "accessible"]
  },
  {
    id: "presentation-bold",
    name: "Presentation Bold",
    locale: "ja-JP",
    description: "Large bold type with minimal words per slide for live presentation. Good for keynotes and talks.",
    tokens: styleProfileTokens("ja-JP", "presentation"),
    layouts: [
      {
        id: "big-statement",
        name: "Big statement",
        description: "One very large message with a small supporting line.",
        placeholders: ["title", "subtitle"]
      },
      {
        id: "three-up",
        name: "Three up",
        description: "Three large concept blocks with icons.",
        placeholders: ["title", "blocks"]
      }
    ],
    accessibility: {
      minimumBodyFontSize: 20,
      minimumContrast: 4.5,
      requiresSlideTitles: true,
      requiresReadingOrder: true,
      requiresAltText: true
    },
    tags: ["presentation", "bold", "keynote", "accessible"]
  }
];

export function listTemplates(): TemplateManifest[] {
  return BUILTIN_TEMPLATES.map((template) => TemplateManifestSchema.parse(template));
}

export function getTemplate(id: string): TemplateManifest | undefined {
  return listTemplates().find((template) => template.id === id);
}

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

export function getDefaultTemplateRegistryPath(): string {
  return process.env.PPTCREATER_TEMPLATE_REGISTRY_PATH ?? resolve(defaultConfigRoot(), "templates", "registry.json");
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

export async function readTemplateRegistry(registryPath = getDefaultTemplateRegistryPath()): Promise<TemplateRegistry> {
  const registry = await readJsonFile(registryPath);
  if (!registry) {
    return { version: "0.1", templates: [] };
  }

  return TemplateRegistrySchema.parse(registry);
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

  throw new Error(`Timed out waiting for template registry lock: ${registryPath}`);
}

async function writeTemplateRegistryUnlocked(registry: TemplateRegistry, registryPath = getDefaultTemplateRegistryPath()): Promise<void> {
  await safeWriteRegistryFile(registryPath, `${JSON.stringify(TemplateRegistrySchema.parse(registry), null, 2)}\n`);
}

export async function writeTemplateRegistry(registry: TemplateRegistry, registryPath = getDefaultTemplateRegistryPath()): Promise<void> {
  await withRegistryLock(registryPath, async () => writeTemplateRegistryUnlocked(registry, registryPath));
}

export async function registerTemplateManifest(
  input: unknown,
  options: { overwrite?: boolean; registryPath?: string } = {}
): Promise<{ template: TemplateManifest; registryPath: string }> {
  const template = TemplateManifestSchema.parse(input);
  const registryPath = options.registryPath ?? getDefaultTemplateRegistryPath();

  await withRegistryLock(registryPath, async () => {
    const registry = await readTemplateRegistry(registryPath);
    const existingBuiltin = listTemplates().some((item) => item.id === template.id);
    const existingIndex = registry.templates.findIndex((item) => item.id === template.id);

    if (existingBuiltin) {
      throw new Error(`Template "${template.id}" is built in. Register custom templates with a different id.`);
    }

    if (existingIndex >= 0 && !options.overwrite) {
      throw new Error(`Template "${template.id}" already exists. Use overwrite to replace it.`);
    }

    const nextTemplates = [...registry.templates];
    if (existingIndex >= 0) {
      nextTemplates[existingIndex] = template;
    } else {
      nextTemplates.push(template);
    }

    await writeTemplateRegistryUnlocked({ version: "0.1", templates: nextTemplates }, registryPath);
  });

  return { template, registryPath };
}

export async function deleteTemplateManifest(
  id: string,
  options: { registryPath?: string } = {}
): Promise<{ template: TemplateManifest; registryPath: string }> {
  const templateId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/, "Use 1-80 letters, numbers, dots, underscores, or hyphens.").parse(id);
  const registryPath = options.registryPath ?? getDefaultTemplateRegistryPath();
  let deletedTemplate: TemplateManifest | undefined;
  const existingBuiltin = listTemplates().some((item) => item.id === templateId);

  await withRegistryLock(registryPath, async () => {
    const registry = await readTemplateRegistry(registryPath);
    const existingIndex = registry.templates.findIndex((item) => item.id === templateId);

    if (existingIndex < 0) {
      if (existingBuiltin) {
        throw new Error(`Template "${templateId}" is built in and cannot be deleted from the custom template registry.`);
      }
      throw new Error(`Template "${templateId}" was not found in the custom template registry.`);
    }

    deletedTemplate = registry.templates[existingIndex];
    const nextTemplates = registry.templates.filter((item) => item.id !== templateId);
    await writeTemplateRegistryUnlocked({ version: "0.1", templates: nextTemplates }, registryPath);
  });

  if (!deletedTemplate) {
    throw new Error(`Template "${templateId}" was not deleted.`);
  }

  return { template: deletedTemplate, registryPath };
}

export async function listAllTemplates(options: { includeBuiltins?: boolean; registryPath?: string } = {}): Promise<TemplateManifest[]> {
  const includeBuiltins = options.includeBuiltins ?? true;
  const registry = await readTemplateRegistry(options.registryPath);
  return includeBuiltins ? [...listTemplates(), ...registry.templates] : registry.templates;
}

export async function listTemplateEntries(options: { includeBuiltins?: boolean; registeredOnly?: boolean; registryPath?: string } = {}): Promise<TemplateRegistryEntry[]> {
  const includeBuiltins = options.includeBuiltins ?? !options.registeredOnly;
  const registry = await readTemplateRegistry(options.registryPath);
  const presetEntries: TemplateRegistryEntry[] = includeBuiltins
    ? listTemplates().map((template) => ({
        template,
        source: "preset",
        deletable: false,
        deleteReason: "Preset templates are built in and cannot be deleted from the custom template registry."
      }))
    : [];
  const registeredEntries: TemplateRegistryEntry[] = registry.templates.map((template) => ({
    template,
    source: "registered",
    deletable: true
  }));
  return [...presetEntries, ...registeredEntries];
}

export async function searchTemplates(query: string, options: { registryPath?: string } = {}): Promise<TemplateManifest[]> {
  const normalized = query.trim().toLowerCase();
  const templates = await listAllTemplates({ registryPath: options.registryPath });
  if (!normalized) {
    return templates;
  }

  return templates.filter((template) => [template.id, template.name, template.description, ...template.tags].join(" ").toLowerCase().includes(normalized));
}

export async function searchTemplateEntries(
  query: string,
  options: { includeBuiltins?: boolean; registeredOnly?: boolean; registryPath?: string } = {}
): Promise<TemplateRegistryEntry[]> {
  const normalized = query.trim().toLowerCase();
  const entries = await listTemplateEntries(options);
  if (!normalized) {
    return entries;
  }

  return entries.filter((entry) =>
    [entry.template.id, entry.template.name, entry.template.description, ...entry.template.tags].join(" ").toLowerCase().includes(normalized)
  );
}

const SCAFFOLD_DEFAULTS: Record<Locale, { title: string; subtitle: string; closingTitle: string; closingSubtitle: string }> = {
  "ja-JP": {
    title: "プレゼンテーションタイトル",
    subtitle: "サブタイトル / 発表者・日付",
    closingTitle: "ご清聴ありがとうございました",
    closingSubtitle: "ご質問・お問い合わせはこちらまで"
  },
  "en-US": {
    title: "Presentation title",
    subtitle: "Subtitle / presenter and date",
    closingTitle: "Thank you",
    closingSubtitle: "Questions and contact details"
  }
};

type ScaffoldSlideInput = {
  id: string;
  layout: string;
  title: string;
  subtitle: string;
  blueprint?: TemplateScaffoldSlide;
  titleRole: "title";
  subtitleRole: "subtitle" | "caption";
  fallbackTitleY: number;
  fallbackSubtitleGap: number;
};

/**
 * Decide a readable text color for a box that also clears the linter's contrast floor. Honors the
 * captured run color when it already meets the required ratio; otherwise it picks the light/dark side
 * with more contrast and, if the soft anchor (#ffffff / #111827) falls short, drops to a pure anchor
 * (#ffffff / #000000) — which guarantees ≥4.58:1 against any solid background, so the scaffold never
 * emits a render-blocking `text.low-contrast` error over mid-tone brand fills.
 */
function scaffoldTextColor(
  box: ScaffoldTextBox | undefined,
  background: SlideBackground | undefined,
  tokens: DesignTokens,
  minRatio: number
): string {
  const backgroundColor = background?.color ?? (background?.imageDataUri ? undefined : tokens.colors.background);
  if (box?.color && (!backgroundColor || contrastRatio(box.color, backgroundColor) >= minRatio)) {
    return box.color;
  }
  if (backgroundColor) {
    const softDark = "#111827";
    const softDarkRatio = contrastRatio(softDark, backgroundColor);
    const whiteRatio = contrastRatio("#ffffff", backgroundColor);
    if (softDarkRatio >= whiteRatio && softDarkRatio >= minRatio) {
      return softDark;
    }
    if (whiteRatio >= minRatio) {
      return "#ffffff";
    }
    return contrastRatio("#000000", backgroundColor) >= whiteRatio ? "#000000" : "#ffffff";
  }
  return box?.color ?? tokens.colors.text;
}

function buildScaffoldSlide(
  input: ScaffoldSlideInput,
  canvasWidth: number,
  canvasHeight: number,
  margin: number,
  tokens: DesignTokens
): DeckSpec["slides"][number] {
  const boundsWidth = Math.min(canvasWidth, SLIDE_WIDE.width);
  const boundsHeight = Math.min(canvasHeight, SLIDE_WIDE.height);
  const contentWidth = Math.max(1, boundsWidth - margin * 2);
  // Keep every emitted box inside the 13.333×7.5 canvas the layout engine and linter assume, so an
  // imported non-16:9 template (or oversized captured geometry) can never trip the non-polish-fixable
  // `layout.out-of-bounds` error that would abort rendering.
  const fitBox = (x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number } => {
    const cw = Math.min(Math.max(w, 0.1), boundsWidth);
    const ch = Math.min(Math.max(h, 0.1), boundsHeight);
    const cx = Math.max(0, Math.min(x, boundsWidth - cw));
    const cy = Math.max(0, Math.min(y, boundsHeight - ch));
    return { x: cx, y: cy, w: cw, h: ch };
  };
  const blueprint = input.blueprint;
  const background = blueprint?.background;
  const elements: SlideElement[] = [];
  let readingOrder = 1;

  for (const [index, logo] of (blueprint?.logos ?? []).entries()) {
    const image: ScaffoldImage = logo;
    const box = fitBox(image.x, image.y, image.w, image.h);
    elements.push({
      id: `${input.id}-logo-${index + 1}`,
      type: "image",
      dataUri: image.dataUri,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      decorative: !image.altText,
      ...(image.altText ? { altText: image.altText } : {}),
      readingOrder: readingOrder++
    });
  }

  const titleBox = blueprint?.titleBox;
  const titleColor = scaffoldTextColor(titleBox, background, tokens, 4.5);
  const contrastReference = background?.color ?? (background?.imageDataUri ? (titleColor === "#ffffff" ? "#1f2937" : "#ffffff") : undefined);
  const titleGeo = fitBox(titleBox?.x ?? margin, titleBox?.y ?? input.fallbackTitleY, titleBox?.w ?? contentWidth, titleBox?.h ?? 1.4);
  elements.push({
    id: `${input.id}-heading`,
    type: "text",
    role: input.titleRole,
    text: input.title,
    x: titleGeo.x,
    y: titleGeo.y,
    w: titleGeo.w,
    h: titleGeo.h,
    align: titleBox?.align ?? "center",
    bold: titleBox?.bold ?? true,
    color: titleColor,
    ...(contrastReference ? { contrastBackground: contrastReference } : {}),
    ...(titleBox?.fontSize ? { fontSize: titleBox.fontSize } : {}),
    decorative: false,
    readingOrder: readingOrder++
  });

  const subtitleBox = blueprint?.subtitleBox;
  const subtitleColor = scaffoldTextColor(subtitleBox, background, tokens, 4.5);
  const subtitleYRaw = subtitleBox?.y ?? (titleBox ? titleBox.y + titleBox.h + 0.2 : input.fallbackTitleY + input.fallbackSubtitleGap);
  const subtitleGeo = fitBox(subtitleBox?.x ?? margin, subtitleYRaw, subtitleBox?.w ?? contentWidth, subtitleBox?.h ?? 0.9);
  elements.push({
    id: `${input.id}-subtitle`,
    type: "text",
    role: input.subtitleRole,
    text: input.subtitle,
    x: subtitleGeo.x,
    y: subtitleGeo.y,
    w: subtitleGeo.w,
    h: subtitleGeo.h,
    align: subtitleBox?.align ?? "center",
    bold: subtitleBox?.bold ?? false,
    color: subtitleColor,
    ...(contrastReference ? { contrastBackground: contrastReference } : {}),
    ...(subtitleBox?.fontSize ? { fontSize: subtitleBox.fontSize } : {}),
    decorative: false,
    readingOrder: readingOrder++
  });

  return {
    id: input.id,
    title: input.title,
    layout: input.layout,
    ...(background ? { background } : {}),
    elements
  };
}

/**
 * Build a starter, editable DeckSpec from a template so an imported template can be reused
 * immediately. Emits a title slide and a closing slide that reproduce the source template's visual
 * identity — background fill/image, logos, and the title/subtitle placement captured at import —
 * swapping only the text. Carries the template tokens, slide size, and header/footer through so the
 * rendered .pptx reflects the imported design. Falls back to centered text when no blueprint visuals
 * were captured, staying within the real canvas so non-16:9 imported sizes still render cleanly.
 */
export function scaffoldDeckFromTemplate(
  template: TemplateManifest,
  options: { title?: string; subtitle?: string; locale?: Locale } = {}
): DeckSpec {
  const locale = options.locale ?? template.locale;
  const defaults = SCAFFOLD_DEFAULTS[locale];
  const canvasWidth = template.slideSize?.widthInches ?? 13.333;
  const canvasHeight = template.slideSize?.heightInches ?? 7.5;
  const margin = template.tokens.spacing.margin;

  const title = options.title ?? template.titleSlide?.title ?? defaults.title;
  const subtitle = options.subtitle ?? template.titleSlide?.subtitle ?? defaults.subtitle;
  const closingTitle = template.closingSlide?.title ?? defaults.closingTitle;
  const closingSubtitle = template.closingSlide?.subtitle ?? defaults.closingSubtitle;

  const titleY = Math.max(0.5, canvasHeight / 2 - 1.1);
  const closingY = Math.max(0.5, canvasHeight / 2 - 0.9);

  const titleSlide = buildScaffoldSlide(
    {
      id: "title",
      layout: "title-slide",
      title,
      subtitle,
      blueprint: template.titleSlide,
      titleRole: "title",
      subtitleRole: "subtitle",
      fallbackTitleY: titleY,
      fallbackSubtitleGap: 1.5
    },
    canvasWidth,
    canvasHeight,
    margin,
    template.tokens
  );

  const closingSlide = buildScaffoldSlide(
    {
      id: "closing",
      layout: "closing-slide",
      title: closingTitle,
      subtitle: closingSubtitle,
      blueprint: template.closingSlide,
      titleRole: "title",
      subtitleRole: "caption",
      fallbackTitleY: closingY,
      fallbackSubtitleGap: 1.4
    },
    canvasWidth,
    canvasHeight,
    margin,
    template.tokens
  );

  const deck: DeckSpec = {
    version: "0.1",
    title,
    locale,
    template: template.id,
    tokens: template.tokens,
    ...(template.slideSize ? { slideSize: template.slideSize } : {}),
    ...(template.headerFooter ? { headerFooter: template.headerFooter } : {}),
    slides: [titleSlide, closingSlide],
    metadata: {
      keywords: [...template.tags],
      sources: []
    }
  };

  return deck;
}
