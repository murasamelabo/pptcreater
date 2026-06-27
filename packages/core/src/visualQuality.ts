import type { DeckSpec, ShapeElement, Slide, TextElement } from "./schema.js";

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
    });

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

  return { ok: issues.every((issue) => issue.severity !== "error"), issues };
}
