import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { sanitizeSvg } from "@pptcreater/assets-svg";
import {
  defaultFontSizeForRole,
  defaultTokens,
  lintDeckSpec,
  normalizeDeckLayout,
  parseDeckSpec,
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

function assertSafeImageDataUri(dataUri: string): void {
  if (!/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-zA-Z0-9+/=\s]+$/i.test(dataUri)) {
    throw new Error("image.dataUri must be a base64 PNG, JPEG, GIF, or WebP image.");
  }
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
      align: element.align,
      valign: element.valign,
      fit: "shrink",
      margin: 0.02,
      breakLine: false
    });
    return;
  }

  if (element.type === "shape") {
    const fill = element.fill === "none" ? { type: "none" } : { color: element.fill.replace("#", "") };
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
      assertSafeImageDataUri(element.dataUri);
      slide.addImage({ data: element.dataUri, altText: element.decorative ? "" : element.altText, ...position });
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
  const deck = options.polishLayout ? normalizeDeckLayout(parseDeckSpec(input)) : parseDeckSpec(input);
  const lintReport = lintDeckSpec(deck);
  const warnings = lintReport.issues.map((item) => `${item.severity}:${item.code}:${item.path}:${item.message}`);
  const errors = lintReport.issues.filter((item) => item.severity === "error");
  if (errors.length > 0 && !options.allowLintErrors) {
    throw new Error(`Deck has ${errors.length} lint error(s). Fix them before rendering or pass allowLintErrors.`);
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
    sortedElements(deckSlide.elements).forEach((element) => addElement(slide, element, deck, slideIndex));

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
