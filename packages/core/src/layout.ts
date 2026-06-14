import type { DeckSpec, Slide, SlideElement, TextElement } from "./schema.js";

export const SLIDE_WIDE = {
  width: 13.333,
  height: 7.5,
  margin: 0.24
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function cloneElement<T extends SlideElement>(element: T): T {
  return { ...element };
}

export function estimateTextOverflow(element: TextElement): { overflows: boolean; estimatedLines: number; maxLines: number } {
  const fontSize = element.fontSize ?? (element.role === "title" ? 32 : element.role === "caption" ? 14 : 22);
  const averageCharWidthInches = (fontSize * 0.52) / 72;
  const charsPerLine = Math.max(1, Math.floor(element.w / averageCharWidthInches));
  const estimatedLines = Math.ceil(element.text.length / charsPerLine);
  const maxLines = Math.max(1, Math.floor((element.h * 72) / (fontSize * 1.2)));
  return {
    overflows: estimatedLines > maxLines,
    estimatedLines,
    maxLines
  };
}

function fitTextElement(element: TextElement): TextElement {
  let next: TextElement = cloneElement(element);
  let fontSize = next.fontSize ?? (next.role === "title" ? 32 : next.role === "caption" ? 14 : 22);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const overflow = estimateTextOverflow({ ...next, fontSize });
    if (!overflow.overflows) {
      break;
    }

    const expandedHeight = Math.min(SLIDE_WIDE.height - SLIDE_WIDE.margin - next.y, next.h + 0.16);
    if (expandedHeight > next.h) {
      next = { ...next, h: expandedHeight };
    } else {
      fontSize = Math.max(next.role === "caption" ? 10 : 14, fontSize - 1);
    }
  }

  return { ...next, fontSize };
}

function fitElementToSlide(element: SlideElement): SlideElement {
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
    return fitTextElement(next);
  }

  return next;
}

export function normalizeSlideLayout(slide: Slide): Slide {
  return normalizeReadingOrder({
    ...slide,
    elements: slide.elements.map(fitElementToSlide)
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
  return {
    ...deck,
    slides: deck.slides.map(normalizeSlideLayout)
  };
}
