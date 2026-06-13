import { contrastRatio, defaultTokens } from "./color.js";
import type { DeckSpec, Slide, SlideElement, TextElement } from "./schema.js";
import { defaultFontSizeForRole } from "./typography.js";

export type LintSeverity = "error" | "warning" | "suggestion";

export type LintIssue = {
  severity: LintSeverity;
  code: string;
  message: string;
  path: string;
  details?: Record<string, number | string>;
};

export type LintReport = {
  ok: boolean;
  issues: LintIssue[];
};

function issue(
  severity: LintSeverity,
  code: string,
  message: string,
  path: string,
  details?: Record<string, number | string>
): LintIssue {
  return { severity, code, message, path, details };
}

function textLength(slide: Slide): number {
  return slide.elements.reduce((sum, element) => {
    return element.type === "text" ? sum + element.text.length : sum;
  }, 0);
}

function textElementMinimumSize(element: TextElement): number {
  if (element.role === "title") {
    return 28;
  }

  if (element.role === "caption") {
    return 12;
  }

  return 20;
}

function requiresAltText(element: SlideElement): boolean {
  return ["svg", "image", "diagram"].includes(element.type) && !element.decorative;
}

function lintSlide(slide: Slide, slideIndex: number, deck: DeckSpec): LintIssue[] {
  const issues: LintIssue[] = [];
  const tokens = deck.tokens ?? defaultTokens(deck.locale);
  const background = tokens.colors.background;
  const elementIds = new Set<string>();
  const readingOrders = new Set<number>();

  if (textLength(slide) > 700) {
    issues.push(
      issue(
        "warning",
        "slide.text-density",
        "Slide is text-heavy. Keep each slide focused on one message and move detail to speaker notes.",
        `slides.${slideIndex}`
      )
    );
  }

  slide.elements.forEach((element, elementIndex) => {
    const path = `slides.${slideIndex}.elements.${elementIndex}`;

    if (elementIds.has(element.id)) {
      issues.push(issue("error", "element.duplicate-id", `Duplicate element id "${element.id}".`, `${path}.id`, { elementId: element.id }));
    }

    elementIds.add(element.id);

    if (element.readingOrder === undefined) {
      issues.push(
        issue(
          "warning",
          "element.reading-order-missing",
          "Element is missing an explicit readingOrder value.",
          `${path}.readingOrder`
        )
      );
    } else if (readingOrders.has(element.readingOrder)) {
      issues.push(
        issue("error", "element.reading-order-duplicate", "Two elements share the same reading order.", `${path}.readingOrder`)
      );
    } else {
      readingOrders.add(element.readingOrder);
    }

    if (element.type === "text") {
      const fontSize = element.fontSize ?? defaultFontSizeForRole(element.role, tokens);
      const minimum = textElementMinimumSize(element);
      if (fontSize < minimum) {
        issues.push(
          issue(
            "warning",
            "text.small-font",
            `Text font size ${fontSize}pt is below the recommended ${minimum}pt for ${element.role}.`,
            `${path}.fontSize`,
            { fontSize, minimum, role: element.role }
          )
        );
      }

      if (element.text.length > 180 && element.role !== "caption") {
        issues.push(
          issue(
            "suggestion",
            "text.long-copy",
            "Text block is long. Prefer concise phrases and move detail to notes.",
            `${path}.text`
          )
        );
      }

      const foreground = element.color ?? tokens.colors.text;
      const ratio = contrastRatio(foreground, background);
      const minimumRatio = fontSize >= 24 ? 3 : 4.5;
      if (ratio < minimumRatio) {
        issues.push(
          issue(
            "error",
            "text.low-contrast",
            `Text contrast ratio ${ratio.toFixed(2)} is below ${minimumRatio}:1.`,
            `${path}.color`,
            { ratio: Number(ratio.toFixed(2)), minimumRatio }
          )
        );
      }
    }

    if (requiresAltText(element) && !element.altText) {
      issues.push(
        issue(
          "error",
          "visual.alt-text-missing",
          "Non-decorative visual elements require concise altText.",
          `${path}.altText`
        )
      );
    }

    if (element.type === "diagram" && element.longDescription.length < 40) {
      issues.push(
        issue(
          "warning",
          "diagram.long-description-short",
          "Complex diagrams should include a useful longDescription for speaker notes and accessibility review.",
          `${path}.longDescription`
        )
      );
    }
  });

  return issues;
}

export function lintDeckSpec(deck: DeckSpec): LintReport {
  const issues: LintIssue[] = [];
  const titleCounts = new Map<string, number>();

  deck.slides.forEach((slide) => {
    titleCounts.set(slide.title, (titleCounts.get(slide.title) ?? 0) + 1);
  });

  deck.slides.forEach((slide, slideIndex) => {
    if ((titleCounts.get(slide.title) ?? 0) > 1) {
      issues.push(
        issue(
          "error",
          "slide.title-duplicate",
          "Each slide needs a unique, descriptive title for navigation.",
          `slides.${slideIndex}.title`
        )
      );
    }

    issues.push(...lintSlide(slide, slideIndex, deck));
  });

  return {
    ok: !issues.some((item) => item.severity === "error"),
    issues
  };
}
