import { defaultTokens } from "./color.js";
import type { DeckSpec, DesignTokens, Slide, SlideElement, TextElement } from "./schema.js";
import { defaultFontSizeForRole } from "./typography.js";

export const SLIDE_WIDE = {
  width: 13.333,
  height: 7.5,
  margin: 0.24
};

const TEXT_WIDTH_FACTOR = 0.52;
const JAPANESE_WIDTH_FACTOR = 0.92;
const ASCII_WIDTH_FACTOR = 0.52;
const SPACE_WIDTH_FACTOR = 0.32;
const LINE_HEIGHT_FACTOR = 1.22;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function cloneElement<T extends SlideElement>(element: T): T {
  return { ...element };
}

export function estimateTextOverflow(element: TextElement): { overflows: boolean; estimatedLines: number; maxLines: number } {
  const fontSize = element.fontSize ?? (element.role === "title" ? 32 : element.role === "caption" ? 14 : 22);
  const maxUnitsPerLine = Math.max(1, element.w / ((fontSize * TEXT_WIDTH_FACTOR) / 72));
  const estimatedLines = element.text
    .split(/\r?\n/)
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(textUnits(line) / maxUnitsPerLine)), 0);
  const maxLines = Math.max(1, Math.floor((element.h * 72) / (fontSize * LINE_HEIGHT_FACTOR)));
  return {
    overflows: estimatedLines > maxLines,
    estimatedLines,
    maxLines
  };
}

function textMinimumFontSize(element: TextElement): number {
  if (element.role === "title") {
    return 28;
  }

  if (element.role === "caption") {
    return 12;
  }

  return 20;
}

function textUnits(value: string): number {
  return Array.from(value).reduce((sum, char) => {
    if (/\s/.test(char)) {
      return sum + SPACE_WIDTH_FACTOR / TEXT_WIDTH_FACTOR;
    }

    if (/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(char)) {
      return sum + JAPANESE_WIDTH_FACTOR / TEXT_WIDTH_FACTOR;
    }

    return sum + ASCII_WIDTH_FACTOR / TEXT_WIDTH_FACTOR;
  }, 0);
}

function maxUnitsPerLine(width: number, fontSize: number): number {
  return Math.max(2, width / ((fontSize * TEXT_WIDTH_FACTOR) / 72));
}

function splitAtBalancedPoint(value: string, maxUnits: number): [string, string] {
  const chars = Array.from(value.trim());
  let units = 0;
  let fallbackIndex = 0;
  let preferredIndex = 0;

  for (let index = 0; index < chars.length; index += 1) {
    units += textUnits(chars[index]);
    if (units <= maxUnits) {
      fallbackIndex = index + 1;
      if (/[、。・,，/／\s]/.test(chars[index])) {
        preferredIndex = index + 1;
      }
    }

    if (units > maxUnits) {
      break;
    }
  }

  const splitIndex = Math.max(1, preferredIndex || fallbackIndex || Math.ceil(chars.length / 2));
  return [chars.slice(0, splitIndex).join("").trim(), chars.slice(splitIndex).join("").trim()];
}

function wrapParagraph(value: string, maxUnits: number, maxLines: number): string[] {
  const lines: string[] = [];
  let rest = value.trim();

  while (rest && lines.length < maxLines) {
    if (textUnits(rest) <= maxUnits) {
      lines.push(rest);
      rest = "";
      break;
    }

    const [head, tail] = splitAtBalancedPoint(rest, maxUnits);
    lines.push(head);
    rest = tail;
  }

  if (rest && lines.length >= maxLines) {
    lines.push(rest);
  }

  return lines.length ? lines : [value];
}

function normalizeTextLines(element: TextElement, fontSize: number): string {
  const maxLinesByHeight = Math.max(1, Math.floor((element.h * 72) / (fontSize * LINE_HEIGHT_FACTOR)));
  const roleLineCap = element.role === "title" ? 2 : element.role === "caption" ? 2 : 3;
  const lineCap = Math.min(maxLinesByHeight, roleLineCap);
  const unitsPerLine = maxUnitsPerLine(element.w, fontSize);

  if (element.text.includes("\n") && element.role !== "title") {
    const lines = element.text.split(/\r?\n/);
    const nonEmptyLineCount = lines.filter((line) => line.trim()).length;
    const wrapped = lines.flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return [line];
      }

      if (line !== trimmed) {
        return [line];
      }

      return wrapParagraph(trimmed, unitsPerLine, Math.max(1, lineCap - nonEmptyLineCount + 1));
    });
    return wrapped.join("\n");
  }

  if (element.text !== element.text.trim()) {
    return element.text;
  }

  if (element.text.length < 16) {
    return element.text;
  }

  if (lineCap <= 1 && textUnits(element.text) <= unitsPerLine) {
    return element.text.trim();
  }

  return wrapParagraph(element.text, unitsPerLine, lineCap).join("\n");
}

function fitTextElement(element: TextElement, tokens: DesignTokens): TextElement {
  let next: TextElement = cloneElement(element);
  let fontSize = next.fontSize ?? defaultFontSizeForRole(next.role, tokens);
  const minimumFontSize = Math.min(textMinimumFontSize(next), fontSize);

  for (let attempt = 0; attempt < 18; attempt += 1) {
    const text = normalizeTextLines(next, fontSize);
    const overflow = estimateTextOverflow({ ...next, text, fontSize });
    if (!overflow.overflows) {
      next = { ...next, text };
      break;
    }

    fontSize = Math.max(minimumFontSize, fontSize - 1);
    if (fontSize === minimumFontSize) {
      next = { ...next, text };
      break;
    }
  }

  return { ...next, fontSize };
}

function fitElementToSlide(element: SlideElement, tokens: DesignTokens): SlideElement {
  const next = cloneElement(element);
  const minWidth = next.type === "shape" && next.shape === "line" ? 0.05 : 0.12;
  const minHeight = next.type === "shape" && next.shape === "line" ? 0 : 0.08;
  next.x = clamp(next.x, 0, SLIDE_WIDE.width - minWidth);
  next.y = clamp(next.y, 0, SLIDE_WIDE.height - minHeight);
  next.w = clamp(next.w, minWidth, SLIDE_WIDE.width - next.x);
  next.h = clamp(next.h, minHeight, SLIDE_WIDE.height - next.y);

  if (next.type === "shape" && next.shape === "line") {
    next.h = Math.max(next.h, minHeight);
  }

  if (next.type === "text") {
    return fitTextElement(next, tokens);
  }

  return next;
}

export function normalizeSlideLayout(slide: Slide, tokens: DesignTokens = defaultTokens("en-US")): Slide {
  return normalizeReadingOrder({
    ...slide,
    elements: slide.elements.map((element) => fitElementToSlide(element, tokens))
  });
}

const FULL_BLEED_MARGIN = 0.35;

export function isFullBleed(element: SlideElement): boolean {
  return (
    element.x <= FULL_BLEED_MARGIN &&
    element.y <= FULL_BLEED_MARGIN &&
    element.x + element.w >= SLIDE_WIDE.width - FULL_BLEED_MARGIN &&
    element.y + element.h >= SLIDE_WIDE.height - FULL_BLEED_MARGIN
  );
}

// Stacking layers control draw order so decorative shapes never cover text.
// 0 = full-bleed backgrounds, 1 = decorative mid (cards, accents, scrims, lines, badges),
// 2 = text and non-decorative content visuals (icons, diagrams, content images).
function stackingLayer(element: SlideElement): number {
  if (element.type === "text") {
    return 2;
  }

  const opaqueShape = element.type === "shape" && element.fill !== "none";
  const fillableVisual = element.type === "image" || element.type === "svg";
  if (isFullBleed(element) && (opaqueShape || fillableVisual)) {
    return 0;
  }

  if (element.decorative) {
    return 1;
  }

  return 2;
}

// Re-stack elements into background/decoration/content layers and reassign a
// unique, monotonically increasing readingOrder. This guarantees text and
// content visuals always render on top of decorative shapes that share space.
export function normalizeReadingOrder(slide: Slide): Slide {
  const ranked = slide.elements
    .map((element, index) => ({
      element,
      index,
      layer: stackingLayer(element),
      readingOrder: element.readingOrder ?? index
    }))
    .sort((a, b) => {
      if (a.layer !== b.layer) {
        return a.layer - b.layer;
      }

      if (a.readingOrder !== b.readingOrder) {
        return a.readingOrder - b.readingOrder;
      }

      return a.index - b.index;
    });

  return {
    ...slide,
    elements: ranked.map((entry, position) => ({ ...entry.element, readingOrder: position + 1 }))
  };
}

export function normalizeDeckLayout(deck: DeckSpec): DeckSpec {
  const tokens = deck.tokens ?? defaultTokens(deck.locale);
  return {
    ...deck,
    slides: deck.slides.map((slide) => normalizeSlideLayout(slide, tokens))
  };
}
