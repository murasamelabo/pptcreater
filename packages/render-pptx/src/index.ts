import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { sanitizeSvg } from "@pptcreater/assets-svg";
import sharp from "sharp";
import {
  defaultFontSizeForRole,
  defaultTokens,
  ensureSourceReferenceSlide,
  lintDeckSpec,
  normalizeDeckLayout,
  normalizeReadingOrder,
  parseDeckSpec,
  POLISH_FIXABLE_LINT_CODES,
  type DeckSpec,
  type DesignTokens,
  type SlideElement
} from "@pptcreater/core";

export * from "./templateImport.js";

const require = createRequire(import.meta.url);
const JSZip = require("jszip") as { loadAsync(data: Buffer): Promise<{ file(name: string): { async(type: "string"): Promise<string> } | null; file(name: string, data: string): void; remove(name: string): void; generateAsync(options: { type: "nodebuffer" }): Promise<Buffer> }> };
type PptxSlide = {
  background: { color: string };
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
      const patched = xml.replace(/<p:cNvPr\b([^>]*\/?)>/g, (match, attrs: string) => {
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
      zip.file(name, patched);
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

  for (const [slideIndex, deckSlide] of deck.slides.entries()) {
    const slide = pptx.addSlide();
    slide.background = { color: tokens.colors.background.replace("#", "") };
    const safeSlide = normalizeReadingOrder(deckSlide);
    for (const element of sortedElements(safeSlide.elements)) {
      await addElement(slide, element, deck, slideIndex);
    }

    if (deck.headerFooter) {
      addHeaderFooter(slide, deck, tokens);
    }

    const notes = [deckSlide.speakerNotes, ...collectSlideAccessibilityNotes(deck, deckSlide, slideIndex)]
      .filter((note): note is string => Boolean(note))
      .join("\n");
    if (notes) {
      slide.addNotes(notes);
    }
  }

  await pptx.writeFile({ fileName: outputPath });
  await markShapeAccessibility(outputPath, deck);
  return { outputPath, warnings };
}
