import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { sanitizeSvg } from "@pptcreater/assets-svg";
import sharp from "sharp";
import {
  defaultFontSizeForRole,
  defaultTokens,
  ensureSourceReferenceSlide,
  contrastRatio,
  lintDeckSpec,
  listAllTemplates,
  normalizeDeckLayout,
  normalizeReadingOrder,
  parseDeckSpec,
  POLISH_FIXABLE_LINT_CODES,
  type DeckSpec,
  type DesignTokens,
  type PowerPointTemplatePackage,
  type TemplateManifest,
  type SlideElement
} from "@pptcreater/core";
import { themeColor } from "./templateImport.js";

export * from "./templateImport.js";

const require = createRequire(import.meta.url);
type ZipEntry = {
  async(type: "string"): Promise<string>;
  async(type: "nodebuffer"): Promise<Buffer>;
};
type ZipArchive = {
  files: Record<string, unknown>;
  file(name: string): ZipEntry | null;
  file(name: string, data: string | Buffer): void;
  remove(name: string): void;
  generateAsync(options: { type: "nodebuffer" }): Promise<Buffer>;
};
const JSZip = require("jszip") as { loadAsync(data: Buffer): Promise<ZipArchive> };
type PptxSlide = {
  background: { color?: string; data?: string };
  slideNumber?: Record<string, unknown>;
  addText(text: string, options: Record<string, unknown>): void;
  addShape(shapeName: string, options?: Record<string, unknown>): void;
  addImage(options: { data?: string; path?: string; x: number; y: number; w: number; h: number; altText?: string }): void;
  addNotes(notes: string): void;
};

type PptxPresentation = {
  layout: string;
  author: string;
  subject: string;
  title: string;
  company: string;
  lang: string;
  theme: {
    headFontFace: string;
    bodyFontFace: string;
    lang: string;
  };
  defineLayout(options: { name: string; width: number; height: number }): void;
  addSlide(): PptxSlide;
  writeFile(options: { fileName: string }): Promise<void>;
};

const PptxGenJSConstructor = require("pptxgenjs") as { new (): PptxPresentation };
const MAX_LOCAL_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_SVG_RASTER_BYTES = 2 * 1024 * 1024;
const MAX_SVG_RASTER_SIDE = 2048;
const MAX_SVG_RASTER_PIXELS = 4_000_000;
const RASTER_IMAGE_MIME_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

export type RenderOptions = {
  allowLintErrors?: boolean;
  polishLayout?: boolean;
};

export type RenderResult = {
  outputPath: string;
  warnings: string[];
};

function inches(value: number): number {
  return Number(value.toFixed(3));
}

function svgPixelDimensions(svg: string): { width: number; height: number } {
  const attribute = (attrs: string, name: string): string | undefined => {
    const match = new RegExp(`(?:^|\\s)${name}=(["'])(.*?)\\1`, "i").exec(attrs);
    return match?.[2];
  };
  const absoluteLength = (value: string | undefined): number | undefined => {
    const match = value?.trim().match(/^(\d+(?:\.\d+)?)(?:px)?$/i);
    if (!match) {
      return undefined;
    }

    const parsed = Number(match[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };
  const rootAttrs = svg.match(/<svg\b([^>]*)>/i)?.[1] ?? "";
  const width = absoluteLength(attribute(rootAttrs, "width"));
  const height = absoluteLength(attribute(rootAttrs, "height"));
  if (width && height) {
    return { width, height };
  }

  const viewBox = rootAttrs.match(/\bviewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
  if (viewBox) {
    const viewBoxWidth = absoluteLength(viewBox[1]);
    const viewBoxHeight = absoluteLength(viewBox[2]);
    return {
      width: viewBoxWidth ?? 960,
      height: viewBoxHeight ?? 540
    };
  }

  return {
    width: width ?? 960,
    height: height ?? 540
  };
}

function svgWithRasterDimensions(svg: string, width: number, height: number, originalSize: { width: number; height: number }): string {
  return svg.replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
    const cleanedAttrs = attrs
      .replace(/\s+width=(["'])[\s\S]*?\1/i, "")
      .replace(/\s+height=(["'])[\s\S]*?\1/i, "");
    const viewBoxAttr = /\sviewBox=(["'])[\s\S]*?\1/i.test(cleanedAttrs)
      ? ""
      : ` viewBox="0 0 ${originalSize.width} ${originalSize.height}"`;
    return `<svg${cleanedAttrs}${viewBoxAttr} width="${width}" height="${height}">`;
  });
}

async function svgPngDataUri(svg: string): Promise<string> {
  if (Buffer.byteLength(svg, "utf8") > MAX_SVG_RASTER_BYTES) {
    throw new Error(`SVG image is too large to rasterize. Maximum size is ${MAX_SVG_RASTER_BYTES} bytes.`);
  }

  const sanitized = sanitizeSvg(svg);
  if (Buffer.byteLength(sanitized, "utf8") > MAX_SVG_RASTER_BYTES) {
    throw new Error(`Sanitized SVG image is too large to rasterize. Maximum size is ${MAX_SVG_RASTER_BYTES} bytes.`);
  }

  const size = svgPixelDimensions(sanitized);
  const scale = Math.min(
    2,
    MAX_SVG_RASTER_SIDE / size.width,
    MAX_SVG_RASTER_SIDE / size.height,
    Math.sqrt(MAX_SVG_RASTER_PIXELS / (size.width * size.height))
  );
  const outputWidth = Math.max(1, Math.floor(size.width * scale));
  const outputHeight = Math.max(1, Math.floor(size.height * scale));
  const rasterSvg = svgWithRasterDimensions(sanitized, outputWidth, outputHeight, size);
  const png = await sharp(Buffer.from(rasterSvg, "utf8"), { density: 72, limitInputPixels: MAX_SVG_RASTER_PIXELS })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

function isPathInside(child: string, parent: string): boolean {
  const childRelative = relative(parent, child);
  return childRelative === "" || (!childRelative.startsWith("..") && !isAbsolute(childRelative));
}

async function assertNoSymlinkPathComponents(workspaceRoot: string, resolvedPath: string): Promise<void> {
  const relativePath = relative(workspaceRoot, resolvedPath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("image.path must stay inside the current workspace. Use image.dataUri for external files.");
  }

  let current = workspaceRoot;
  for (const segment of relativePath.split(/[\\/]+/).filter(Boolean)) {
    current = resolve(current, segment);
    const stats = await lstat(current);
    if (stats.isSymbolicLink()) {
      throw new Error("image.path cannot contain symbolic links.");
    }
  }
}

async function localImagePathToDataUri(path: string, workspaceRoot = process.cwd()): Promise<string> {
  if (path.includes("\0")) {
    throw new Error("image.path cannot contain null bytes.");
  }

  const extension = extname(path).toLowerCase();
  const isSvg = extension === ".svg";
  const mimeType = RASTER_IMAGE_MIME_TYPES[extension];
  if (!isSvg && !mimeType) {
    throw new Error("image.path must point to an SVG, PNG, JPEG, GIF, or WebP file.");
  }

  const root = await realpath(workspaceRoot);
  const resolvedPath = resolve(workspaceRoot, path);
  await assertNoSymlinkPathComponents(resolve(workspaceRoot), resolvedPath);
  const realPath = await realpath(resolvedPath);
  if (!isPathInside(realPath, root)) {
    throw new Error("image.path must stay inside the current workspace. Use image.dataUri for external files.");
  }

  const stats = await lstat(realPath);
  if (!stats.isFile()) {
    throw new Error("image.path must reference a regular non-symlink file.");
  }

  if (stats.size > MAX_LOCAL_IMAGE_BYTES) {
    throw new Error(`image.path file is too large. Maximum size is ${MAX_LOCAL_IMAGE_BYTES} bytes.`);
  }

  if (isSvg) {
    return svgPngDataUri(await readFile(realPath, "utf8"));
  }

  return `data:${mimeType};base64,${(await readFile(realPath)).toString("base64")}`;
}

async function inlineLocalImagePaths(deck: DeckSpec): Promise<DeckSpec> {
  const slides: DeckSpec["slides"] = [];
  for (const slide of deck.slides) {
    const elements: SlideElement[] = [];
    for (const element of slide.elements) {
      if (element.type !== "image" || !element.path || element.dataUri) {
        elements.push(element);
        continue;
      }

      elements.push({
        ...element,
        dataUri: await localImagePathToDataUri(element.path)
      });
    }
    slides.push({ ...slide, elements });
  }

  return {
    ...deck,
    slides
  };
}

async function safeImageDataUri(dataUri: string): Promise<string> {
  const header = /^data:image\/(svg\+xml|png|jpe?g|gif|webp);base64,/i.exec(dataUri);
  if (!header) {
    throw new Error("image.dataUri must be a base64 SVG, PNG, JPEG, GIF, or WebP image.");
  }

  const mimeType = header[1].toLowerCase();
  const payload = dataUri.slice(header[0].length);
  if (!/^[a-zA-Z0-9+/=\s]+$/.test(payload)) {
    throw new Error("image.dataUri must be a valid base64 SVG, PNG, JPEG, GIF, or WebP image.");
  }

  if (mimeType === "svg+xml") {
    const normalized = payload.replace(/\s+/g, "");
    const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
    const estimatedDecodedBytes = Math.floor((normalized.length * 3) / 4) - padding;
    if (estimatedDecodedBytes > MAX_SVG_RASTER_BYTES) {
      throw new Error(`SVG image is too large to rasterize. Maximum size is ${MAX_SVG_RASTER_BYTES} bytes.`);
    }

    return svgPngDataUri(Buffer.from(normalized, "base64").toString("utf8"));
  }

  const match = /^data:image\/(png|jpe?g|gif|webp);base64,[a-zA-Z0-9+/=\s]+$/i.exec(dataUri);
  if (!match) {
    throw new Error("image.dataUri must be a base64 SVG, PNG, JPEG, GIF, or WebP image.");
  }

  return dataUri;
}

async function resolveSlideBackground(
  slide: DeckSpec["slides"][number],
  tokens: DesignTokens
): Promise<{ color?: string; data?: string }> {
  const background = slide.background;
  if (background?.imageDataUri) {
    try {
      return { data: await safeImageDataUri(background.imageDataUri) };
    } catch {
      // Fall through to a solid color when the embedded background image is unusable.
    }
  }
  const color = background?.color ?? tokens.colors.background;
  return { color: color.replace("#", "") };
}

function sortedElements(elements: SlideElement[]): SlideElement[] {
  return [...elements].sort((a, b) => (a.readingOrder ?? Number.MAX_SAFE_INTEGER) - (b.readingOrder ?? Number.MAX_SAFE_INTEGER));
}

function addHeaderFooter(slide: PptxSlide, deck: DeckSpec, tokens: DesignTokens): void {
  const hf = deck.headerFooter;
  if (!hf) {
    return;
  }
  const slideWidth = deck.slideSize?.widthInches ?? 13.333;
  const slideHeight = deck.slideSize?.heightInches ?? 7.5;
  const baselineY = Math.max(0, slideHeight - 0.45);
  const color = tokens.colors.mutedText.replace("#", "");
  const fontFace = tokens.typography.bodyFont;
  const common = { y: baselineY, h: 0.3, fontSize: 10, color, fontFace } as const;

  if (hf.showDate && hf.dateText) {
    slide.addText(hf.dateText, { ...common, x: 0.5, w: Math.min(3, slideWidth / 3), align: "left" });
  }
  if (hf.showFooter && hf.footerText) {
    const w = Math.min(6, slideWidth - 2);
    slide.addText(hf.footerText, { ...common, x: (slideWidth - w) / 2, w, align: "center" });
  }
  if (hf.showSlideNumber) {
    slide.slideNumber = { ...common, x: slideWidth - 1.3, w: 0.8, align: "right" };
  }
}

function safeObjectId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
}

function shapeObjectName(element: Extract<SlideElement, { type: "shape" }>, slideIndex: number): string {
  const prefix = element.decorative ? "Decorative" : "Accessible";
  return `${prefix} s${slideIndex + 1}-${safeObjectId(element.id)}`;
}

function pptxShapeName(shape: Extract<SlideElement, { type: "shape" }>["shape"]): string {
  if (shape === "roundedRect") {
    return "roundRect";
  }

  if (shape === "oval") {
    return "ellipse";
  }

  if (shape === "arrow") {
    return "rightArrow";
  }

  return shape;
}

async function addElement(slide: PptxSlide, element: SlideElement, deck: DeckSpec, slideIndex: number): Promise<void> {
  const tokens = deck.tokens ?? defaultTokens(deck.locale);
  const position = {
    x: inches(element.x),
    y: inches(element.y),
    w: inches(element.w),
    h: inches(element.h)
  };

  if (element.type === "text") {
    slide.addText(element.text, {
      ...position,
      fontFace: element.role === "title" ? tokens.typography.headingFont : tokens.typography.bodyFont,
      fontSize: element.fontSize ?? defaultFontSizeForRole(element.role, tokens),
      color: (element.color ?? tokens.colors.text).replace("#", ""),
      bold: element.bold || element.role === "title",
      charSpacing: element.characterSpacing,
      align: element.align,
      valign: element.valign,
      fit: "shrink",
      margin: 0.02,
      breakLine: false
    });
    return;
  }

  if (element.type === "shape") {
    const fill =
      element.fill === "none"
        ? { type: "none" }
        : {
            color: element.fill.replace("#", ""),
            ...(element.fillOpacity !== undefined
              ? { transparency: Math.max(0, Math.min(100, Math.round((1 - element.fillOpacity) * 100))) }
              : {})
          };
    const line = element.line
      ? {
          color: (element.line.color ?? "#64748b").replace("#", ""),
          width: element.line.width ?? 1,
          dashType: element.line.dash,
          beginArrowType: element.line.beginArrowType,
          endArrowType: element.line.endArrowType
        }
      : { color: "64748b", transparency: 100 };
    const shapeOptions = {
      ...position,
      objectName: shapeObjectName(element, slideIndex),
      fill,
      line,
      ...(element.shape === "roundRect" || element.shape === "roundedRect" ? { rectRadius: element.radius } : {})
    };
    slide.addShape(pptxShapeName(element.shape), shapeOptions);
    return;
  }

  if (element.type === "svg" || element.type === "diagram") {
    slide.addImage({
      data: await svgPngDataUri(element.svg),
      altText: element.decorative ? "" : element.altText ?? (element.type === "diagram" ? element.summary : undefined),
      ...position
    });
    return;
  }

  if (element.type === "image") {
    if (element.dataUri) {
      slide.addImage({ data: await safeImageDataUri(element.dataUri), altText: element.decorative ? "" : element.altText, ...position });
    } else if (element.path) {
      slide.addImage({ path: element.path, altText: element.decorative ? "" : element.altText, ...position });
    }
    return;
  }

  if (element.type === "smartart") {
    // SmartArt cannot be emitted through pptxgenjs. It is transplanted as OpenXML after
    // the normal PPTX has been written.
    return;
  }
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function shapeDescriptions(deck: DeckSpec): Map<number, Map<string, string>> {
  const bySlide = new Map<number, Map<string, string>>();
  deck.slides.forEach((slide, slideIndex) => {
    const slideDescriptions = new Map<string, string>();
    slide.elements.forEach((element) => {
      if (element.type === "shape") {
        slideDescriptions.set(shapeObjectName(element, slideIndex), element.decorative ? "" : element.altText ?? element.id);
      }
    });
    bySlide.set(slideIndex, slideDescriptions);
  });
  return bySlide;
}

function decorateCnvPr(attrs: string, description: string, selfClosing: boolean): string {
  const cleanedAttrs = attrs.replace(/\s*\/\s*$/, "").replace(/\s+descr="[^"]*"/, "").replace(/\s+decorative="[^"]*"/, "");
  const descriptionAttr = `descr="${escapeXmlAttribute(description)}"`;

  if (description === "") {
    const decorativeAttrs = `${cleanedAttrs} ${descriptionAttr}`;
    const decorativeExtension =
      '<a:extLst><a:ext uri="{C183D7F6-B498-43B3-948B-1728B52AA6E4}"><adec:decorative xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative" val="1"/></a:ext></a:extLst>';
    if (!selfClosing) {
      return `<p:cNvPr${decorativeAttrs}>${decorativeExtension}`;
    }

    return `<p:cNvPr${decorativeAttrs}>${decorativeExtension}</p:cNvPr>`;
  }

  return `<p:cNvPr${cleanedAttrs} ${descriptionAttr}${selfClosing ? "/>" : ">"}`;
}

function removeNotesMasterReference(xml: string): string {
  return xml.replace(/<p:notesMasterIdLst\b[\s\S]*?<\/p:notesMasterIdLst>/, "");
}

function convertLineShapesToConnectors(xml: string): string {
  return xml.replace(/<p:sp>([\s\S]*?)<\/p:sp>/g, (match, body: string) => {
    if (!/<a:prstGeom\b[^>]*\bprst="line"/i.test(body)) {
      return match;
    }
    const converted = body
      .replace("<p:nvSpPr>", "<p:nvCxnSpPr>")
      .replace("</p:nvSpPr>", "</p:nvCxnSpPr>")
      .replace("<p:cNvSpPr/>", "<p:cNvCxnSpPr/>")
      .replace("<p:cNvSpPr></p:cNvSpPr>", "<p:cNvCxnSpPr/>");
    if (converted === body) {
      return match;
    }
    return `<p:cxnSp>${converted}</p:cxnSp>`;
  });
}

async function markShapeAccessibility(pptxPath: string, deck: DeckSpec): Promise<void> {
  const descriptionsBySlide = shapeDescriptions(deck);
  const zip = await JSZip.loadAsync(await readFile(pptxPath));
  const slideNames = Object.keys((zip as unknown as { files: Record<string, unknown> }).files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));

  await Promise.all(
    slideNames.map(async (name) => {
      const file = zip.file(name);
      if (!file) {
        return;
      }

      const slideIndex = Number(name.match(/slide(\d+)\.xml$/)?.[1] ?? "1") - 1;
      const descriptions = descriptionsBySlide.get(slideIndex) ?? new Map<string, string>();
      const xml = await file.async("string");
      const accessible = xml.replace(/<p:cNvPr\b([^>]*\/?)>/g, (match, attrs: string) => {
        const nameMatch = attrs.match(/\bname="([^"]+)"/);
        if (!nameMatch) {
          return match;
        }

        const description = descriptions.get(nameMatch[1]);
        if (description === undefined) {
          return match;
        }

        return decorateCnvPr(attrs, description, /\/\s*$/.test(attrs));
      });
      zip.file(name, convertLineShapesToConnectors(accessible));
    })
  );

  const presentationFile = zip.file("ppt/presentation.xml");
  if (presentationFile) {
    const presentationXml = await presentationFile.async("string");
    const normalized = removeNotesMasterReference(presentationXml);
    if (normalized !== presentationXml) {
      zip.file("ppt/presentation.xml", normalized);
    }
  }

  const presentationRels = zip.file("ppt/_rels/presentation.xml.rels");
  if (presentationRels) {
    const relsXml = await presentationRels.async("string");
    const normalizedRels = relsXml.replace(/<Relationship\b(?=[^>]*(?:\/notesMaster|\/notesMasters))[^>]*\/>/gi, "");
    if (normalizedRels !== relsXml) {
      zip.file("ppt/_rels/presentation.xml.rels", normalizedRels);
    }
  }

  const relationshipNames = Object.keys((zip as unknown as { files: Record<string, unknown> }).files).filter((name) => name.startsWith("ppt/notesSlides/_rels/") && name.endsWith(".rels"));
  await Promise.all(
    relationshipNames.map(async (name) => {
      const relsFile = zip.file(name);
      if (!relsFile) {
        return;
      }

      const relsXml = await relsFile.async("string");
      const normalizedRels = relsXml.replace(/<Relationship\b(?=[^>]*(?:\/notesMaster|\/notesMasters))[^>]*\/>/gi, "");
      if (normalizedRels !== relsXml) {
        zip.file(name, normalizedRels);
      }
    })
  );

  const contentTypes = zip.file("[Content_Types].xml");
  if (contentTypes) {
    const contentTypesXml = await contentTypes.async("string");
    const normalizedContentTypes = contentTypesXml.replace(/<Override\b[^>]*\/notesMasters\/notesMaster\d+\.xml[^>]*\/>/g, "");
    if (normalizedContentTypes !== contentTypesXml) {
      zip.file("[Content_Types].xml", normalizedContentTypes);
    }
  }

  for (const name of Object.keys((zip as unknown as { files: Record<string, unknown> }).files)) {
    if (name.startsWith("ppt/notesMasters/")) {
      zip.remove(name);
    }
  }

  await writeFile(pptxPath, await zip.generateAsync({ type: "nodebuffer" }));
}

type Relationship = {
  id: string;
  type: string;
  target: string;
  targetMode?: string;
};

const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const POWERPOINT_TEMPLATE_PART_PREFIXES = ["ppt/slideMasters/", "ppt/slideLayouts/", "ppt/theme/"] as const;

function decodePowerPointPackageDataUri(dataUri: string): Buffer {
  const match = /^data:[^;]+;base64,([a-zA-Z0-9+/=\s]+)$/i.exec(dataUri);
  if (!match) {
    throw new Error("Imported PowerPoint template package must be a base64 data URI.");
  }
  return Buffer.from(match[1].replace(/\s+/g, ""), "base64");
}

function zipNames(zip: ZipArchive): string[] {
  return Object.keys(zip.files).sort();
}

async function readZipXml(zip: ZipArchive, name: string): Promise<string> {
  return (await zip.file(name)?.async("string")) ?? "";
}

function relationshipAttr(xml: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`, "i").exec(xml)?.[1];
}

function parseRelationships(xml: string): Relationship[] {
  return [...xml.matchAll(/<Relationship\b[^>]*\/>/gi)].map((match) => {
    const tag = match[0];
    return {
      id: relationshipAttr(tag, "Id") ?? "",
      type: relationshipAttr(tag, "Type") ?? "",
      target: relationshipAttr(tag, "Target") ?? "",
      targetMode: relationshipAttr(tag, "TargetMode")
    };
  }).filter((rel) => rel.id && rel.type && rel.target);
}

function serializeRelationships(rels: Relationship[]): string {
  const body = rels
    .map((rel) => {
      const mode = rel.targetMode ? ` TargetMode="${rel.targetMode}"` : "";
      return `<Relationship Id="${escapeXmlAttribute(rel.id)}" Type="${escapeXmlAttribute(rel.type)}" Target="${escapeXmlAttribute(rel.target)}"${mode}/>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}">${body}</Relationships>`;
}

function nextRelationshipId(rels: Relationship[]): string {
  const max = rels.reduce((highest, rel) => {
    const value = /^rId(\d+)$/i.exec(rel.id)?.[1];
    return value ? Math.max(highest, Number(value)) : highest;
  }, 0);
  return `rId${max + 1}`;
}

function emu(valueInches: number): number {
  return Math.round(valueInches * 914400);
}

function nextPartName(zip: ZipArchive, prefix: string, extension = ".xml"): string {
  const used = new Set(zipNames(zip));
  for (let index = 1; index < 10_000; index += 1) {
    const candidate = `${prefix}${index}${extension}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Could not allocate a new OpenXML part for ${prefix}.`);
}

function diagramContentType(name: string): string {
  if (/\/data\d+\.xml$/i.test(name)) {
    return "application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml";
  }
  if (/\/layout\d+\.xml$/i.test(name)) {
    return "application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml";
  }
  if (/\/quickStyle\d+\.xml$/i.test(name)) {
    return "application/vnd.openxmlformats-officedocument.drawingml.diagramStyle+xml";
  }
  if (/\/colors\d+\.xml$/i.test(name)) {
    return "application/vnd.openxmlformats-officedocument.drawingml.diagramColors+xml";
  }
  if (/\/drawing\d+\.xml$/i.test(name)) {
    return "application/vnd.ms-office.drawingml.diagramDrawing+xml";
  }
  throw new Error(`Unsupported SmartArt diagram part: ${name}`);
}

function ensureContentTypeOverrides(xml: string, partNames: string[]): string {
  let next = xml;
  for (const name of partNames) {
    const partName = `/${name}`;
    const escaped = partName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`<Override\\b[^>]*PartName="${escaped}"`, "i").test(next)) {
      continue;
    }
    next = next.replace("</Types>", `<Override PartName="${partName}" ContentType="${diagramContentType(name)}"/></Types>`);
  }
  return next;
}

function sourceSlidePath(sourceSlideIndex: number): string {
  return `ppt/slides/slide${sourceSlideIndex}.xml`;
}

function sourceSlideRelsPath(sourceSlideIndex: number): string {
  return `ppt/slides/_rels/slide${sourceSlideIndex}.xml.rels`;
}

function relationshipById(rels: Relationship[], id: string | undefined): Relationship | undefined {
  return id ? rels.find((rel) => rel.id === id) : undefined;
}

function relIdAttr(xml: string, attr: "dm" | "lo" | "qs" | "cs"): string | undefined {
  return new RegExp(`\\br:${attr}="([^"]+)"`, "i").exec(xml)?.[1];
}

function diagramPartPrefixForRel(type: string): string | undefined {
  if (/\/diagramData$/i.test(type)) {
    return "ppt/diagrams/data";
  }
  if (/\/diagramLayout$/i.test(type)) {
    return "ppt/diagrams/layout";
  }
  if (/\/diagramQuickStyle$/i.test(type)) {
    return "ppt/diagrams/quickStyle";
  }
  if (/\/diagramColors$/i.test(type)) {
    return "ppt/diagrams/colors";
  }
  if (/\/diagramDrawing$/i.test(type)) {
    return "ppt/diagrams/drawing";
  }
  return undefined;
}

function slideGraphicFrameXml(sourceSlideXml: string): string {
  const match = /<p:graphicFrame\b[\s\S]*?<dgm:relIds\b[\s\S]*?<\/p:graphicFrame>/i.exec(sourceSlideXml);
  if (!match) {
    throw new Error("SmartArt template slide does not contain a SmartArt graphicFrame.");
  }
  return match[0];
}

function ensureSmartArtNamespaces(graphicFrameXml: string): string {
  return graphicFrameXml.replace(/<p:graphicFrame\b([^>]*)>/i, (_match, attrs: string) => {
    const dgm = /\bxmlns:dgm=/.test(attrs) ? "" : ' xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"';
    const rel = /\bxmlns:r=/.test(attrs) ? "" : ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    return `<p:graphicFrame${attrs}${dgm}${rel}>`;
  });
}

function replaceGraphicFramePosition(xml: string, element: Extract<SlideElement, { type: "smartart" }>, objectId: number): string {
  const xfrm = `<p:xfrm><a:off x="${emu(element.x)}" y="${emu(element.y)}"/><a:ext cx="${emu(element.w)}" cy="${emu(element.h)}"/></p:xfrm>`;
  const rewriteCnvPrAttrs = (attrs: string): string =>
    attrs
      .replace(/\s*\/\s*$/u, "")
      .replace(/\bid="[^"]*"/i, `id="${objectId}"`)
      .replace(/\bname="[^"]*"/i, `name="${escapeXmlAttribute(element.id)}"`)
      .replace(/\bdescr="[^"]*"/i, "")
      .trimEnd();
  return xml
    .replace(/<p:cNvPr\b([^>]*)\/>/i, (_match, attrs: string) => `<p:cNvPr ${rewriteCnvPrAttrs(attrs)} descr="${escapeXmlAttribute(element.altText ?? element.summary)}"/>`)
    .replace(/<p:cNvPr\b([^/>]*)>/i, (_match, attrs: string) => `<p:cNvPr ${rewriteCnvPrAttrs(attrs)} descr="${escapeXmlAttribute(element.altText ?? element.summary)}">`)
    .replace(/<p:xfrm>[\s\S]*?<\/p:xfrm>/i, xfrm);
}

function replaceSmartArtRelIds(xml: string, ids: { dm: string; lo: string; qs: string; cs: string }): string {
  return xml
    .replace(/\br:dm="[^"]+"/i, `r:dm="${ids.dm}"`)
    .replace(/\br:lo="[^"]+"/i, `r:lo="${ids.lo}"`)
    .replace(/\br:qs="[^"]+"/i, `r:qs="${ids.qs}"`)
    .replace(/\br:cs="[^"]+"/i, `r:cs="${ids.cs}"`);
}

function rewriteSmartArtPartRelationshipIds(xml: string, relIdMap: Map<string, string>): string {
  let next = xml;
  for (const [oldId, newId] of relIdMap) {
    const escaped = oldId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(`\\brelId="${escaped}"`, "g"), `relId="${newId}"`);
  }
  return next;
}

function maxShapeId(slideXml: string): number {
  return [...slideXml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/gi)].reduce((max, match) => Math.max(max, Number(match[1])), 0);
}

async function smartArtTemplateBuffer(element: Extract<SlideElement, { type: "smartart" }>, workspaceRoot = process.cwd()): Promise<Buffer> {
  if (element.templateDataUri) {
    return decodePowerPointPackageDataUri(element.templateDataUri);
  }
  if (!element.templatePath) {
    throw new Error(`SmartArt element "${element.id}" requires templatePath or templateDataUri.`);
  }
  if (element.templatePath.includes("\0")) {
    throw new Error("smartart.templatePath cannot contain null bytes.");
  }
  const extension = extname(element.templatePath).toLowerCase();
  if (![".pptx", ".potx", ".pptm", ".potm"].includes(extension)) {
    throw new Error("smartart.templatePath must point to a .pptx, .potx, .pptm, or .potm file.");
  }
  const root = await realpath(workspaceRoot);
  const resolvedPath = resolve(workspaceRoot, element.templatePath);
  await assertNoSymlinkPathComponents(resolve(workspaceRoot), resolvedPath);
  const realPath = await realpath(resolvedPath);
  if (!isPathInside(realPath, root)) {
    throw new Error("smartart.templatePath must stay inside the current workspace. Use smartart.templateDataUri for external files.");
  }
  const stats = await lstat(realPath);
  if (!stats.isFile()) {
    throw new Error("smartart.templatePath must reference a regular non-symlink file.");
  }
  if (stats.size > MAX_LOCAL_IMAGE_BYTES) {
    throw new Error(`smartart.templatePath file is too large. Maximum size is ${MAX_LOCAL_IMAGE_BYTES} bytes.`);
  }
  return readFile(realPath);
}

async function transplantSmartArtElement(
  targetZip: ZipArchive,
  targetSlideIndex: number,
  element: Extract<SlideElement, { type: "smartart" }>
): Promise<void> {
  const sourceZip = await JSZip.loadAsync(await smartArtTemplateBuffer(element));
  const sourceSlideXml = await readZipXml(sourceZip, sourceSlidePath(element.sourceSlideIndex));
  const sourceRels = parseRelationships(await readZipXml(sourceZip, sourceSlideRelsPath(element.sourceSlideIndex)));
  const graphicFrame = slideGraphicFrameXml(sourceSlideXml);
  const relIds = {
    dm: relIdAttr(graphicFrame, "dm"),
    lo: relIdAttr(graphicFrame, "lo"),
    qs: relIdAttr(graphicFrame, "qs"),
    cs: relIdAttr(graphicFrame, "cs")
  };
  const sourceDiagramRels = [
    relationshipById(sourceRels, relIds.dm),
    relationshipById(sourceRels, relIds.lo),
    relationshipById(sourceRels, relIds.qs),
    relationshipById(sourceRels, relIds.cs),
    sourceRels.find((rel) => /\/diagramDrawing$/i.test(rel.type))
  ].filter((rel): rel is Relationship => Boolean(rel));
  if (sourceDiagramRels.length < 4) {
    throw new Error("SmartArt template slide is missing required diagram relationships.");
  }

  const targetRelsPath = `ppt/slides/_rels/slide${targetSlideIndex + 1}.xml.rels`;
  const targetSlidePath = `ppt/slides/slide${targetSlideIndex + 1}.xml`;
  const targetRels = parseRelationships(await readZipXml(targetZip, targetRelsPath));
  const newRelIds: Partial<Record<"dm" | "lo" | "qs" | "cs", string>> = {};
  const newPartNames: string[] = [];
  const relIdMap = new Map<string, string>();
  const pendingCopies: Array<{ sourcePart: string; targetPart: string }> = [];

  for (const sourceRel of sourceDiagramRels) {
    const prefix = diagramPartPrefixForRel(sourceRel.type);
    if (!prefix) {
      continue;
    }
    const sourcePart = resolvePackageRelTarget(sourceRel.target, "ppt/slides");
    if (!sourcePart || !sourceZip.file(sourcePart)) {
      throw new Error(`SmartArt template is missing related part: ${sourceRel.target}`);
    }
    const targetPart = nextPartName(targetZip, prefix, ".xml");
    pendingCopies.push({ sourcePart, targetPart });
    newPartNames.push(targetPart);
    const relId = nextRelationshipId(targetRels);
    relIdMap.set(sourceRel.id, relId);
    targetRels.push({
      id: relId,
      type: sourceRel.type,
      target: `../${targetPart.replace(/^ppt\//, "")}`
    });
    if (/\/diagramData$/i.test(sourceRel.type)) {
      newRelIds.dm = relId;
    } else if (/\/diagramLayout$/i.test(sourceRel.type)) {
      newRelIds.lo = relId;
    } else if (/\/diagramQuickStyle$/i.test(sourceRel.type)) {
      newRelIds.qs = relId;
    } else if (/\/diagramColors$/i.test(sourceRel.type)) {
      newRelIds.cs = relId;
    }
  }

  for (const { sourcePart, targetPart } of pendingCopies) {
    const sourceFile = sourceZip.file(sourcePart);
    if (!sourceFile) {
      throw new Error(`SmartArt template part was not found: ${sourcePart}`);
    }
    targetZip.file(targetPart, rewriteSmartArtPartRelationshipIds(await sourceFile.async("string"), relIdMap));
  }

  if (!newRelIds.dm || !newRelIds.lo || !newRelIds.qs || !newRelIds.cs) {
    throw new Error("SmartArt transplant failed to create required relationship ids.");
  }

  targetZip.file(targetRelsPath, serializeRelationships(targetRels));
  const targetSlideXml = await readZipXml(targetZip, targetSlidePath);
  const nextObjectId = maxShapeId(targetSlideXml) + 1;
  const positionedFrame = replaceSmartArtRelIds(
    replaceGraphicFramePosition(ensureSmartArtNamespaces(graphicFrame), element, nextObjectId),
    newRelIds as { dm: string; lo: string; qs: string; cs: string }
  );
  const patchedSlide = targetSlideXml.replace("</p:spTree>", `${positionedFrame}</p:spTree>`);
  targetZip.file(targetSlidePath, patchedSlide);

  const contentTypesXml = await readZipXml(targetZip, "[Content_Types].xml");
  targetZip.file("[Content_Types].xml", ensureContentTypeOverrides(contentTypesXml, newPartNames));
}

async function applySmartArtElements(pptxPath: string, deck: DeckSpec): Promise<void> {
  const smartArtItems = deck.slides.flatMap((slide, slideIndex) =>
    slide.elements
      .filter((element): element is Extract<SlideElement, { type: "smartart" }> => element.type === "smartart")
      .map((element) => ({ slideIndex, element }))
  );
  if (smartArtItems.length === 0) {
    return;
  }
  const zip = await JSZip.loadAsync(await readFile(pptxPath));
  for (const item of smartArtItems) {
    await transplantSmartArtElement(zip, item.slideIndex, item.element);
  }
  await writeFile(pptxPath, await zip.generateAsync({ type: "nodebuffer" }));
}

function isTemplatePart(name: string): boolean {
  return POWERPOINT_TEMPLATE_PART_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function isTemplateContentTypePart(name: string): boolean {
  return (
    /^ppt\/slideMasters\/slideMaster\d+\.xml$/i.test(name) ||
    /^ppt\/slideLayouts\/slideLayout\d+\.xml$/i.test(name) ||
    /^ppt\/theme\/theme\d+\.xml$/i.test(name)
  );
}

function isRealZipFile(zip: ZipArchive, name: string): boolean {
  return Boolean(zip.file(name));
}

function ensurePowerPointTemplateContentTypes(targetXml: string, sourceXml: string, sourceNames: string[]): string {
  let xml = targetXml;
  xml = xml.replace(/<Override\b[^>]*PartName="\/ppt\/(?:slideMasters|slideLayouts|theme)\/[^"]+"[^>]*\/>/gi, "");

  const hasDefault = (extension: string) => new RegExp(`<Default\\b[^>]*Extension="${extension}"`, "i").test(xml);
  const addDefault = (extension: string, contentType: string) => {
    if (hasDefault(extension)) {
      return;
    }
    xml = xml.replace("</Types>", `<Default Extension="${extension}" ContentType="${contentType}"/></Types>`);
  };
  for (const match of sourceXml.matchAll(/<Default\b[^>]*\/>/gi)) {
    const tag = match[0];
    const ext = relationshipAttr(tag, "Extension");
    const type = relationshipAttr(tag, "ContentType");
    if (ext && type && sourceNames.some((name) => name.toLowerCase().endsWith(`.${ext.toLowerCase()}`))) {
      addDefault(ext, type);
    }
  }

  const hasOverride = (partName: string) => new RegExp(`<Override\\b[^>]*PartName="${partName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "i").test(xml);
  const addOverride = (partName: string, contentType: string) => {
    if (hasOverride(partName)) {
      return;
    }
    xml = xml.replace("</Types>", `<Override PartName="${partName}" ContentType="${contentType}"/></Types>`);
  };

  const sourceOverrides = [...sourceXml.matchAll(/<Override\b[^>]*\/>/gi)].map((match) => {
    const tag = match[0];
    return { partName: relationshipAttr(tag, "PartName"), contentType: relationshipAttr(tag, "ContentType") };
  });
  for (const name of sourceNames.filter(isTemplateContentTypePart)) {
    const partName = `/${name}`;
    const source = sourceOverrides.find((entry) => entry.partName === partName);
    const fallback = name.includes("/slideMasters/")
      ? "application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"
      : name.includes("/slideLayouts/")
        ? "application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"
        : "application/vnd.openxmlformats-officedocument.theme+xml";
    addOverride(partName, source?.contentType ?? fallback);
  }

  return xml;
}

function prefixedTemplateMediaName(name: string): string {
  return name.replace(/^ppt\/media\//i, "ppt/media/pptcreater-template-");
}

function rewriteTemplateMediaTargets(xml: string, mediaMap: Map<string, string>): string {
  return xml.replace(/\bTarget="([^"]*media\/([^"]+))"/gi, (match, target: string, fileName: string) => {
    const mapped = mediaMap.get(`ppt/media/${fileName}`);
    if (!mapped) {
      return match;
    }
    return `Target="${target.replace(/media\/[^"]+$/i, `media/${mapped.split("/").pop()}`)}"`;
  });
}

async function copyPowerPointTemplateParts(targetZip: ZipArchive, sourceZip: ZipArchive): Promise<void> {
  const targetNames = zipNames(targetZip);
  for (const name of targetNames) {
    if (isTemplatePart(name)) {
      targetZip.remove(name);
    }
  }

  const sourceNames = zipNames(sourceZip);
  const mediaMap = new Map<string, string>();
  for (const name of sourceNames.filter((item) => item.startsWith("ppt/media/"))) {
    mediaMap.set(name, prefixedTemplateMediaName(name));
  }

  for (const name of sourceNames) {
    if (isTemplatePart(name) || name.startsWith("ppt/media/")) {
      const file = sourceZip.file(name);
      if (!file) {
        continue;
      }
      const targetName = mediaMap.get(name) ?? name;
      const data = name.endsWith(".xml") || name.endsWith(".rels")
        ? rewriteTemplateMediaTargets(await file.async("string"), mediaMap)
        : await file.async("nodebuffer");
      targetZip.file(targetName, data);
    }
  }

  const targetContentTypes = await readZipXml(targetZip, "[Content_Types].xml");
  const sourceContentTypes = await readZipXml(sourceZip, "[Content_Types].xml");
  if (targetContentTypes) {
    targetZip.file("[Content_Types].xml", ensurePowerPointTemplateContentTypes(targetContentTypes, sourceContentTypes, sourceNames));
  }
}

function layoutKindForSlide(slide: DeckSpec["slides"][number], slideIndex: number): "title" | "content" | "closing" {
  const layout = (slide.layout ?? "").toLowerCase();
  if (slideIndex === 0 || layout === "title" || layout === "title-slide" || layout === "cover") {
    return "title";
  }
  if (layout.includes("closing") || layout.includes("thank") || slide.id === "closing") {
    return "closing";
  }
  return "content";
}

function slideLayoutTarget(layoutPath: string): string {
  return `../${layoutPath.replace(/^ppt\//, "")}`;
}

async function updateSlideLayoutRelationship(
  targetZip: ZipArchive,
  slideNumber: number,
  layoutPath: string,
  removeSolidBackground: boolean
): Promise<void> {
  const relsPath = `ppt/slides/_rels/slide${slideNumber}.xml.rels`;
  const rels = parseRelationships(await readZipXml(targetZip, relsPath));
  const nextRels = rels.filter((rel) => !/\/slideLayout$/i.test(rel.type));
  nextRels.push({
    id: nextRelationshipId(nextRels),
    type: `${OFFICE_REL_NS}/slideLayout`,
    target: slideLayoutTarget(layoutPath)
  });
  targetZip.file(relsPath, serializeRelationships(nextRels));

  if (removeSolidBackground) {
    const slidePath = `ppt/slides/slide${slideNumber}.xml`;
    const slideXml = await readZipXml(targetZip, slidePath);
    const withoutBackground = slideXml.replace(/<p:bg>[\s\S]*?<\/p:bg>/, "");
    if (withoutBackground !== slideXml) {
      targetZip.file(slidePath, withoutBackground);
    }
  }
}

function layoutName(xml: string): string {
  return /<p:cSld\b[^>]*\bname="([^"]*)"/i.exec(xml)?.[1] ?? "";
}

function hasPlaceholder(xml: string, placeholder: string): boolean {
  return new RegExp(`<p:ph\\b[^>]*\\btype="${placeholder}"`, "i").test(xml);
}

async function chooseTemplateLayouts(
  sourceZip: ZipArchive,
  template: PowerPointTemplatePackage
): Promise<{ title: string; content: string; closing: string }> {
  const paths = zipNames(sourceZip).filter((name) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/i.test(name));
  const entries = await Promise.all(
    paths.map(async (path) => {
      const xml = await readZipXml(sourceZip, path);
      return { path, xml, name: layoutName(xml).toLowerCase() };
    })
  );
  const explicit = (path: string | undefined) => (path && isRealZipFile(sourceZip, path) ? path : undefined);
  const title =
    explicit(template.titleLayoutPath) ??
    entries.find((entry) => /title/i.test(entry.name) || hasPlaceholder(entry.xml, "ctrTitle"))?.path ??
    entries[0]?.path;
  const closing =
    explicit(template.closingLayoutPath) ??
    entries.find((entry) => /(thank|closing|end|qa|q&a)/i.test(entry.name))?.path ??
    title;
  const content =
    explicit(template.contentLayoutPath) ??
    entries.find((entry) => ![title, closing].includes(entry.path) && /(content|text|blank|header)/i.test(entry.name))?.path ??
    entries.find((entry) => ![title, closing].includes(entry.path))?.path ??
    title;
  if (!title || !content || !closing) {
    throw new Error("PowerPoint template package does not contain usable slide layouts.");
  }
  return { title, content, closing };
}

function sourceSlideMasterRelationships(sourcePresentationRels: string): Relationship[] {
  return parseRelationships(sourcePresentationRels).filter((rel) => /\/slideMaster$/i.test(rel.type));
}

function normalizeHexColor(value: string | undefined): string | undefined {
  const hex = value?.trim().replace(/^#/, "");
  return hex && /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex.toLowerCase()}` : undefined;
}

function themeSlotColor(themeXml: string, slot: string): string | undefined {
  const aliases: Record<string, string> = { bg1: "lt1", tx1: "dk1", bg2: "lt2", tx2: "dk2" };
  return themeColor(themeXml, aliases[slot] ?? slot);
}

function backgroundThemeSlotColor(themeXml: string, slot: string): string | undefined {
  const aliases: Record<string, string> = { bg1: "lt1", tx1: "dk1", bg2: "dk2", tx2: "lt2" };
  return themeColor(themeXml, aliases[slot] ?? slot) ?? themeSlotColor(themeXml, slot);
}

function solidFillColor(xml: string, themeXml: string): string | undefined {
  const solid = /<a:solidFill\b[^>]*>([\s\S]*?)<\/a:solidFill>/i.exec(xml)?.[1] ?? xml;
  const srgb = normalizeHexColor(/<a:srgbClr\b[^>]*\bval="([0-9a-fA-F]{6})"/i.exec(solid)?.[1]);
  if (srgb) {
    return srgb;
  }
  const scheme = /<a:schemeClr\b[^>]*\bval="([^"]+)"/i.exec(solid)?.[1];
  return scheme ? themeSlotColor(themeXml, scheme) : undefined;
}

function backgroundColorFromXml(xml: string, themeXml: string): string | undefined {
  const bg = /<p:bg\b[\s\S]*?<\/p:bg>/i.exec(xml)?.[0];
  if (!bg) {
    return undefined;
  }
  const bgRef = /<p:bgRef\b[\s\S]*?<\/p:bgRef>/i.exec(bg)?.[0];
  const bgRefScheme = bgRef ? /<a:schemeClr\b[^>]*\bval="([^"]+)"/i.exec(bgRef)?.[1] : undefined;
  if (bgRefScheme) {
    return backgroundThemeSlotColor(themeXml, bgRefScheme);
  }
  return solidFillColor(bg, themeXml);
}

function largestSolidShapeColor(xml: string, themeXml: string): string | undefined {
  let best: { color: string; area: number } | undefined;
  for (const match of xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/gi)) {
    const shapeXml = match[0];
    if (/<p:ph\b/i.test(shapeXml)) {
      continue;
    }
    const color = solidFillColor(shapeXml, themeXml);
    if (!color) {
      continue;
    }
    const cx = Number(/<a:ext\b[^>]*\bcx="(\d+)"/i.exec(shapeXml)?.[1] ?? 0);
    const cy = Number(/<a:ext\b[^>]*\bcy="(\d+)"/i.exec(shapeXml)?.[1] ?? 0);
    const area = cx * cy;
    if (!best || area > best.area) {
      best = { color, area };
    }
  }
  return best?.color;
}

async function templateMasterXml(sourceZip: ZipArchive): Promise<string> {
  const masterName = zipNames(sourceZip).find((name) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/i.test(name));
  return masterName ? readZipXml(sourceZip, masterName) : "";
}

function relsPathForPackagePart(partName: string): string {
  return partName.replace(/\/([^/]+)$/u, "/_rels/$1.rels");
}

function packagePartDirectory(partName: string): string {
  return partName.replace(/\/[^/]+$/u, "");
}

function resolvePackageRelTarget(target: string, baseDir: string): string | undefined {
  if (/^[a-z]+:/iu.test(target)) {
    return undefined;
  }
  if (target.startsWith("/")) {
    return target.replace(/^\/+/u, "");
  }
  const parts = baseDir.split("/").filter(Boolean);
  for (const part of target.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/");
}

async function templateThemeXml(sourceZip: ZipArchive): Promise<string> {
  const masterName = zipNames(sourceZip).find((name) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/i.test(name));
  if (masterName) {
    const rels = parseRelationships(await readZipXml(sourceZip, relsPathForPackagePart(masterName)));
    const themeRel = rels.find((rel) => /\/theme$/i.test(rel.type));
    if (themeRel) {
      const resolved = resolvePackageRelTarget(themeRel.target, packagePartDirectory(masterName));
      if (resolved && sourceZip.file(resolved)) {
        return readZipXml(sourceZip, resolved);
      }
    }
  }

  const themeName = zipNames(sourceZip).find((name) => /^ppt\/theme\/theme\d+\.xml$/i.test(name));
  return themeName ? readZipXml(sourceZip, themeName) : "";
}

async function inferTemplateBackgrounds(
  sourceZip: ZipArchive,
  templatePackage: PowerPointTemplatePackage,
  template: TemplateManifest
): Promise<Record<"title" | "content" | "closing", string | undefined>> {
  const layouts = await chooseTemplateLayouts(sourceZip, templatePackage);
  const themeXml = await templateThemeXml(sourceZip);
  const masterXml = await templateMasterXml(sourceZip);
  const masterBackground = backgroundColorFromXml(masterXml, themeXml) ?? largestSolidShapeColor(masterXml, themeXml);
  const colorFor = async (layoutPath: string, fallback?: string) => {
    const layoutXml = await readZipXml(sourceZip, layoutPath);
    return backgroundColorFromXml(layoutXml, themeXml) ?? largestSolidShapeColor(layoutXml, themeXml) ?? masterBackground ?? fallback;
  };
  return {
    title: await colorFor(layouts.title, template.titleSlide?.background?.color ?? template.tokens.colors.background),
    content: await colorFor(layouts.content, template.contentSlide?.background?.color ?? template.tokens.colors.background),
    closing: await colorFor(layouts.closing, template.closingSlide?.background?.color ?? template.tokens.colors.background)
  };
}

type ResolvedPowerPointTemplate = {
  manifest: TemplateManifest;
  templatePackage: PowerPointTemplatePackage;
  backgrounds: Record<"title" | "content" | "closing", string | undefined>;
};

async function updatePresentationMasters(targetZip: ZipArchive, sourceZip: ZipArchive): Promise<void> {
  const sourcePresentation = await readZipXml(sourceZip, "ppt/presentation.xml");
  const sourceMasterList = /<p:sldMasterIdLst\b[\s\S]*?<\/p:sldMasterIdLst>/i.exec(sourcePresentation)?.[0];
  if (!sourceMasterList) {
    return;
  }

  const sourceMasterRels = sourceSlideMasterRelationships(await readZipXml(sourceZip, "ppt/_rels/presentation.xml.rels"));
  if (sourceMasterRels.length === 0) {
    return;
  }

  const targetRelsPath = "ppt/_rels/presentation.xml.rels";
  const targetRels = parseRelationships(await readZipXml(targetZip, targetRelsPath)).filter((rel) => !/\/slideMaster$/i.test(rel.type));
  const relIdMap = new Map<string, string>();
  for (const sourceRel of sourceMasterRels) {
    const id = nextRelationshipId(targetRels);
    relIdMap.set(sourceRel.id, id);
    targetRels.push({ ...sourceRel, id });
  }
  targetZip.file(targetRelsPath, serializeRelationships(targetRels));

  const targetPresentationPath = "ppt/presentation.xml";
  const targetPresentation = await readZipXml(targetZip, targetPresentationPath);
  const mappedMasterList = sourceMasterList.replace(/r:id="([^"]+)"/g, (match, id: string) => `r:id="${relIdMap.get(id) ?? id}"`);
  const patched = /<p:sldMasterIdLst\b[\s\S]*?<\/p:sldMasterIdLst>/i.test(targetPresentation)
    ? targetPresentation.replace(/<p:sldMasterIdLst\b[\s\S]*?<\/p:sldMasterIdLst>/i, mappedMasterList)
    : targetPresentation.replace(/(<p:presentation\b[^>]*>)/i, `$1${mappedMasterList}`);
  targetZip.file(targetPresentationPath, patched);
}

async function resolvePowerPointTemplate(deck: DeckSpec): Promise<ResolvedPowerPointTemplate | undefined> {
  const template = (await listAllTemplates()).find((item) => item.id === deck.template);
  if (!template?.powerPointTemplate) {
    return undefined;
  }
  const sourceZip = await JSZip.loadAsync(decodePowerPointPackageDataUri(template.powerPointTemplate.dataUri));
  return {
    manifest: template,
    templatePackage: template.powerPointTemplate,
    backgrounds: await inferTemplateBackgrounds(sourceZip, template.powerPointTemplate, template)
  };
}

async function applyPowerPointTemplatePackage(pptxPath: string, deck: DeckSpec, template: PowerPointTemplatePackage): Promise<void> {
  const sourceZip = await JSZip.loadAsync(decodePowerPointPackageDataUri(template.dataUri));
  const targetZip = await JSZip.loadAsync(await readFile(pptxPath));
  await copyPowerPointTemplateParts(targetZip, sourceZip);
  await updatePresentationMasters(targetZip, sourceZip);

  const layouts = await chooseTemplateLayouts(sourceZip, template);
  for (const [index, slide] of deck.slides.entries()) {
    const kind = layoutKindForSlide(slide, index);
    const layoutPath = kind === "title" ? layouts.title : kind === "closing" ? layouts.closing : layouts.content;
    await updateSlideLayoutRelationship(targetZip, index + 1, layoutPath, !slide.background?.imageDataUri);
  }

  await writeFile(pptxPath, await targetZip.generateAsync({ type: "nodebuffer" }));
}

function elementOverlapArea(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

function containingShapeFill(element: Extract<SlideElement, { type: "text" }>, elements: SlideElement[]): string | undefined {
  const textArea = element.w * element.h;
  if (textArea <= 0) {
    return undefined;
  }

  let best: { fill: string; overlap: number; order: number } | undefined;
  for (const candidate of elements) {
    if (candidate.type !== "shape" || candidate.fill === "none" || (candidate.fillOpacity !== undefined && candidate.fillOpacity < 0.65)) {
      continue;
    }
    if ((candidate.readingOrder ?? 0) > (element.readingOrder ?? Number.MAX_SAFE_INTEGER)) {
      continue;
    }
    const overlap = elementOverlapArea(element, candidate) / textArea;
    if (overlap < 0.6) {
      continue;
    }
    const order = candidate.readingOrder ?? 0;
    if (!best || overlap > best.overlap || (overlap === best.overlap && order > best.order)) {
      best = { fill: candidate.fill, overlap, order };
    }
  }
  return best?.fill;
}

function readableTextColor(foreground: string | undefined, background: string, fontSize: number): string | undefined {
  const current = foreground ?? "#000000";
  const minimum = fontSize >= 24 ? 3 : 4.5;
  if (contrastRatio(current, background) >= minimum) {
    return foreground;
  }
  return contrastRatio("#ffffff", background) >= contrastRatio("#000000", background) ? "#ffffff" : "#000000";
}

function adjustTextForTemplateBackground(
  slide: DeckSpec["slides"][number],
  slideIndex: number,
  deck: DeckSpec,
  tokens: DesignTokens,
  template: ResolvedPowerPointTemplate
): DeckSpec["slides"][number] {
  const kind = layoutKindForSlide(slide, slideIndex);
  const templateBackground = template.backgrounds[kind];
  if (!templateBackground) {
    return slide;
  }

  const elements = slide.elements.map((element) => {
    if (element.type !== "text") {
      return element;
    }
    const localBackground = containingShapeFill(element, slide.elements) ?? templateBackground;
    const fontSize = element.fontSize ?? defaultFontSizeForRole(element.role, tokens);
    const color = readableTextColor(element.color, localBackground, fontSize);
    if (!color || color === element.color) {
      return element;
    }
    return { ...element, color, contrastBackground: localBackground };
  });

  return { ...slide, elements };
}

function collectSlideAccessibilityNotes(deck: DeckSpec, deckSlide: DeckSpec["slides"][number], slideIndex: number): string[] {
  const notes = [`Slide ${slideIndex + 1}: ${deckSlide.title}`];
  const sourcesById = new Map(deck.metadata.sources.map((source) => [source.id, source]));
  deckSlide.elements.forEach((element) => {
    if ("altText" in element && element.altText) {
      notes.push(`${element.id}: ${element.altText}`);
    }

    if (element.type === "diagram") {
      notes.push(`${element.id} long description: ${element.longDescription}`);
    }

    if (element.type === "smartart") {
      notes.push(`${element.id} SmartArt description: ${element.longDescription}`);
    }

    if (element.sourceId) {
      const source = sourcesById.get(element.sourceId);
      notes.push(
        [
          `Source for ${element.id}: ${source?.title ?? element.sourceId}`,
          source?.url ? `URL: ${source.url}` : undefined,
          source?.usage ? `Usage: ${source.usage}` : undefined,
          source?.attribution ? `Attribution: ${source.attribution}` : undefined,
          element.citation ? `Citation: ${element.citation}` : undefined
        ]
          .filter((item): item is string => Boolean(item))
          .join(" | ")
      );
    }
  });

  return notes;
}

export async function renderDeckToPptx(input: unknown, outputPath: string, options: RenderOptions = {}): Promise<RenderResult> {
  const parsedDeck = await inlineLocalImagePaths(ensureSourceReferenceSlide(parseDeckSpec(input)));
  // Errors that layout polish deterministically resolves (text wrapping/fitting and reading-order
  // reassignment) must not block rendering. Everything else — out-of-bounds shapes, duplicate ids,
  // low contrast, missing alt text — is a genuine authoring mistake and is surfaced before we render.
  const polishFixableCodes = new Set<string>(POLISH_FIXABLE_LINT_CODES);
  const prePolishErrors = lintDeckSpec(parsedDeck).issues.filter(
    (item) => item.severity === "error" && !polishFixableCodes.has(item.code)
  );
  if (prePolishErrors.length > 0 && !options.allowLintErrors) {
    const summary = prePolishErrors
      .slice(0, 8)
      .map((item) => `${item.code} (${item.path})`)
      .join("; ");
    throw new Error(`Deck has ${prePolishErrors.length} lint error(s) that layout polish cannot fix: ${summary}.`);
  }

  const deck = normalizeDeckLayout(parsedDeck);
  const lintReport = lintDeckSpec(deck);
  const warnings = lintReport.issues.map((item) => `${item.severity}:${item.code}:${item.path}:${item.message}`);
  const errors = lintReport.issues.filter((item) => item.severity === "error");
  if (errors.length > 0 && !options.allowLintErrors) {
    const summary = errors
      .slice(0, 8)
      .map((item) => `${item.code} (${item.path})`)
      .join("; ");
    throw new Error(
      `Deck still has ${errors.length} lint error(s) after layout polish: ${summary}. ` +
        "Shorten the copy, enlarge the box, raise contrast, or add alt text."
    );
  }
  const tokens = deck.tokens ?? defaultTokens(deck.locale);
  const powerPointTemplate = await resolvePowerPointTemplate(deck);
  const pptx = new PptxGenJSConstructor();

  if (deck.slideSize) {
    const layoutName = "IMPORTED_SIZE";
    pptx.defineLayout({ name: layoutName, width: deck.slideSize.widthInches, height: deck.slideSize.heightInches });
    pptx.layout = layoutName;
  } else {
    pptx.layout = "LAYOUT_WIDE";
  }
  pptx.author = deck.metadata.author ?? "pptcreater";
  pptx.subject = deck.metadata.subject ?? deck.title;
  pptx.title = deck.title;
  pptx.company = "pptcreater";
  pptx.lang = deck.locale;
  pptx.theme = {
    headFontFace: tokens.typography.headingFont,
    bodyFontFace: tokens.typography.bodyFont,
    lang: deck.locale
  };

  const renderSlides = powerPointTemplate
    ? deck.slides.map((slide, index) => adjustTextForTemplateBackground(slide, index, deck, tokens, powerPointTemplate))
    : deck.slides;
  const renderDeck = powerPointTemplate ? { ...deck, slides: renderSlides } : deck;

  for (const [slideIndex, deckSlide] of renderSlides.entries()) {
    const slide = pptx.addSlide();
    if (!powerPointTemplate || deckSlide.background?.imageDataUri) {
      slide.background = await resolveSlideBackground(deckSlide, tokens);
    }
    const safeSlide = normalizeReadingOrder(deckSlide);
    for (const element of sortedElements(safeSlide.elements)) {
      await addElement(slide, element, renderDeck, slideIndex);
    }

    if (renderDeck.headerFooter && !powerPointTemplate) {
      addHeaderFooter(slide, renderDeck, tokens);
    }

    const notes = [deckSlide.speakerNotes, ...collectSlideAccessibilityNotes(renderDeck, deckSlide, slideIndex)]
      .filter((note): note is string => Boolean(note))
      .join("\n");
    if (notes) {
      slide.addNotes(notes);
    }
  }

  await pptx.writeFile({ fileName: outputPath });
  await markShapeAccessibility(outputPath, renderDeck);
  if (powerPointTemplate) {
    await applyPowerPointTemplatePackage(outputPath, renderDeck, powerPointTemplate.templatePackage);
  }
  await applySmartArtElements(outputPath, renderDeck);
  return { outputPath, warnings };
}
