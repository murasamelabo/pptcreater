import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { sanitizeSvg } from "@pptcreater/assets-svg";
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
  type SlideElement
} from "@pptcreater/core";

const require = createRequire(import.meta.url);
const JSZip = require("jszip") as { loadAsync(data: Buffer): Promise<{ file(name: string): { async(type: "string"): Promise<string> } | null; file(name: string, data: string): void; generateAsync(options: { type: "nodebuffer" }): Promise<Buffer> }> };
type PptxSlide = {
  background: { color: string };
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
  addSlide(): PptxSlide;
  writeFile(options: { fileName: string }): Promise<void>;
};

const PptxGenJSConstructor = require("pptxgenjs") as { new (): PptxPresentation };
const MAX_LOCAL_IMAGE_BYTES = 20 * 1024 * 1024;
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

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(sanitizeSvg(svg), "utf8").toString("base64")}`;
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
    return svgDataUri(await readFile(realPath, "utf8"));
  }

  return `data:${mimeType};base64,${(await readFile(realPath)).toString("base64")}`;
}

async function inlineLocalImagePaths(deck: DeckSpec): Promise<DeckSpec> {
  const slides = await Promise.all(
    deck.slides.map(async (slide) => ({
      ...slide,
      elements: await Promise.all(
        slide.elements.map(async (element) => {
          if (element.type !== "image" || !element.path || element.dataUri) {
            return element;
          }

          return {
            ...element,
            dataUri: await localImagePathToDataUri(element.path)
          };
        })
      )
    }))
  );

  return {
    ...deck,
    slides
  };
}

function safeImageDataUri(dataUri: string): string {
  const match = /^data:image\/(svg\+xml|png|jpe?g|gif|webp);base64,([a-zA-Z0-9+/=\s]+)$/i.exec(dataUri);
  if (!match) {
    throw new Error("image.dataUri must be a base64 SVG, PNG, JPEG, GIF, or WebP image.");
  }

  if (match[1].toLowerCase() === "svg+xml") {
    return svgDataUri(Buffer.from(match[2].replace(/\s+/g, ""), "base64").toString("utf8"));
  }

  return dataUri;
}

function sortedElements(elements: SlideElement[]): SlideElement[] {
  return [...elements].sort((a, b) => (a.readingOrder ?? Number.MAX_SAFE_INTEGER) - (b.readingOrder ?? Number.MAX_SAFE_INTEGER));
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

function addElement(slide: PptxSlide, element: SlideElement, deck: DeckSpec, slideIndex: number): void {
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
    slide.addShape(pptxShapeName(element.shape), {
      ...position,
      objectName: shapeObjectName(element, slideIndex),
      fill,
      line,
      rectRadius: element.radius
    });
    return;
  }

  if (element.type === "svg" || element.type === "diagram") {
    slide.addImage({
      data: svgDataUri(element.svg),
      altText: element.decorative ? "" : element.altText ?? (element.type === "diagram" ? element.summary : undefined),
      ...position
    });
    return;
  }

  if (element.type === "image") {
    if (element.dataUri) {
      slide.addImage({ data: safeImageDataUri(element.dataUri), altText: element.decorative ? "" : element.altText, ...position });
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
    const decorativeAttrs = `${cleanedAttrs} ${descriptionAttr} decorative="1"`;
    const decorativeExtension =
      '<a:extLst><a:ext uri="{C183D7F6-B498-43B3-948B-1728B52AA6E4}"><a16:decorative xmlns:a16="http://schemas.microsoft.com/office/drawing/2014/main">1</a16:decorative></a:ext></a:extLst>';
    if (!selfClosing) {
      return `<p:cNvPr${decorativeAttrs}>${decorativeExtension}`;
    }

    return `<p:cNvPr${decorativeAttrs}>${decorativeExtension}</p:cNvPr>`;
  }

  return `<p:cNvPr${cleanedAttrs} ${descriptionAttr}${selfClosing ? "/>" : ">"}`;
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

  pptx.layout = "LAYOUT_WIDE";
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

  deck.slides.forEach((deckSlide, slideIndex) => {
    const slide = pptx.addSlide();
    slide.background = { color: tokens.colors.background.replace("#", "") };
    const safeSlide = normalizeReadingOrder(deckSlide);
    sortedElements(safeSlide.elements).forEach((element) => addElement(slide, element, deck, slideIndex));

    const notes = [deckSlide.speakerNotes, ...collectSlideAccessibilityNotes(deck, deckSlide, slideIndex)]
      .filter((note): note is string => Boolean(note))
      .join("\n");
    if (notes) {
      slide.addNotes(notes);
    }
  });

  await pptx.writeFile({ fileName: outputPath });
  await markShapeAccessibility(outputPath, deck);
  return { outputPath, warnings };
}
