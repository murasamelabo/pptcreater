import { createRequire } from "node:module";
import { sanitizeSvg } from "@pptcreater/assets-svg";
import {
  defaultFontSizeForRole,
  defaultTokens,
  lintDeckSpec,
  parseDeckSpec,
  type DeckSpec,
  type SlideElement
} from "@pptcreater/core";

const require = createRequire(import.meta.url);
type PptxSlide = {
  background: { color: string };
  addText(text: string, options: Record<string, unknown>): void;
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

function addElement(slide: PptxSlide, element: SlideElement, deck: DeckSpec): void {
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
      fit: "shrink",
      margin: 0.02,
      breakLine: false
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

function collectSlideAccessibilityNotes(deckSlide: DeckSpec["slides"][number], slideIndex: number): string[] {
  const notes = [`Slide ${slideIndex + 1}: ${deckSlide.title}`];
  deckSlide.elements.forEach((element) => {
    if ("altText" in element && element.altText) {
      notes.push(`${element.id}: ${element.altText}`);
    }

    if (element.type === "diagram") {
      notes.push(`${element.id} long description: ${element.longDescription}`);
    }
  });

  return notes;
}

export async function renderDeckToPptx(input: unknown, outputPath: string, options: RenderOptions = {}): Promise<RenderResult> {
  const deck = parseDeckSpec(input);
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
    sortedElements(deckSlide.elements).forEach((element) => addElement(slide, element, deck));

    const notes = [deckSlide.speakerNotes, ...collectSlideAccessibilityNotes(deckSlide, slideIndex)]
      .filter((note): note is string => Boolean(note))
      .join("\n");
    if (notes) {
      slide.addNotes(notes);
    }
  });

  await pptx.writeFile({ fileName: outputPath });
  return { outputPath, warnings };
}
