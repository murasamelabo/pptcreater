import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { createRequire } from "node:module";
import sharp from "sharp";
import {
  defaultTokens,
  registerTemplateManifest,
  TemplateManifestSchema,
  type DesignTokens,
  type HeaderFooter,
  type Locale,
  type PowerPointTemplatePackage,
  type ScaffoldImage,
  type ScaffoldTextBox,
  type SlideBackground,
  type SlideSize,
  type TemplateManifest,
  type TemplateScaffoldSlide
} from "@pptcreater/core";

const require = createRequire(import.meta.url);

type ZipEntry = {
  async(type: "string"): Promise<string>;
  async(type: "base64"): Promise<string>;
  async(type: "nodebuffer"): Promise<Buffer>;
};
type ZipArchive = {
  files: Record<string, unknown>;
  file(name: string): ZipEntry | null;
};
const JSZip = require("jszip") as { loadAsync(data: Buffer): Promise<ZipArchive> };

const EMU_PER_INCH = 914400;

function powerPointMimeType(extension: string): string {
  switch (extension) {
    case ".potx":
      return "application/vnd.openxmlformats-officedocument.presentationml.template";
    case ".pptm":
      return "application/vnd.ms-powerpoint.presentation.macroEnabled.12";
    case ".potm":
      return "application/vnd.ms-powerpoint.template.macroEnabled.12";
    default:
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
}

function powerPointPackageDataUri(extension: string, data: Buffer): string {
  return `data:${powerPointMimeType(extension)};base64,${data.toString("base64")}`;
}

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

const SCHEME_ALIASES: Record<string, string> = {
  bg1: "lt1",
  tx1: "dk1",
  bg2: "lt2",
  tx2: "dk2"
};

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** Apply OOXML color modifiers (tint/shade/lumMod/lumOff) found in a color fragment. */
function applyColorTransforms(hex: string, fragment: string): string {
  let { r, g, b } = channels(hex);
  const read = (name: string): number | undefined => {
    const match = new RegExp(`<(?:[a-zA-Z]+:)?${name}\\b[^>]*\\bval="(\\d+)"`).exec(fragment);
    return match ? Number(match[1]) / 100000 : undefined;
  };
  const shade = read("shade");
  if (shade !== undefined) {
    r *= shade;
    g *= shade;
    b *= shade;
  }
  const tint = read("tint");
  if (tint !== undefined) {
    r = r * tint + 255 * (1 - tint);
    g = g * tint + 255 * (1 - tint);
    b = b * tint + 255 * (1 - tint);
  }
  const lumMod = read("lumMod");
  const lumOff = read("lumOff");
  if (lumMod !== undefined || lumOff !== undefined) {
    const mod = lumMod ?? 1;
    const off = lumOff ?? 0;
    r = r * mod + 255 * off;
    g = g * mod + 255 * off;
    b = b * mod + 255 * off;
  }
  const toHex = (value: number) => clampByte(value).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Resolve a color fragment (`<a:srgbClr>`/`<a:schemeClr>`/`<a:sysClr>`) to hex, honoring the theme. */
function colorFromFragment(fragment: string | undefined, themeXml: string): string | undefined {
  if (!fragment) {
    return undefined;
  }
  const srgb = normalizeHex(attribute(openingTag(fragment, "srgbClr"), "val"));
  if (srgb) {
    const inner = innerXml(fragment, "srgbClr");
    return inner ? applyColorTransforms(srgb, inner) : srgb;
  }
  const schemeVal = attribute(openingTag(fragment, "schemeClr"), "val");
  if (schemeVal && schemeVal !== "phClr") {
    const base = themeColor(themeXml, SCHEME_ALIASES[schemeVal] ?? schemeVal);
    if (base) {
      const inner = innerXml(fragment, "schemeClr");
      return inner ? applyColorTransforms(base, inner) : base;
    }
  }
  return normalizeHex(attribute(openingTag(fragment, "sysClr"), "lastClr"));
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
  return { logos: [], ...(title ? { title } : {}), ...(subtitle ? { subtitle } : {}) };
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
  return { logos: [], ...(title ? { title } : {}), ...(subtitle ? { subtitle } : {}) };
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

function emuToInches(emu: number | undefined): number | undefined {
  if (emu === undefined || !Number.isFinite(emu)) {
    return undefined;
  }
  return Math.round((emu / EMU_PER_INCH) * 1000) / 1000;
}

type Rels = Record<string, { target: string; type: string }>;

function parseRels(relsXml: string): Rels {
  const rels: Rels = {};
  for (const match of relsXml.matchAll(/<Relationship\b[^>]*?\/?>/gi)) {
    const tag = match[0];
    const id = attribute(tag, "Id");
    const target = attribute(tag, "Target");
    const type = attribute(tag, "Type");
    if (id && target) {
      rels[id] = { target, type: type ?? "" };
    }
  }
  return rels;
}

/** Resolve a relationship Target (often `../media/x.png`) into a normalized zip path. */
function resolveRelTarget(target: string, baseDir: string): string {
  if (target.startsWith("/")) {
    return target.replace(/^\/+/, "");
  }
  const parts = baseDir.split("/").filter(Boolean);
  for (const segment of target.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      parts.pop();
    } else {
      parts.push(segment);
    }
  }
  return parts.join("/");
}

const MEDIA_PASS_THROUGH: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp"
};

/** Read a media part and return a renderer-safe (png/jpeg/gif/webp) data URI, converting when needed. */
async function mediaToDataUri(zip: ZipArchive, path: string): Promise<string | undefined> {
  const entry = zip.file(path);
  if (!entry) {
    return undefined;
  }
  const ext = extname(path).toLowerCase();
  const buffer = await entry.async("nodebuffer");
  const passMime = MEDIA_PASS_THROUGH[ext];
  if (passMime) {
    return `data:${passMime};base64,${buffer.toString("base64")}`;
  }
  // EMF/WMF and other vector/raster formats are normalized to PNG when possible.
  try {
    const png = await sharp(buffer).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return undefined;
  }
}

function shapeGeometry(shapeXml: string): { x?: number; y?: number; w?: number; h?: number } {
  const xfrm = innerXml(shapeXml, "xfrm");
  if (!xfrm) {
    return {};
  }
  const off = openingTag(xfrm, "off");
  const ext = openingTag(xfrm, "ext");
  return {
    x: emuToInches(Number(attribute(off, "x"))),
    y: emuToInches(Number(attribute(off, "y"))),
    w: emuToInches(Number(attribute(ext, "cx"))),
    h: emuToInches(Number(attribute(ext, "cy")))
  };
}

type RunProps = { fontSize?: number; color?: string; bold?: boolean; align?: "left" | "center" | "right" };

function mergeGeometry(
  primary: { x?: number; y?: number; w?: number; h?: number },
  fallback: { x?: number; y?: number; w?: number; h?: number }
): { x?: number; y?: number; w?: number; h?: number } {
  return {
    x: primary.x ?? fallback.x,
    y: primary.y ?? fallback.y,
    w: primary.w ?? fallback.w,
    h: primary.h ?? fallback.h
  };
}

function mergeRunProps(primary: RunProps, fallback: RunProps): RunProps {
  return {
    fontSize: primary.fontSize ?? fallback.fontSize,
    color: primary.color ?? fallback.color,
    bold: primary.bold ?? fallback.bold,
    align: primary.align ?? fallback.align
  };
}

/**
 * Resolve the effective paragraph alignment for a master text style (titleStyle/bodyStyle). The
 * OOXML default for a paragraph is left, so when the style block exists but omits `algn` we return
 * "left" rather than letting the scaffold fall back to a generic centered hero — this keeps an
 * imported designer title slide left-aligned the way the source template renders it.
 */
function masterStyleAlign(
  masterXml: string | undefined,
  styleTag: "titleStyle" | "bodyStyle"
): "left" | "center" | "right" | undefined {
  if (!masterXml) {
    return undefined;
  }
  const style = innerXml(masterXml, styleTag);
  if (!style) {
    return undefined;
  }
  const lvl1 = openingTag(style, "lvl1pPr");
  if (!lvl1) {
    return undefined;
  }
  const algn = attribute(lvl1, "algn");
  if (algn === "ctr") {
    return "center";
  }
  if (algn === "r") {
    return "right";
  }
  return "left";
}



function firstSolidFillColor(fragment: string | undefined, themeXml: string): string | undefined {
  if (!fragment) {
    return undefined;
  }
  const solid = innerXml(fragment, "solidFill");
  if (!solid) {
    return undefined;
  }
  return colorFromFragment(solid, themeXml);
}

function runProps(shapeXml: string | undefined, themeXml: string): RunProps {
  if (!shapeXml) {
    return {};
  }
  const body = innerXml(shapeXml, "txBody") ?? shapeXml;
  const paragraph = innerXml(body, "p") ?? body;
  const pPr = openingTag(paragraph, "pPr");
  const algn = attribute(pPr, "algn");
  const align = algn === "ctr" ? "center" : algn === "r" ? "right" : algn === "l" ? "left" : undefined;

  const rPrInner = innerXml(paragraph, "rPr");
  const rPrTag = openingTag(paragraph, "rPr");
  const szRaw = attribute(rPrTag, "sz");
  const fontSizePt = szRaw ? Math.round(Number(szRaw) / 100) : undefined;
  const fontSize = fontSizePt && Number.isFinite(fontSizePt) && fontSizePt > 0 ? fontSizePt : undefined;
  const bold = attribute(rPrTag, "b") === "1" ? true : undefined;
  const color = firstSolidFillColor(rPrInner, themeXml);

  return {
    ...(fontSize ? { fontSize } : {}),
    ...(color ? { color } : {}),
    ...(bold ? { bold } : {}),
    ...(align ? { align } : {})
  };
}

/** Synthesize a raster background from an OOXML `<a:gradFill>` so it survives into pptxgenjs. */
async function gradientToDataUri(gradXml: string, widthPx: number, heightPx: number, themeXml: string): Promise<string | undefined> {
  const stops = Array.from(gradXml.matchAll(/<(?:[a-zA-Z]+:)?gs\b[^>]*\bpos="(\d+)"[^>]*>([\s\S]*?)<\/(?:[a-zA-Z]+:)?gs>/gi))
    .map((match) => ({
      pos: Math.max(0, Math.min(100, Number(match[1]) / 1000)),
      color: colorFromFragment(match[2], themeXml)
    }))
    .filter((stop): stop is { pos: number; color: string } => Boolean(stop.color));
  if (stops.length < 2) {
    return undefined;
  }

  const linTag = openingTag(gradXml, "lin");
  const angleDeg = ((Number(attribute(linTag, "ang") ?? "0") / 60000) % 360 + 360) % 360;
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad) / 2;
  const dy = Math.sin(rad) / 2;
  const x1 = (0.5 - dx).toFixed(4);
  const y1 = (0.5 - dy).toFixed(4);
  const x2 = (0.5 + dx).toFixed(4);
  const y2 = (0.5 + dy).toFixed(4);

  const stopsSvg = stops
    .map((stop) => `<stop offset="${stop.pos.toFixed(2)}%" stop-color="${stop.color}"/>`)
    .join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}">` +
    `<defs><linearGradient id="bg" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stopsSvg}</linearGradient></defs>` +
    `<rect width="${widthPx}" height="${heightPx}" fill="url(#bg)"/></svg>`;

  try {
    const png = await sharp(Buffer.from(svg, "utf8"), { density: 96 }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return undefined;
  }
}

/** Average color of raw image bytes (downscaled to 1px) for contrast reference / fallback fill. */
async function averageColor(buffer: Buffer): Promise<string | undefined> {
  try {
    const { data } = await sharp(buffer).resize(1, 1, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    if (data.length < 3) {
      return undefined;
    }
    const toHex = (value: number) => value.toString(16).padStart(2, "0");
    return `#${toHex(data[0])}${toHex(data[1])}${toHex(data[2])}`;
  } catch {
    return undefined;
  }
}

function averageHex(colors: string[]): string | undefined {
  const channels = colors
    .map((hex) => normalizeHex(hex))
    .filter((hex): hex is string => Boolean(hex))
    .map((hex) => {
      const value = Number.parseInt(hex.replace("#", ""), 16);
      return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
    });
  if (channels.length === 0) {
    return undefined;
  }
  const sum = channels.reduce((acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }), { r: 0, g: 0, b: 0 });
  const toHex = (value: number) => Math.round(value / channels.length).toString(16).padStart(2, "0");
  return `#${toHex(sum.r)}${toHex(sum.g)}${toHex(sum.b)}`;
}

/** Resolve a slide/layout/master `<p:bg>` fragment into a renderable background. */
async function resolveBackground(
  bgXml: string | undefined,
  rels: Rels,
  zip: ZipArchive,
  baseDir: string,
  sizePx: { width: number; height: number },
  themeXml: string
): Promise<SlideBackground | undefined> {
  if (!bgXml) {
    return undefined;
  }

  const blipTag = openingTag(bgXml, "blip");
  const embed = attribute(blipTag, "r:embed") ?? attribute(blipTag, "embed");
  if (embed && rels[embed]) {
    const mediaPath = resolveRelTarget(rels[embed].target, baseDir);
    const entry = zip.file(mediaPath);
    if (entry) {
      const dataUri = await mediaToDataUri(zip, mediaPath);
      if (dataUri) {
        const color = await averageColor(await entry.async("nodebuffer"));
        return { imageDataUri: dataUri, ...(color ? { color } : {}) };
      }
    }
  }

  const gradXml = innerXml(bgXml, "gradFill");
  if (gradXml) {
    const dataUri = await gradientToDataUri(gradXml, sizePx.width, sizePx.height, themeXml);
    if (dataUri) {
      const stopColors = Array.from(gradXml.matchAll(/<(?:[a-zA-Z]+:)?gs\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z]+:)?gs>/gi))
        .map((match) => colorFromFragment(match[1], themeXml))
        .filter((value): value is string => Boolean(value));
      const color = averageHex(stopColors);
      return { imageDataUri: dataUri, ...(color ? { color } : {}) };
    }
  }

  const solidXml = innerXml(bgXml, "solidFill");
  if (solidXml) {
    const color = colorFromFragment(solidXml, themeXml);
    if (color) {
      return { color };
    }
  }

  // A `<p:bgRef>` points at a theme fill style; approximate it by its scheme color.
  const bgRefXml = innerXml(bgXml, "bgRef");
  if (bgRefXml) {
    const color = colorFromFragment(bgRefXml, themeXml);
    if (color) {
      return { color };
    }
  }

  return undefined;
}

/** Collect decorative pictures (logos/marks) with geometry from a slide/layout `spTree`. */
async function extractPictures(
  xml: string,
  rels: Rels,
  zip: ZipArchive,
  baseDir: string,
  maxCount: number
): Promise<ScaffoldImage[]> {
  const pics = xml.match(/<(?:[a-zA-Z]+:)?pic>[\s\S]*?<\/(?:[a-zA-Z]+:)?pic>/gi) ?? [];
  const images: ScaffoldImage[] = [];
  for (const pic of pics) {
    const geo = shapeGeometry(pic);
    if (geo.x === undefined || geo.y === undefined || geo.w === undefined || geo.h === undefined || geo.w <= 0 || geo.h <= 0) {
      continue;
    }
    const blipTag = openingTag(pic, "blip");
    const embed = attribute(blipTag, "r:embed") ?? attribute(blipTag, "embed");
    if (!embed || !rels[embed]) {
      continue;
    }
    const dataUri = await mediaToDataUri(zip, resolveRelTarget(rels[embed].target, baseDir));
    if (!dataUri) {
      continue;
    }
    const cNvPr = openingTag(pic, "cNvPr");
    const altText = attribute(cNvPr, "descr") ?? attribute(cNvPr, "name");
    images.push({
      dataUri,
      x: geo.x,
      y: geo.y,
      w: geo.w,
      h: geo.h,
      ...(altText && altText.trim() ? { altText: altText.trim() } : {})
    });
    if (images.length >= maxCount) {
      break;
    }
  }
  return images;
}

function clampBox(
  geo: { x?: number; y?: number; w?: number; h?: number },
  props: RunProps,
  canvas: { width: number; height: number }
): ScaffoldTextBox | undefined {
  if (geo.x === undefined || geo.y === undefined || geo.w === undefined || geo.h === undefined) {
    return undefined;
  }
  const x = Math.max(0, Math.min(geo.x, canvas.width - 0.5));
  const y = Math.max(0, Math.min(geo.y, canvas.height - 0.3));
  const w = Math.max(0.5, Math.min(geo.w, canvas.width - x));
  const h = Math.max(0.3, Math.min(geo.h, canvas.height - y));
  return {
    x,
    y,
    w,
    h,
    ...(props.fontSize ? { fontSize: props.fontSize } : {}),
    ...(props.color ? { color: props.color } : {}),
    ...(props.align ? { align: props.align } : {}),
    ...(props.bold !== undefined ? { bold: props.bold } : {})
  };
}

type SlideAssets = { xml: string; rels: Rels; baseDir: string; layoutXml?: string; layoutRels?: Rels; layoutBaseDir?: string };

/** Build a rich title/closing blueprint from an actual slide, falling back to its layout. */
async function extractSlideBlueprint(
  assets: SlideAssets,
  masterBgXml: string | undefined,
  zip: ZipArchive,
  canvas: { width: number; height: number },
  placeholderTypesPriority: string[],
  text: { title?: string; subtitle?: string },
  themeXml: string,
  alignFallback: { title?: "left" | "center" | "right"; subtitle?: "left" | "center" | "right" } = {}
): Promise<TemplateScaffoldSlide | undefined> {
  const sizePx = { width: Math.max(640, Math.round(canvas.width * 96)), height: Math.max(360, Math.round(canvas.height * 96)) };

  const slideBg = innerXml(innerXml(assets.xml, "cSld") ?? assets.xml, "bg");
  const layoutBg = assets.layoutXml ? innerXml(innerXml(assets.layoutXml, "cSld") ?? assets.layoutXml, "bg") : undefined;

  let background = await resolveBackground(slideBg, assets.rels, zip, assets.baseDir, sizePx, themeXml);
  if (!background && assets.layoutXml && assets.layoutRels && assets.layoutBaseDir) {
    background = await resolveBackground(layoutBg, assets.layoutRels, zip, assets.layoutBaseDir, sizePx, themeXml);
  }
  if (!background && masterBgXml) {
    background = await resolveBackground(masterBgXml, {}, zip, "ppt/slideMasters", sizePx, themeXml);
  }

  const logos = await extractPictures(assets.xml, assets.rels, zip, assets.baseDir, 4);
  if (logos.length === 0 && assets.layoutXml && assets.layoutRels && assets.layoutBaseDir) {
    logos.push(...(await extractPictures(assets.layoutXml, assets.layoutRels, zip, assets.layoutBaseDir, 4)));
  }

  const titleSlidePh = placeholderTypesPriority
    .map((type) => placeholderShape(assets.xml, type))
    .find((shape): shape is string => Boolean(shape));
  const titleLayoutPh = assets.layoutXml
    ? placeholderTypesPriority
        .map((type) => placeholderShape(assets.layoutXml as string, type))
        .find((shape): shape is string => Boolean(shape))
    : undefined;
  const subtitleSlidePh = placeholderShape(assets.xml, "subTitle") ?? placeholderShape(assets.xml, "body");
  const subtitleLayoutPh = assets.layoutXml
    ? placeholderShape(assets.layoutXml, "subTitle") ?? placeholderShape(assets.layoutXml, "body")
    : undefined;

  const titleGeo = mergeGeometry(shapeGeometry(titleSlidePh ?? ""), shapeGeometry(titleLayoutPh ?? ""));
  const titleProps = mergeRunProps(runProps(titleSlidePh, themeXml), runProps(titleLayoutPh, themeXml));
  if (!titleProps.align && alignFallback.title) {
    titleProps.align = alignFallback.title;
  }
  const subtitleGeo = mergeGeometry(shapeGeometry(subtitleSlidePh ?? ""), shapeGeometry(subtitleLayoutPh ?? ""));
  const subtitleProps = mergeRunProps(runProps(subtitleSlidePh, themeXml), runProps(subtitleLayoutPh, themeXml));
  if (!subtitleProps.align && alignFallback.subtitle) {
    subtitleProps.align = alignFallback.subtitle;
  }

  const titleBox = clampBox(titleGeo, titleProps, canvas);
  const subtitleBox = clampBox(subtitleGeo, subtitleProps, canvas);

  const hasVisuals = Boolean(background || logos.length > 0 || titleBox || subtitleBox);
  if (!hasVisuals && !text.title && !text.subtitle) {
    return undefined;
  }

  return {
    ...(text.title ? { title: text.title } : {}),
    ...(text.subtitle ? { subtitle: text.subtitle } : {}),
    ...(background ? { background } : {}),
    logos,
    ...(titleBox ? { titleBox } : {}),
    ...(subtitleBox ? { subtitleBox } : {})
  };
}

function naturalSlideSort(a: string, b: string): number {
  const na = Number(/(\d+)\.xml$/i.exec(a)?.[1] ?? 0);
  const nb = Number(/(\d+)\.xml$/i.exec(b)?.[1] ?? 0);
  return na - nb;
}

/** Layout names that carry their own cover/section/closing identity and are not reusable as a content body. */
const NON_CONTENT_LAYOUT_NAME =
  /(title|section|cover|divider|closing|quote|agenda|photo|picture|film|round|code|demo|developer|dark|notes)/i;

/** Ordered preferences for the most neutral text-content layout to capture a content background from. */
const CONTENT_LAYOUT_PREFERENCES: RegExp[] = [
  /^one column non-?bulleted text$/i,
  /^one column bulleted text$/i,
  /^header text only$/i,
  /small header text light/i,
  /^blank light$/i,
  /^blank$/i,
  /content/i,
  /text/i
];

/** Pick the slideLayout path that best represents a plain text content page (for content backgrounds). */
function pickContentLayoutPath(layoutNames: string[], layoutEntries: { name: string }[]): string | undefined {
  const candidates = layoutEntries
    .map((entry, index) => ({ name: (entry.name ?? "").trim(), path: layoutNames[index] }))
    .filter((candidate) => candidate.name && !NON_CONTENT_LAYOUT_NAME.test(candidate.name));
  for (const preference of CONTENT_LAYOUT_PREFERENCES) {
    const hit = candidates.find((candidate) => preference.test(candidate.name));
    if (hit) {
      return hit.path;
    }
  }
  return candidates[0]?.path;
}

export type ImportTemplateOptions = {
  id?: string;
  name?: string;
  locale?: Locale;
  tags?: string[];
  sourcePowerPoint?: Pick<PowerPointTemplatePackage, "extension" | "dataUri">;
};

/** Extract a reusable TemplateManifest from raw .pptx bytes. */
export async function extractTemplateManifestFromPptx(data: Buffer, options: ImportTemplateOptions = {}): Promise<TemplateManifest> {
  const zip = await JSZip.loadAsync(data);
  const names = Object.keys(zip.files);

  const presentationXml = (await zip.file("ppt/presentation.xml")?.async("string")) ?? "";

  const masterName = names.find((name) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/i.test(name));
  const masterXml = masterName ? ((await zip.file(masterName)?.async("string")) ?? "") : "";

  // Resolve the theme actually referenced by the slide master. A .potx can ship several extra themes
  // (e.g. an unused Office-default theme), so picking the first `theme\d+.xml` by zip order can grab
  // the wrong palette/fonts. Fall back to the first theme only when the master link is missing.
  let themeName: string | undefined;
  if (masterName) {
    const masterRelsPath = masterName.replace(/slideMasters\/([^/]+)$/i, "slideMasters/_rels/$1.rels");
    const masterRels = parseRels((await zip.file(masterRelsPath)?.async("string")) ?? "");
    const themeRel = Object.values(masterRels).find((rel) => /theme$/i.test(rel.type));
    if (themeRel) {
      const resolved = resolveRelTarget(themeRel.target, "ppt/slideMasters");
      if (resolved && zip.file(resolved)) {
        themeName = resolved;
      }
    }
  }
  if (!themeName) {
    themeName = names.find((name) => /^ppt\/theme\/theme\d+\.xml$/i.test(name)) ?? names.find((name) => /theme.*\.xml$/i.test(name));
  }
  const themeXml = themeName ? ((await zip.file(themeName)?.async("string")) ?? "") : "";

  const layoutNames = names.filter((name) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/i.test(name)).sort(naturalSlideSort);
  const layoutXmls: string[] = [];
  const layoutByPath = new Map<string, string>();
  const layoutEntries: { name: string; type?: string; placeholders: string[] }[] = [];
  for (const name of layoutNames) {
    const xml = (await zip.file(name)?.async("string")) ?? "";
    layoutXmls.push(xml);
    layoutByPath.set(name, xml);
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
  const canvas = {
    width: slideSize?.widthInches ?? 13.333,
    height: slideSize?.heightInches ?? 7.5
  };
  const masterBgXml = masterXml ? innerXml(innerXml(masterXml, "cSld") ?? masterXml, "bg") : undefined;

  // Resolve each slide to its layout so we can read the real title slide's background, logos, and
  // placeholder geometry — not just the abstract theme tokens.
  const slideNames = names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).sort(naturalSlideSort);
  const slideAssets: { assets: SlideAssets; layoutXml?: string; layoutPath?: string }[] = [];
  for (const name of slideNames) {
    const xml = (await zip.file(name)?.async("string")) ?? "";
    const relsPath = name.replace(/slides\/([^/]+)$/i, "slides/_rels/$1.rels");
    const relsXml = (await zip.file(relsPath)?.async("string")) ?? "";
    const rels = parseRels(relsXml);
    const layoutRel = Object.values(rels).find((rel) => /slideLayout$/i.test(rel.type));
    const layoutPath = layoutRel ? resolveRelTarget(layoutRel.target, "ppt/slides") : undefined;
    const layoutXml = layoutPath ? layoutByPath.get(layoutPath) : undefined;
    let layoutRels: Rels | undefined;
    let layoutBaseDir: string | undefined;
    if (layoutPath) {
      const layoutRelsPath = layoutPath.replace(/slideLayouts\/([^/]+)$/i, "slideLayouts/_rels/$1.rels");
      layoutRels = parseRels((await zip.file(layoutRelsPath)?.async("string")) ?? "");
      layoutBaseDir = "ppt/slideLayouts";
    }
    slideAssets.push({
      assets: { xml, rels, baseDir: "ppt/slides", layoutXml, layoutRels, layoutBaseDir },
      layoutXml,
      layoutPath
    });
  }

  const titleText = parseTitleSlide(layoutXmls);
  const closingText = parseClosingSlide(layoutXmls);

  const titleSlideAsset =
    slideAssets.find((entry) => entry.layoutXml && hasPlaceholder(entry.layoutXml, "ctrTitle")) ??
    slideAssets.find((entry) => hasPlaceholder(entry.assets.xml, "ctrTitle")) ??
    slideAssets[0];

  const closingSlideAsset = slideAssets
    .slice()
    .reverse()
    .find((entry) => {
      const layoutName = entry.layoutXml ? attribute(openingTag(entry.layoutXml, "cSld"), "name") ?? "" : "";
      const slideName = attribute(openingTag(entry.assets.xml, "cSld"), "name") ?? "";
      return CLOSING_PATTERN.test(layoutName) || CLOSING_PATTERN.test(slideName) || CLOSING_PATTERN.test(runText(entry.assets.xml) ?? "");
    });

  const titleAlign = masterStyleAlign(masterXml, "titleStyle");
  const bodyAlign = masterStyleAlign(masterXml, "bodyStyle");

  const titleSlide = titleSlideAsset
    ? await extractSlideBlueprint(titleSlideAsset.assets, masterBgXml, zip, canvas, ["ctrTitle", "title"], {
        title: titleText?.title,
        subtitle: titleText?.subtitle
      }, themeXml, { title: titleAlign, subtitle: bodyAlign })
    : titleText;

  const closingSlide = closingSlideAsset
    ? await extractSlideBlueprint(closingSlideAsset.assets, masterBgXml, zip, canvas, ["title", "ctrTitle"], {
        title: closingText?.title,
        subtitle: closingText?.subtitle
      }, themeXml, { title: titleAlign, subtitle: bodyAlign })
    : closingText;

  // Capture a content-slide blueprint (background + footer branding) from a representative text layout
  // so middle slides — not just the cover/closing — can inherit the template's visual identity.
  let contentSlide: TemplateScaffoldSlide | undefined;
  const contentLayoutPath = pickContentLayoutPath(layoutNames, layoutEntries);
  if (contentLayoutPath) {
    const contentLayoutXml = layoutByPath.get(contentLayoutPath) ?? "";
    const contentRelsPath = contentLayoutPath.replace(/slideLayouts\/([^/]+)$/i, "slideLayouts/_rels/$1.rels");
    const contentRels = parseRels((await zip.file(contentRelsPath)?.async("string")) ?? "");
    const contentBlueprint = await extractSlideBlueprint(
      { xml: contentLayoutXml, rels: contentRels, baseDir: "ppt/slideLayouts" },
      masterBgXml,
      zip,
      canvas,
      ["title", "body"],
      {},
      themeXml,
      { title: titleAlign, subtitle: bodyAlign }
    );
    if (contentBlueprint && (contentBlueprint.background || (contentBlueprint.logos?.length ?? 0) > 0)) {
      contentSlide = {
        ...(contentBlueprint.background ? { background: contentBlueprint.background } : {}),
        logos: contentBlueprint.logos ?? []
      };
    }
  }

  const baseName = options.name ?? "Imported Template";
  const id = sanitizeId(options.id ?? baseName);

  const tags = Array.from(
    new Set([
      "imported",
      ...(slideSize?.aspect ? [slideSize.aspect] : []),
      ...(options.tags ?? [])
    ])
  );

  const reusesTitleVisual = Boolean(titleSlide && (titleSlide.background || (titleSlide.logos?.length ?? 0) > 0 || titleSlide.titleBox));
  const reusesContentVisual = Boolean(contentSlide && (contentSlide.background || (contentSlide.logos?.length ?? 0) > 0));
  const inferredTitleLayoutPath =
    titleSlideAsset?.layoutPath ??
    layoutNames.find((path, index) => {
      const entry = layoutEntries[index];
      const xml = layoutByPath.get(path) ?? "";
      return /title/i.test(entry?.name ?? "") || entry?.type === "title" || hasPlaceholder(xml, "ctrTitle");
    });
  const inferredClosingLayoutPath =
    closingSlideAsset?.layoutPath ??
    layoutNames.find((path, index) => {
      const entry = layoutEntries[index];
      const xml = layoutByPath.get(path) ?? "";
      return CLOSING_PATTERN.test(entry?.name ?? "") || CLOSING_PATTERN.test(runText(xml) ?? "");
    });
  const powerPointTemplate = options.sourcePowerPoint
    ? {
        ...options.sourcePowerPoint,
        ...(inferredTitleLayoutPath ? { titleLayoutPath: inferredTitleLayoutPath } : {}),
        ...(contentLayoutPath ? { contentLayoutPath } : {}),
        ...(inferredClosingLayoutPath ? { closingLayoutPath: inferredClosingLayoutPath } : {})
      }
    : undefined;
  const manifest: TemplateManifest = {
    id,
    name: baseName,
    locale,
    description: `Template imported from a PowerPoint file (colors, fonts${slideSize ? ", slide size" : ""}${headerFooter ? ", header/footer" : ""}${reusesTitleVisual ? ", title-slide background/logo/layout" : ""}${reusesContentVisual ? ", content-slide background/branding" : ""}).`,
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
    ...(contentSlide ? { contentSlide } : {}),
    ...(powerPointTemplate ? { powerPointTemplate } : {}),
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
  const ext = extname(pptxPath).toLowerCase();
  if (![".pptx", ".potx", ".pptm", ".potm"].includes(ext)) {
    throw new Error(`Expected a PowerPoint file (.pptx, .potx, .pptm, or .potm), received: ${pptxPath}`);
  }
  const data = await readFile(pptxPath);
  const fallbackName = basename(pptxPath, extname(pptxPath));
  const template = await extractTemplateManifestFromPptx(data, {
    ...options,
    id: options.id ?? fallbackName,
    name: options.name ?? fallbackName,
    sourcePowerPoint: {
      extension: ext as ".pptx" | ".potx" | ".pptm" | ".potm",
      dataUri: powerPointPackageDataUri(ext, data)
    }
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

/**
 * Persistence state for a `importTemplateFromPptx` result, used to tell the user whether the
 * imported template was actually saved.
 *
 * `importTemplateFromPptx` only *persists* a template when `register` writes it to the registry
 * or the caller writes the returned manifest to a file. Otherwise the import succeeds but is
 * discarded, which surprises users who expect it to appear in `template list` and be usable by
 * `template apply` / `template scaffold` (CLI) or `apply_template_design` / `scaffold_from_template`
 * (MCP).
 */
export interface ImportPersistenceState {
  /** The id of the imported template (used in the message). */
  templateId: string;
  /** The registry path returned by the importer when it was registered. */
  registryPath?: string;
  /** A path the manifest JSON was written to, if any. */
  outputPath?: string;
}

/** True when the imported template was saved somewhere durable (registry or a manifest file). */
export function isImportPersisted(state: ImportPersistenceState): boolean {
  return Boolean(state.registryPath) || Boolean(state.outputPath);
}

/**
 * Human-readable confirmation suffix appended after "Imported template <id>".
 * Returns an empty string when the import was not persisted.
 */
export function importPersistenceSuffix(state: ImportPersistenceState): string {
  if (state.registryPath) {
    return ` (registered in ${state.registryPath})`;
  }
  if (state.outputPath) {
    return ` (manifest written to ${state.outputPath})`;
  }
  return "";
}

/**
 * Warning text shown when an imported template was neither registered nor written to a file,
 * or `undefined` when the import was persisted and no warning is needed.
 */
export function importNotPersistedWarning(state: ImportPersistenceState): string | undefined {
  if (isImportPersisted(state)) {
    return undefined;
  }
  return (
    `Imported template "${state.templateId}" was not saved: without registering it, the template is not added ` +
    `to the registry, so it will not appear in "template list" and cannot be used by "template apply" / ` +
    `"template scaffold" (or "apply_template_design" / "scaffold_from_template"). Set register=true (MCP) or ` +
    `re-run with --register (CLI) to save it to the registry, or write the returned manifest to a file.`
  );
}
