import { contrastRatio, defaultTokens } from "./color.js";
import type { DesignTokens, Locale, ShapeElement, Slide, SlideElement, TextElement } from "./schema.js";

const SLIDE_WIDTH = 13.333;
const SLIDE_HEIGHT = 7.5;
const MARGIN_X = 0.9;
const CONTENT_TOP = 2.05;
const CONTENT_BOTTOM = 7.05;
const BODY_FONT = 16;
const LINE_HEIGHT = 1.5;
const BLOCK_GAP = 0.22;
const MAX_ITEMS = 6;

export type DetailVariant = "explanation" | "qa" | "benefits";

export type DetailBlock = {
  heading?: string;
  body: string;
};

export type QaItem = {
  question: string;
  answer: string;
};

export type BenefitItem = {
  label: string;
  description: string;
};

export type DetailSlideInput = {
  variant?: DetailVariant;
  title: string;
  lead?: string;
  blocks?: DetailBlock[];
  items?: Array<QaItem | BenefitItem>;
  speakerNotes?: string;
};

export type DetailSlideOptions = {
  locale?: Locale;
  tokens?: DesignTokens;
  accent?: string;
  id?: string;
  idPrefix?: string;
};

export type DetailSlideResult = {
  slide: Slide;
  warnings: string[];
};

function readableOn(background: string, candidate: string, fallback: string): string {
  return contrastRatio(candidate, background) >= 4.5 ? candidate : fallback;
}

function estimateLines(text: string, widthInches: number, fontSize: number): number {
  // Approximate characters per line, treating CJK as ~1 unit and ASCII as ~0.55 unit.
  const units = Array.from(text.replace(/\n/g, "")).reduce((sum, char) => {
    if (/[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]/u.test(char)) {
      return sum + 1;
    }
    return sum + 0.55;
  }, 0);
  const charsPerLine = Math.max(6, (widthInches * 72 * 0.92) / (fontSize * 0.95));
  const explicitLines = text.split("\n").length;
  return Math.max(explicitLines, Math.ceil(units / charsPerLine));
}

function textElement(
  id: string,
  role: TextElement["role"],
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  readingOrder: number,
  fontSize: number,
  color: string,
  contrastBackground: string,
  options: { bold?: boolean; align?: TextElement["align"]; valign?: TextElement["valign"] } = {}
): TextElement {
  return {
    id,
    type: "text",
    x,
    y,
    w,
    h,
    role,
    text,
    fontSize,
    color,
    contrastBackground,
    bold: options.bold ?? false,
    align: options.align ?? "left",
    valign: options.valign ?? "top",
    decorative: false,
    readingOrder
  };
}

function shapeElement(
  id: string,
  shape: ShapeElement["shape"],
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  readingOrder: number,
  radius?: number
): ShapeElement {
  return {
    id,
    type: "shape",
    x,
    y,
    w,
    h,
    shape,
    fill,
    radius,
    decorative: true,
    readingOrder
  };
}

type Measured = { build: (y: number, ro: number) => SlideElement[]; height: number };

// Distribute measured blocks across the content band. When the natural total exceeds the available
// height, gaps (and only gaps) are compressed first; boxes keep their measured height so render
// polish can still fit/scale the text without blocks overlapping.
function stackBlocks(measured: Measured[]): SlideElement[] {
  const naturalHeight = measured.reduce((sum, block) => sum + block.height, 0) + BLOCK_GAP * Math.max(0, measured.length - 1);
  const available = CONTENT_BOTTOM - CONTENT_TOP;
  const gap = naturalHeight > available && measured.length > 1
    ? Math.max(0.08, BLOCK_GAP - (naturalHeight - available) / (measured.length - 1))
    : BLOCK_GAP;

  const elements: SlideElement[] = [];
  let y = CONTENT_TOP;
  let ro = 20;
  for (const block of measured) {
    elements.push(...block.build(y, ro));
    y += block.height + gap;
    ro += 10;
  }
  return elements;
}

function header(
  prefix: string,
  title: string,
  lead: string | undefined,
  accent: string,
  background: string,
  textColor: string,
  mutedColor: string
): SlideElement[] {
  const titleColor = readableOn(background, textColor, "#111827");
  const elements: SlideElement[] = [
    textElement(`${prefix}-title`, "title", title, MARGIN_X, 0.5, SLIDE_WIDTH - MARGIN_X * 2, 0.72, 1, 30, titleColor, background, {
      bold: true,
      valign: "middle"
    }),
    shapeElement(`${prefix}-rule`, "rect", MARGIN_X + 0.02, 1.28, 1.1, 0.07, accent, 2)
  ];
  if (lead && lead.trim().length > 0) {
    elements.push(
      textElement(`${prefix}-lead`, "subtitle", lead.trim(), MARGIN_X, 1.42, SLIDE_WIDTH - MARGIN_X * 2, 0.5, 3, 18, readableOn(background, mutedColor, "#475569"), background)
    );
  }
  return elements;
}

function buildExplanation(prefix: string, blocks: DetailBlock[], accent: string, background: string, textColor: string, mutedColor: string): SlideElement[] {
  const width = SLIDE_WIDTH - MARGIN_X * 2 - 0.3;
  const x = MARGIN_X + 0.3;
  const measured: Measured[] = blocks.map((block, index) => {
    const headingLines = block.heading ? 1 : 0;
    const bodyLines = estimateLines(block.body, width, BODY_FONT);
    const headingH = headingLines ? 0.42 : 0;
    const bodyH = Math.max(0.4, bodyLines * (BODY_FONT * LINE_HEIGHT) / 72);
    return {
      height: headingH + bodyH,
      build: (y, ro) => {
        const els: SlideElement[] = [
          shapeElement(`${prefix}-bar-${index}`, "roundRect", MARGIN_X, y + 0.04, 0.08, headingH + bodyH - 0.08, accent, ro, 0.04)
        ];
        let cursor = y;
        if (block.heading) {
          els.push(
            textElement(`${prefix}-h-${index}`, "callout", block.heading, x, cursor, width, headingH, ro + 1, 18, readableOn(background, textColor, "#111827"), background, { bold: true })
          );
          cursor += headingH;
        }
        els.push(
          textElement(`${prefix}-b-${index}`, "body", block.body, x, cursor, width, bodyH, ro + 2, BODY_FONT, readableOn(background, mutedColor, "#334155"), background)
        );
        return els;
      }
    };
  });
  return stackBlocks(measured);
}

function buildQa(prefix: string, items: QaItem[], accent: string, background: string, textColor: string, mutedColor: string): SlideElement[] {
  const badge = 0.46;
  const textX = MARGIN_X + badge + 0.22;
  const width = SLIDE_WIDTH - MARGIN_X - textX - 0.1;
  const measured: Measured[] = items.map((item, index) => {
    const qLines = estimateLines(item.question, width, 17);
    const aLines = estimateLines(item.answer, width, BODY_FONT);
    const qH = Math.max(badge, qLines * (17 * LINE_HEIGHT) / 72);
    const aH = Math.max(0.4, aLines * (BODY_FONT * LINE_HEIGHT) / 72);
    return {
      height: qH + 0.12 + aH,
      build: (y, ro) => [
        shapeElement(`${prefix}-q-badge-${index}`, "roundRect", MARGIN_X, y, badge, badge, accent, ro, 0.08),
        textElement(`${prefix}-q-mark-${index}`, "callout", "Q", MARGIN_X, y, badge, badge, ro + 1, 18, "#ffffff", accent, { bold: true, align: "center", valign: "middle" }),
        textElement(`${prefix}-q-${index}`, "callout", item.question, textX, y, width, qH, ro + 2, 17, readableOn(background, textColor, "#111827"), background, { bold: true, valign: "middle" }),
        shapeElement(`${prefix}-a-badge-${index}`, "roundRect", MARGIN_X, y + qH + 0.12, badge, badge, "#e2e8f0", ro + 3, 0.08),
        textElement(`${prefix}-a-mark-${index}`, "caption", "A", MARGIN_X, y + qH + 0.12, badge, badge, ro + 4, 18, readableOn("#e2e8f0", accent, "#1e293b"), "#e2e8f0", { bold: true, align: "center", valign: "middle" }),
        textElement(`${prefix}-a-${index}`, "body", item.answer, textX, y + qH + 0.12, width, aH, ro + 5, BODY_FONT, readableOn(background, mutedColor, "#334155"), background)
      ]
    };
  });
  return stackBlocks(measured);
}

function buildBenefits(prefix: string, items: BenefitItem[], accent: string, background: string, textColor: string, mutedColor: string): SlideElement[] {
  const badge = 0.5;
  const textX = MARGIN_X + badge + 0.24;
  const width = SLIDE_WIDTH - MARGIN_X - textX - 0.1;
  const measured: Measured[] = items.map((item, index) => {
    const descLines = estimateLines(item.description, width, BODY_FONT);
    const labelH = 0.42;
    const descH = Math.max(0.36, descLines * (BODY_FONT * LINE_HEIGHT) / 72);
    return {
      height: Math.max(badge, labelH + descH),
      build: (y, ro) => [
        shapeElement(`${prefix}-num-${index}`, "ellipse", MARGIN_X, y, badge, badge, accent, ro),
        textElement(`${prefix}-num-mark-${index}`, "callout", String(index + 1), MARGIN_X, y, badge, badge, ro + 1, 20, "#ffffff", accent, { bold: true, align: "center", valign: "middle" }),
        textElement(`${prefix}-label-${index}`, "callout", item.label, textX, y, width, labelH, ro + 2, 18, readableOn(background, textColor, "#111827"), background, { bold: true }),
        textElement(`${prefix}-desc-${index}`, "body", item.description, textX, y + labelH, width, descH, ro + 3, BODY_FONT, readableOn(background, mutedColor, "#334155"), background)
      ]
    };
  });
  return stackBlocks(measured);
}

export function createDetailSlide(input: DetailSlideInput, options: DetailSlideOptions = {}): DetailSlideResult {
  const title = input.title.trim();
  if (title.length === 0) {
    throw new Error("Detail slide requires a non-empty title.");
  }

  const variant: DetailVariant = input.variant ?? "explanation";
  const locale = options.locale ?? "ja-JP";
  const tokens = options.tokens ?? defaultTokens(locale);
  const accent = options.accent ?? tokens.colors.accent;
  const background = tokens.colors.background;
  const textColor = tokens.colors.text;
  const mutedColor = tokens.colors.mutedText;
  const idPrefix = options.idPrefix ?? "detail";
  const slideId = options.id ?? `${idPrefix}-${variant}`;
  const prefix = slideId;

  const warnings: string[] = [];
  const elements: SlideElement[] = [...header(prefix, title, input.lead, accent, background, textColor, mutedColor)];

  if (variant === "qa") {
    let items = (input.items as QaItem[] | undefined) ?? [];
    if (items.length === 0) {
      throw new Error("Q&A detail slide requires at least one { question, answer } item.");
    }
    if (items.length > MAX_ITEMS) {
      warnings.push(`Q&A slide capped at ${MAX_ITEMS} items; ${items.length - MAX_ITEMS} dropped. Split across slides for readability.`);
      items = items.slice(0, MAX_ITEMS);
    }
    elements.push(...buildQa(prefix, items, accent, background, textColor, mutedColor));
  } else if (variant === "benefits") {
    let items = (input.items as BenefitItem[] | undefined) ?? [];
    if (items.length === 0) {
      throw new Error("Benefits detail slide requires at least one { label, description } item.");
    }
    if (items.length > MAX_ITEMS) {
      warnings.push(`Benefits slide capped at ${MAX_ITEMS} items; ${items.length - MAX_ITEMS} dropped. Split across slides for readability.`);
      items = items.slice(0, MAX_ITEMS);
    }
    elements.push(...buildBenefits(prefix, items, accent, background, textColor, mutedColor));
  } else {
    let blocks = input.blocks ?? [];
    if (blocks.length === 0) {
      throw new Error("Explanation detail slide requires at least one { body } block.");
    }
    if (blocks.length > MAX_ITEMS) {
      warnings.push(`Explanation slide capped at ${MAX_ITEMS} blocks; ${blocks.length - MAX_ITEMS} dropped. Split across slides for readability.`);
      blocks = blocks.slice(0, MAX_ITEMS);
    }
    elements.push(...buildExplanation(prefix, blocks, accent, background, textColor, mutedColor));
  }

  const slide: Slide = {
    id: slideId,
    title,
    // "qa" and "detail" are recognised by the lint as intentional text-rich slides, so they are
    // exempt from the visual-richness gate while every accessibility/overflow rule still applies.
    layout: variant === "qa" ? "qa" : "detail",
    speakerNotes: input.speakerNotes,
    elements
  };

  return { slide, warnings };
}
