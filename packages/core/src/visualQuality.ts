import type { DeckSpec, ShapeElement, Slide, SlideElement, TextElement } from "./schema.js";

export type VisualQualityIssue = {
  severity: "error" | "warning" | "suggestion";
  code: string;
  message: string;
  path: string;
  details?: Record<string, number | string | boolean>;
};

export type VisualQualityReport = {
  ok: boolean;
  issues: VisualQualityIssue[];
};

function accentBarCardCount(slide: Slide): number {
  const cards = slide.elements.filter(
    (element): element is ShapeElement =>
      element.type === "shape" &&
      (element.shape === "roundRect" || element.shape === "roundedRect") &&
      element.fill !== "none" &&
      element.w >= 1 &&
      element.h >= 0.7 &&
      element.altText !== "generated native schematic shape"
  );
  const matched = new Set<string>();
  for (const element of slide.elements) {
    if (element.type !== "shape" || element.shape !== "rect" || element.fill === "none" || element.w > 0.24 || element.h < 0.45) {
      continue;
    }
    const card = cards.find(
      (candidate) =>
        element.x >= candidate.x - 0.03 &&
        element.x + element.w <= candidate.x + Math.min(0.45, candidate.w) &&
        element.y >= candidate.y - 0.04 &&
        element.y + element.h <= candidate.y + candidate.h + 0.04
    );
    if (card) matched.add(card.id);
  }
  return matched.size;
}

function typographySpread(texts: TextElement[]): number {
  const sizes = texts.map((text) => text.fontSize).filter((size): size is number => Number.isFinite(size));
  return sizes.length ? Math.max(...sizes) - Math.min(...sizes) : 0;
}

function isContentSlide(slide: Slide): boolean {
  return !["cover", "title", "title-slide", "section", "divider", "closing", "closing-slide", "references"].includes(slide.layout ?? "");
}

function isVerticalLine(element: ShapeElement): boolean {
  return element.shape === "line" && Math.abs(element.w) <= 0.03 && Math.abs(element.h) >= 0.35;
}

function isHorizontalLine(element: ShapeElement): boolean {
  return element.shape === "line" && Math.abs(element.h) <= 0.03 && Math.abs(element.w) >= 0.35;
}

function hasIconOrImage(slide: Slide): boolean {
  return slide.elements.some((element) => element.type === "svg" || element.type === "image" || element.type === "diagram");
}

function overlapArea(a: SlideElement, b: SlideElement): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

function isGeneratedIcon(element: SlideElement): boolean {
  return element.type === "svg" && (/icon/u.test(element.id) || (element.w <= 0.7 && element.h <= 0.7));
}

function slideWidth(deck: DeckSpec): number {
  return deck.slideSize?.widthInches ?? 13.333;
}

function slideHeight(deck: DeckSpec): number {
  return deck.slideSize?.heightInches ?? 7.5;
}

function isFullBleedDecorative(element: SlideElement, width: number, height: number): boolean {
  return element.decorative === true && element.x <= 0.08 && element.y <= 0.08 && element.w >= width - 0.16 && element.h >= height - 0.16;
}

function meaningfulElements(slide: Slide, width: number, height: number): SlideElement[] {
  return slide.elements.filter((element) => !isFullBleedDecorative(element, width, height));
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | undefined {
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/u.exec(hex);
  if (!match) return undefined;
  const raw = match[1].length === 3 ? match[1].split("").map((value) => `${value}${value}`).join("") : match[1];
  return { r: Number.parseInt(raw.slice(0, 2), 16), g: Number.parseInt(raw.slice(2, 4), 16), b: Number.parseInt(raw.slice(4, 6), 16) };
}

function saturation(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const values = [rgb.r, rgb.g, rgb.b].map((value) => value / 255);
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max === 0) return 0;
  return (max - min) / max;
}

function normalizedColor(hex: string): string {
  const rgb = hexToRgb(hex);
  return rgb ? `#${[rgb.r, rgb.g, rgb.b].map((value) => value.toString(16).padStart(2, "0")).join("")}` : hex.toLowerCase();
}

export function reviewVisualQuality(deck: DeckSpec): VisualQualityReport {
  const issues: VisualQualityIssue[] = [];
  const width = slideWidth(deck);
  const height = slideHeight(deck);
  deck.slides.forEach((slide, slideIndex) => {
    const contentElements = meaningfulElements(slide, width, height);
    const accentBars = accentBarCardCount(slide);
    if (accentBars >= 3) {
      issues.push({
        severity: "error",
        code: "visual.accent-bar-card-repetition",
        message: "Slide repeats colored accent-bar cards. Convert the content into a table, matrix, flow, map, or ponchi-e.",
        path: `slides.${slideIndex}`,
        details: { accentBarCards: accentBars }
      });
    }

    slide.elements.forEach((element, elementIndex) => {
      if (element.type === "text" && element.text.includes("…")) {
        issues.push({
          severity: "error",
          code: "visual.truncated-text",
          message: "Slide text is truncated with an ellipsis. Resize, wrap, split, or move detail to notes instead.",
          path: `slides.${slideIndex}.elements.${elementIndex}.text`
        });
      }

      if (element.type === "shape" && element.shape === "line" && /axis-y-line/u.test(element.id) && !isVerticalLine(element)) {
        issues.push({
          severity: "error",
          code: "visual.axis-y-not-vertical",
          message: "Matrix y-axis must be a vertical line. Keep w near zero and vary only height.",
          path: `slides.${slideIndex}.elements.${elementIndex}`,
          details: { w: Number(element.w.toFixed(3)), h: Number(element.h.toFixed(3)) }
        });
      }

      if (element.type === "shape" && element.shape === "line" && /axis-x-line/u.test(element.id) && !isHorizontalLine(element)) {
        issues.push({
          severity: "error",
          code: "visual.axis-x-not-horizontal",
          message: "Matrix x-axis must be a horizontal line. Keep h near zero and vary only width.",
          path: `slides.${slideIndex}.elements.${elementIndex}`,
          details: { w: Number(element.w.toFixed(3)), h: Number(element.h.toFixed(3)) }
        });
      }

      if (slide.layout === "message-hub-map" && element.type === "shape" && element.shape === "line" && Math.abs(element.w) > 0.08 && Math.abs(element.h) > 0.08) {
        issues.push({
          severity: "error",
          code: "visual.hub-map-diagonal-connector",
          message: "Hub-map slides must not use diagonal connector lines that can cross through the hub or labels. Use grouped panels, orthogonal connectors, or generated diagram connectors.",
          path: `slides.${slideIndex}.elements.${elementIndex}`,
          details: { w: Number(element.w.toFixed(3)), h: Number(element.h.toFixed(3)) }
        });
      }
    });

    const texts = slide.elements.filter((element): element is TextElement => element.type === "text");
    const icons = slide.elements.filter(isGeneratedIcon);
    icons.forEach((icon, iconIndex) => {
      texts.forEach((textElement, textIndex) => {
        const area = overlapArea(icon, textElement);
        const iconArea = icon.w * icon.h;
        if (iconArea > 0 && area / iconArea > 0.08) {
          issues.push({
            severity: "error",
            code: "visual.icon-text-overlap",
            message: "Icon/SVG element overlaps text. Move the icon into its own slot or reserve padding before rendering.",
            path: `slides.${slideIndex}.elements.${slide.elements.indexOf(icon)}`,
            details: { iconIndex, textIndex, overlapRatio: Number((area / iconArea).toFixed(2)) }
          });
        }
      });
    });

    if ((slide.layout ?? "").startsWith("message-") && !hasIconOrImage(slide)) {
      issues.push({
        severity: "warning",
        code: "visual.message-slide-icon-missing",
        message: "Message-generated slides should include at least one icon, image, or diagram element so the deck does not become a plain text-and-box layout.",
        path: `slides.${slideIndex}`
      });
    }

    if (isContentSlide(slide)) {
      const bounds = contentElements.reduce(
        (current, element) => ({
          minX: Math.min(current.minX, element.x),
          minY: Math.min(current.minY, element.y),
          maxX: Math.max(current.maxX, element.x + element.w),
          maxY: Math.max(current.maxY, element.y + element.h)
        }),
        { minX: width, minY: height, maxX: 0, maxY: 0 }
      );
      const hasBounds = contentElements.length > 0 && bounds.maxX > bounds.minX && bounds.maxY > bounds.minY;
      const edgeMargin = hasBounds ? Math.min(bounds.minX, bounds.minY, width - bounds.maxX, height - bounds.maxY) : width;
      const areaRatio = hasBounds ? ((bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY)) / (width * height) : 0;
      if (contentElements.length >= 12 && areaRatio > 0.82 && edgeMargin < 0.35) {
        issues.push({
          severity: "warning",
          code: "visual.slideland-whitespace-tight",
          message: "Slide feels cramped against Slideland-style references. Increase outer margins, group related items with whitespace, or split the slide.",
          path: `slides.${slideIndex}`,
          details: { elementCount: contentElements.length, areaRatio: Number(areaRatio.toFixed(2)), edgeMargin: Number(edgeMargin.toFixed(2)) }
        });
      }

      const titleSize = median(texts.filter((text) => text.role === "title").map((text) => text.fontSize).filter((size): size is number => Number.isFinite(size)));
      const bodySize = median(texts.filter((text) => text.role === "body" || text.role === "callout").map((text) => text.fontSize).filter((size): size is number => Number.isFinite(size)));
      if (titleSize !== undefined && bodySize !== undefined && titleSize < bodySize + 5) {
        issues.push({
          severity: "warning",
          code: "visual.slideland-typography-flat",
          message: "Typography hierarchy is flatter than the Slideland cool/minimal/trust references. Make the title or focal number visibly larger than body text.",
          path: `slides.${slideIndex}`,
          details: { titleSize: Number(titleSize.toFixed(1)), bodySize: Number(bodySize.toFixed(1)) }
        });
      }

      const saturatedFills = new Set(
        contentElements
          .filter((element): element is ShapeElement => element.type === "shape" && typeof element.fill === "string" && element.fill !== "none")
          .map((element) => normalizedColor(element.fill))
          .filter((fill) => saturation(fill) >= 0.45)
      );
      if (saturatedFills.size >= 4) {
        issues.push({
          severity: "warning",
          code: "visual.slideland-color-discipline",
          message: "Slide uses more saturated colors than the Slideland-style references. Keep one dominant accent and push secondary colors toward neutral surfaces.",
          path: `slides.${slideIndex}`,
          details: { saturatedFillCount: saturatedFills.size }
        });
      }
    }

    for (const role of ["title", "subtitle", "body", "callout", "caption"] as const) {
      const roleTexts = slide.elements.filter((element): element is TextElement => element.type === "text" && element.role === role);
      const spread = typographySpread(roleTexts);
      if (roleTexts.length >= 2 && spread > 6) {
        issues.push({
          severity: "warning",
          code: "visual.typography-inconsistent",
          message: `Text role "${role}" uses inconsistent font sizes on one slide.`,
          path: `slides.${slideIndex}`,
          details: { role, spread: Number(spread.toFixed(1)) }
        });
      }
    }
  });

  const contentSlides = deck.slides.filter(isContentSlide);
  for (let index = 2; index < contentSlides.length; index += 1) {
    const layouts = contentSlides.slice(index - 2, index + 1).map((slide) => slide.layout ?? "");
    if (layouts.every((layout) => layout && layout === layouts[0])) {
      issues.push({
        severity: "warning",
        code: "visual.repeated-layout-run",
        message: "Three consecutive content slides use the same layout. Vary the visual archetype to avoid a generated-template impression.",
        path: `slides.${deck.slides.indexOf(contentSlides[index - 2])}`,
        details: { layout: layouts[0], runLength: 3 }
      });
    }
  }

  return { ok: issues.every((issue) => issue.severity !== "error"), issues };
}
