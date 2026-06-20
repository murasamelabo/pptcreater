import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { createRequire } from "node:module";
import {
  defaultTokens,
  registerTemplateManifest,
  TemplateManifestSchema,
  type DesignTokens,
  type HeaderFooter,
  type Locale,
  type SlideSize,
  type TemplateManifest,
  type TemplateScaffoldSlide
} from "@pptcreater/core";

const require = createRequire(import.meta.url);

type ZipEntry = { async(type: "string"): Promise<string> };
type ZipArchive = {
  files: Record<string, unknown>;
  file(name: string): ZipEntry | null;
};
const JSZip = require("jszip") as { loadAsync(data: Buffer): Promise<ZipArchive> };

const EMU_PER_INCH = 914400;

/** Inner XML of the first `<prefix:tag ...>...</prefix:tag>` element (prefix optional). */
function innerXml(xml: string, tag: string): string | undefined {
  const pattern = new RegExp(`<(?:[a-zA-Z]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[a-zA-Z]+:)?${tag}>`, "i");
  return pattern.exec(xml)?.[1];
}

/** The full opening tag (attributes) of the first matching self-closing or open element. */
function openingTag(xml: string, tag: string): string | undefined {
  const pattern = new RegExp(`<(?:[a-zA-Z]+:)?${tag}(\\s[^>]*?)?/?>`, "i");
  return pattern.exec(xml)?.[0];
}

function attribute(tag: string | undefined, name: string): string | undefined {
  if (!tag) {
    return undefined;
  }
  const match = new RegExp(`\\b${name}="([^"]*)"`, "i").exec(tag);
  return match?.[1];
}

function normalizeHex(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const hex = value.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `#${hex.toLowerCase()}`;
  }
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex.toLowerCase()}`;
  }
  return undefined;
}

/** Resolve a theme color slot (e.g. `dk1`, `accent1`) to a hex string. */
export function themeColor(themeXml: string, slot: string): string | undefined {
  const scheme = innerXml(themeXml, "clrScheme") ?? themeXml;
  const slotXml = innerXml(scheme, slot);
  if (!slotXml) {
    return undefined;
  }
  const srgb = attribute(openingTag(slotXml, "srgbClr"), "val");
  if (srgb) {
    return normalizeHex(srgb);
  }
  const sys = attribute(openingTag(slotXml, "sysClr"), "lastClr");
  return normalizeHex(sys);
}

function themeFont(themeXml: string, slot: "majorFont" | "minorFont"): { latin?: string; ea?: string } {
  const scheme = innerXml(themeXml, "fontScheme") ?? themeXml;
  const slotXml = innerXml(scheme, slot) ?? "";
  const latin = attribute(openingTag(slotXml, "latin"), "typeface");
  const ea = attribute(openingTag(slotXml, "ea"), "typeface");
  return {
    latin: latin && latin.trim() ? latin.trim() : undefined,
    ea: ea && ea.trim() ? ea.trim() : undefined
  };
}

function channels(hex: string): { r: number; g: number; b: number } {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

/** Pick the accent that best fits a semantic role (red for danger, green for success). */
function pickSemanticAccent(accents: string[], role: "danger" | "success"): string | undefined {
  let best: { hex: string; score: number } | undefined;
  for (const hex of accents) {
    const { r, g, b } = channels(hex);
    const score = role === "danger" ? r - Math.max(g, b) : g - Math.max(r, b);
    if (score > 24 && (!best || score > best.score)) {
      best = { hex, score };
    }
  }
  return best?.hex;
}

export function mapThemeToTokens(themeXml: string, base: DesignTokens): DesignTokens {
  const accents = ["accent1", "accent2", "accent3", "accent4", "accent5", "accent6"]
    .map((slot) => themeColor(themeXml, slot))
    .filter((value): value is string => Boolean(value));

  const major = themeFont(themeXml, "majorFont");
  const minor = themeFont(themeXml, "minorFont");
  const headingFont = major.latin ?? major.ea ?? base.typography.headingFont;
  const bodyFont = minor.latin ?? minor.ea ?? base.typography.bodyFont;
  const eaFonts = [major.ea, minor.ea].filter((value): value is string => Boolean(value));
  const fallbackFonts = Array.from(new Set([...eaFonts, ...base.typography.fallbackFonts]));

  return {
    colors: {
      background: themeColor(themeXml, "lt1") ?? base.colors.background,
      surface: themeColor(themeXml, "lt2") ?? base.colors.surface,
      text: themeColor(themeXml, "dk1") ?? base.colors.text,
      mutedText: themeColor(themeXml, "dk2") ?? base.colors.mutedText,
      accent: accents[0] ?? base.colors.accent,
      danger: pickSemanticAccent(accents, "danger") ?? base.colors.danger,
      success: pickSemanticAccent(accents, "success") ?? base.colors.success
    },
    typography: {
      ...base.typography,
      headingFont,
      bodyFont,
      fallbackFonts
    },
    spacing: base.spacing
  };
}

function aspectLabel(width: number, height: number, type?: string): string {
  if (type) {
    const map: Record<string, string> = {
      screen16x9: "16:9",
      screen16x10: "16:10",
      screen4x3: "4:3"
    };
    if (map[type]) {
      return map[type];
    }
  }
  const ratio = width / height;
  if (Math.abs(ratio - 16 / 9) < 0.03) {
    return "16:9";
  }
  if (Math.abs(ratio - 4 / 3) < 0.03) {
    return "4:3";
  }
  if (Math.abs(ratio - 16 / 10) < 0.03) {
    return "16:10";
  }
  return `${Math.round(ratio * 100) / 100}:1`;
}

export function parseSlideSize(presentationXml: string): SlideSize | undefined {
  const tag = openingTag(presentationXml, "sldSz");
  const cx = Number(attribute(tag, "cx"));
  const cy = Number(attribute(tag, "cy"));
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || cx <= 0 || cy <= 0) {
    return undefined;
  }
  const widthInches = Math.round((cx / EMU_PER_INCH) * 1000) / 1000;
  const heightInches = Math.round((cy / EMU_PER_INCH) * 1000) / 1000;
  return { widthInches, heightInches, aspect: aspectLabel(widthInches, heightInches, attribute(tag, "type")) };
}

/** Concatenated text of every `<a:t>` run inside a fragment. */
function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function runText(fragment: string | undefined): string | undefined {
  if (!fragment) {
    return undefined;
  }
  const text = decodeXmlEntities(
    Array.from(fragment.matchAll(/<(?:[a-zA-Z]+:)?t>([\s\S]*?)<\/(?:[a-zA-Z]+:)?t>/gi))
      .map((match) => match[1])
      .join("")
  ).trim();
  return text ? text : undefined;
}

/** The `<p:sp>...</p:sp>` shape whose placeholder is of the given type. */
function placeholderShape(xml: string, phType: string): string | undefined {
  const shapes = xml.match(/<(?:[a-zA-Z]+:)?sp>[\s\S]*?<\/(?:[a-zA-Z]+:)?sp>/gi) ?? [];
  return shapes.find((shape) => new RegExp(`<(?:[a-zA-Z]+:)?ph\\b[^>]*\\btype="${phType}"`, "i").test(shape));
}

function hasPlaceholder(xml: string, phType: string): boolean {
  return new RegExp(`<(?:[a-zA-Z]+:)?ph\\b[^>]*\\btype="${phType}"`, "i").test(xml);
}

export function parseHeaderFooter(masterXml: string, layoutXmls: string[]): HeaderFooter | undefined {
  const hf = openingTag(masterXml, "hf");
  const explicitlyHidden = (name: string): boolean => attribute(hf, name) === "0";

  const showFooter = hasPlaceholder(masterXml, "ftr") && !explicitlyHidden("ftr");
  const showSlideNumber = hasPlaceholder(masterXml, "sldNum") && !explicitlyHidden("sldNum");
  const showDate = hasPlaceholder(masterXml, "dt") && !explicitlyHidden("dt");

  let footerText: string | undefined;
  for (const xml of [masterXml, ...layoutXmls]) {
    footerText = runText(placeholderShape(xml, "ftr"));
    if (footerText) {
      break;
    }
  }

  let dateText: string | undefined;
  const dateShape = placeholderShape(masterXml, "dt");
  if (dateShape && !/<(?:[a-zA-Z]+:)?fld\b/i.test(dateShape)) {
    dateText = runText(dateShape);
  }

  if (!showFooter && !showSlideNumber && !showDate) {
    return undefined;
  }

  return {
    showFooter,
    showSlideNumber,
    showDate,
    ...(footerText ? { footerText } : {}),
    ...(dateText ? { dateText } : {})
  };
}

export function parseTitleSlide(layoutXmls: string[]): TemplateScaffoldSlide | undefined {
  const titleLayout = layoutXmls.find((xml) => hasPlaceholder(xml, "ctrTitle"));
  if (!titleLayout) {
    return undefined;
  }
  const title = runText(placeholderShape(titleLayout, "ctrTitle"));
  const subtitle = runText(placeholderShape(titleLayout, "subTitle"));
  if (!title && !subtitle) {
    return undefined;
  }
  return { ...(title ? { title } : {}), ...(subtitle ? { subtitle } : {}) };
}

const CLOSING_PATTERN = /clos|thank|end|wrap[- ]?up|終了|おわり|まとめ|結び|ご清聴|質疑/i;

export function parseClosingSlide(layoutXmls: string[]): TemplateScaffoldSlide | undefined {
  const closingLayout = layoutXmls.find((xml) => {
    const name = attribute(openingTag(xml, "cSld"), "name") ?? "";
    return CLOSING_PATTERN.test(name);
  });
  if (!closingLayout) {
    return undefined;
  }
  const title = runText(placeholderShape(closingLayout, "title") ?? placeholderShape(closingLayout, "ctrTitle"));
  const subtitle = runText(placeholderShape(closingLayout, "subTitle") ?? placeholderShape(closingLayout, "body"));
  if (!title && !subtitle) {
    return undefined;
  }
  return { ...(title ? { title } : {}), ...(subtitle ? { subtitle } : {}) };
}

function sanitizeId(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || "imported-template";
}

function inferLocale(themeXml: string, explicit?: Locale): Locale {
  if (explicit) {
    return explicit;
  }
  const major = themeFont(themeXml, "majorFont");
  const minor = themeFont(themeXml, "minorFont");
  const fonts = [major.latin, major.ea, minor.latin, minor.ea].filter((value): value is string => Boolean(value)).join(" ");
  if (/[\u3040-\u30ff\u4e00-\u9faf]/.test(fonts) || /yu gothic|meiryo|hiragino|游|ＭＳ|ms p?(gothic|mincho)|游明朝|游ゴシック/i.test(fonts)) {
    return "ja-JP";
  }
  return "en-US";
}

function buildLayouts(layoutEntries: { name: string; type?: string; placeholders: string[] }[]): TemplateManifest["layouts"] {
  const used = new Set<string>();
  const layouts = layoutEntries.map((entry, index) => {
    let id = sanitizeId(entry.name || entry.type || `layout-${index + 1}`);
    while (used.has(id)) {
      id = `${id}-${index + 1}`;
    }
    used.add(id);
    return {
      id,
      name: entry.name || entry.type || `Layout ${index + 1}`,
      description: `Imported ${entry.type ?? "slide"} layout from the source presentation.`,
      placeholders: entry.placeholders
    };
  });

  return layouts.length > 0
    ? layouts
    : [
        {
          id: "title-content",
          name: "Title and content",
          description: "Imported default layout.",
          placeholders: ["title", "body"]
        }
      ];
}

function placeholderTypes(xml: string): string[] {
  return Array.from(new Set(Array.from(xml.matchAll(/<(?:[a-zA-Z]+:)?ph\b[^>]*\btype="([^"]+)"/gi)).map((match) => match[1])));
}

export type ImportTemplateOptions = {
  id?: string;
  name?: string;
  locale?: Locale;
  tags?: string[];
};

/** Extract a reusable TemplateManifest from raw .pptx bytes. */
export async function extractTemplateManifestFromPptx(data: Buffer, options: ImportTemplateOptions = {}): Promise<TemplateManifest> {
  const zip = await JSZip.loadAsync(data);
  const names = Object.keys(zip.files);

  const themeName = names.find((name) => /^ppt\/theme\/theme\d+\.xml$/i.test(name)) ?? names.find((name) => /theme.*\.xml$/i.test(name));
  const themeXml = themeName ? await (zip.file(themeName)?.async("string") ?? Promise.resolve("")) : "";

  const presentationXml = (await zip.file("ppt/presentation.xml")?.async("string")) ?? "";

  const masterName = names.find((name) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/i.test(name));
  const masterXml = masterName ? ((await zip.file(masterName)?.async("string")) ?? "") : "";

  const layoutNames = names.filter((name) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/i.test(name)).sort();
  const layoutXmls: string[] = [];
  const layoutEntries: { name: string; type?: string; placeholders: string[] }[] = [];
  for (const name of layoutNames) {
    const xml = (await zip.file(name)?.async("string")) ?? "";
    layoutXmls.push(xml);
    layoutEntries.push({
      name: attribute(openingTag(xml, "cSld"), "name") ?? "",
      type: attribute(openingTag(xml, "sldLayout"), "type"),
      placeholders: placeholderTypes(xml)
    });
  }

  const locale = inferLocale(themeXml, options.locale);
  const base = defaultTokens(locale);
  const tokens = themeXml ? mapThemeToTokens(themeXml, base) : base;

  const slideSize = parseSlideSize(presentationXml);
  const headerFooter = masterXml ? parseHeaderFooter(masterXml, layoutXmls) : undefined;
  const titleSlide = parseTitleSlide(layoutXmls);
  const closingSlide = parseClosingSlide(layoutXmls);

  const baseName = options.name ?? "Imported Template";
  const id = sanitizeId(options.id ?? baseName);

  const tags = Array.from(
    new Set([
      "imported",
      ...(slideSize?.aspect ? [slideSize.aspect] : []),
      ...(options.tags ?? [])
    ])
  );

  const manifest: TemplateManifest = {
    id,
    name: baseName,
    locale,
    description: `Template imported from a PowerPoint file (colors, fonts${slideSize ? ", slide size" : ""}${headerFooter ? ", header/footer" : ""}).`,
    tokens,
    layouts: buildLayouts(layoutEntries),
    accessibility: {
      minimumBodyFontSize: 18,
      minimumContrast: 4.5,
      requiresSlideTitles: true,
      requiresReadingOrder: true,
      requiresAltText: true
    },
    ...(slideSize ? { slideSize } : {}),
    ...(headerFooter ? { headerFooter } : {}),
    ...(titleSlide ? { titleSlide } : {}),
    ...(closingSlide ? { closingSlide } : {}),
    tags
  };

  return TemplateManifestSchema.parse(manifest);
}

export type ImportTemplateFromPptxResult = {
  template: TemplateManifest;
  registryPath?: string;
};

/**
 * Read a .pptx file and produce a reusable TemplateManifest. When `register` is set the template is
 * also written to the template registry so it appears in `search_templates` / `template list`.
 */
export async function importTemplateFromPptx(
  pptxPath: string,
  options: ImportTemplateOptions & { register?: boolean; overwrite?: boolean; registryPath?: string } = {}
): Promise<ImportTemplateFromPptxResult> {
  if (extname(pptxPath).toLowerCase() !== ".pptx") {
    throw new Error(`Expected a .pptx file, received: ${pptxPath}`);
  }
  const data = await readFile(pptxPath);
  const fallbackName = basename(pptxPath, extname(pptxPath));
  const template = await extractTemplateManifestFromPptx(data, {
    ...options,
    id: options.id ?? fallbackName,
    name: options.name ?? fallbackName
  });

  if (options.register) {
    const registered = await registerTemplateManifest(template, {
      overwrite: options.overwrite,
      registryPath: options.registryPath
    });
    return { template: registered.template, registryPath: registered.registryPath };
  }

  return { template };
}
