import type { DeckSpec, ShapeElement, Slide, SlideElement, TextElement } from "./schema.js";
import { SLIDE_ANTI_PATTERNS } from "./slideQualityStandard.js";

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

function antiPatternLabel(id: "A2" | "A3" | "A5" | "A6"): string {
  const pattern = SLIDE_ANTI_PATTERNS.find((item) => item.id === id);
  return pattern ? `${pattern.id} ${pattern.labelEn}` : id;
}

function contentTextElements(slide: Slide): TextElement[] {
  return slide.elements.filter((element): element is TextElement => element.type === "text" && !element.decorative && element.role !== "title" && element.role !== "caption");
}

function totalTextLength(slide: Slide): number {
  return contentTextElements(slide).reduce((sum, element) => sum + element.text.trim().length, 0);
}

function textElementCount(slide: Slide): number {
  return contentTextElements(slide).length;
}

function substantiveShapeCount(slide: Slide): number {
  return slide.elements.filter((element) => element.type === "shape" && !element.decorative && element.shape !== "line" && element.w >= 0.4 && element.h >= 0.25).length;
}

function nonDecorativeImageCount(slide: Slide): number {
  return slide.elements.filter((element) => (element.type === "image" || element.type === "svg") && !element.decorative && element.w >= 2.5 && element.h >= 1.5).length;
}

function hasLeadOrEvidence(slide: Slide): boolean {
  return slide.elements.some(
    (element): element is TextElement =>
      element.type === "text" && !element.decorative && (element.role === "subtitle" || element.role === "callout" || /evidence|根拠|理由|source|出典|because|why/i.test(element.id))
  );
}

function nonNeutralFills(slide: Slide): Set<string> {
  const fills = new Set<string>();
  slide.elements.forEach((element) => {
    if (element.type !== "shape" || !element.fill || element.fill === "none") return;
    const fill = element.fill.toLowerCase();
    if (!/^#[0-9a-f]{6}$/u.test(fill)) return;
    const red = Number.parseInt(fill.slice(1, 3), 16);
    const green = Number.parseInt(fill.slice(3, 5), 16);
    const blue = Number.parseInt(fill.slice(5, 7), 16);
    if (Math.max(red, green, blue) - Math.min(red, green, blue) > 18) fills.add(fill);
  });
  return fills;
}

function pushAntiPatternIssue(issues: VisualQualityIssue[], slideIndex: number, antiPattern: "A2" | "A3" | "A5" | "A6", message: string, details?: Record<string, number | string | boolean>): void {
  issues.push({
    severity: antiPattern === "A5" ? "error" : "warning",
    code: `quality.${antiPattern.toLowerCase()}`,
    message: `${antiPatternLabel(antiPattern)}: ${message}`,
    path: `slides.${slideIndex}`,
    details
  });
}

export function reviewVisualQuality(deck: DeckSpec): VisualQualityReport {
  const issues: VisualQualityIssue[] = [];
  deck.slides.forEach((slide, slideIndex) => {
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

    const isContent = isContentSlide(slide);
    const textLength = totalTextLength(slide);
    const contentTexts = textElementCount(slide);
    const shapes = substantiveShapeCount(slide);
    const images = nonDecorativeImageCount(slide);
    if (isContent && textLength >= 520 && shapes + images < 3) {
      pushAntiPatternIssue(issues, slideIndex, "A2", "Slide has document-like text volume without enough visual structure. Split, chunk, or turn the relationship into a diagram/table.", { textLength, contentTexts, visualObjects: shapes + images });
    }
    if (isContent && textLength >= 700) {
      pushAntiPatternIssue(issues, slideIndex, "A5", "Slide is likely over-dense. Reduce content, split the slide, or add clear compartments and whitespace.", { textLength, contentTexts });
    }
    if (isContent && images > 0 && textLength < 120 && !hasLeadOrEvidence(slide)) {
      pushAntiPatternIssue(issues, slideIndex, "A3", "Large image/SVG is not paired with enough visible message or evidence. Add a lead sentence and proof next to the image.", { imageCount: images, textLength });
    }
    const colorCount = nonNeutralFills(slide).size;
    if (isContent && colorCount > 3) {
      pushAntiPatternIssue(issues, slideIndex, "A6", "Slide uses more than three non-neutral fill colors. Reduce to base/main/accent colors and keep color meanings consistent.", { nonNeutralFills: colorCount });
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
