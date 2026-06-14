import { contrastRatio, defaultTokens } from "./color.js";
import { estimateTextOverflow, SLIDE_WIDE } from "./layout.js";
import type { DeckSpec, ShapeElement, Slide, SlideElement, TextElement } from "./schema.js";
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
  return ["svg", "image", "diagram", "shape"].includes(element.type) && !element.decorative;
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

    if (element.x + element.w > SLIDE_WIDE.width || element.y + element.h > SLIDE_WIDE.height) {
      issues.push(
        issue(
          "error",
          "layout.out-of-bounds",
          "Element extends beyond the slide bounds and must be resized or moved.",
          path,
          { slideWidth: SLIDE_WIDE.width, slideHeight: SLIDE_WIDE.height }
        )
      );
    }

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

      const overflow = estimateTextOverflow({
        ...element,
        fontSize
      });
      if (overflow.overflows) {
        issues.push(
          issue(
            "warning",
            "layout.text-overflow-risk",
            "Text may overflow its bounding box. Increase the box size, split the text, or reduce font size.",
            `${path}.text`,
            { estimatedLines: overflow.estimatedLines, maxLines: overflow.maxLines }
          )
        );
      }

      const foreground = element.color ?? tokens.colors.text;
      const textBackground = element.contrastBackground ?? background;
      const ratio = contrastRatio(foreground, textBackground);
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

  const textBoxes = slide.elements
    .map((element, elementIndex) => ({ element, elementIndex }))
    .filter((entry): entry is { element: TextElement; elementIndex: number } => entry.element.type === "text");

  const opaqueShapes = slide.elements.filter(
    (element): element is ShapeElement =>
      element.type === "shape" && element.fill !== "none" && (element.fillOpacity === undefined || element.fillOpacity >= 0.6)
  );

  textBoxes.forEach(({ element: text, elementIndex }) => {
    const textOrder = text.readingOrder ?? Number.MAX_SAFE_INTEGER;
    const textArea = text.w * text.h;
    for (const shape of opaqueShapes) {
      const shapeOrder = shape.readingOrder ?? Number.MAX_SAFE_INTEGER;
      if (shapeOrder <= textOrder) {
        continue;
      }

      const overlapWidth = Math.min(text.x + text.w, shape.x + shape.w) - Math.max(text.x, shape.x);
      const overlapHeight = Math.min(text.y + text.h, shape.y + shape.h) - Math.max(text.y, shape.y);
      if (overlapWidth <= 0.04 || overlapHeight <= 0.04) {
        continue;
      }

      if (textArea > 0 && (overlapWidth * overlapHeight) / textArea > 0.35) {
        issues.push(
          issue(
            "warning",
            "layout.shape-over-text",
            `Opaque shape "${shape.id}" is drawn over text "${text.id}" and may hide it. Lower the shape readingOrder, make it decorative background, or run polish_deck_layout.`,
            `slides.${slideIndex}.elements.${elementIndex}`,
            { shapeId: shape.id }
          )
        );
        break;
      }
    }
  });

  for (let i = 0; i < textBoxes.length; i += 1) {
    for (let j = i + 1; j < textBoxes.length; j += 1) {
      const a = textBoxes[i].element;
      const b = textBoxes[j].element;
      const overlapWidth = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapHeight = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (overlapWidth <= 0.04 || overlapHeight <= 0.04) {
        continue;
      }

      const overlapArea = overlapWidth * overlapHeight;
      const smallerArea = Math.min(a.w * a.h, b.w * b.h);
      if (smallerArea > 0 && overlapArea / smallerArea > 0.25) {
        issues.push(
          issue(
            "warning",
            "layout.text-overlap",
            `Text elements "${a.id}" and "${b.id}" overlap. Separate them so labels do not collide.`,
            `slides.${slideIndex}.elements.${textBoxes[j].elementIndex}`,
            { otherId: a.id }
          )
        );
      }
    }
  }

  return issues;
}

export function lintDeckSpec(deck: DeckSpec): LintReport {
  const issues: LintIssue[] = [];
  const titleCounts = new Map<string, number>();
  const sourceIdCounts = new Map<string, number>();
  deck.metadata.sources.forEach((source) => {
    sourceIdCounts.set(source.id, (sourceIdCounts.get(source.id) ?? 0) + 1);
  });
  const sourcesById = new Map(deck.metadata.sources.map((source) => [source.id, source]));
  const referencedSourceIds = new Set(
    deck.slides.flatMap((slide) => slide.elements.map((element) => element.sourceId).filter((sourceId): sourceId is string => Boolean(sourceId)))
  );

  deck.metadata.sources.forEach((source, sourceIndex) => {
    if ((sourceIdCounts.get(source.id) ?? 0) > 1) {
      issues.push(
        issue(
          "error",
          "source.duplicate-id",
          "Each source id must be unique so citations resolve to the intended source.",
          `metadata.sources.${sourceIndex}.id`,
          { sourceId: source.id }
        )
      );
    }

    if ((source.usage === "quote" || source.usage === "recreate") && !source.attribution) {
      issues.push(
        issue(
          "error",
          "source.attribution-missing",
          "Quoted or recreated source visuals require attribution metadata.",
          `metadata.sources.${sourceIndex}.attribution`,
          { sourceId: source.id, usage: source.usage }
        )
      );
    }

    if ((source.usage === "quote" || source.usage === "recreate") && !referencedSourceIds.has(source.id)) {
      issues.push(
        issue(
          "error",
          "source.visual-reference-missing",
          "Quoted or recreated sources must be referenced by at least one element.sourceId.",
          `metadata.sources.${sourceIndex}.id`,
          { sourceId: source.id, usage: source.usage }
        )
      );
    }
  });

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

    slide.elements.forEach((element, elementIndex) => {
      if (!element.sourceId) {
        return;
      }

      const source = sourcesById.get(element.sourceId);
      if (!source) {
        issues.push(
          issue(
            "error",
            "source.unresolved",
            "Element references a sourceId that is not declared in metadata.sources.",
            `slides.${slideIndex}.elements.${elementIndex}.sourceId`,
            { sourceId: element.sourceId }
          )
        );
        return;
      }

      if ((source.usage === "quote" || source.usage === "recreate") && !element.citation) {
        issues.push(
          issue(
            "error",
            "source.citation-missing",
            "Elements based on quoted or recreated source visuals require a citation.",
            `slides.${slideIndex}.elements.${elementIndex}.citation`,
            { sourceId: element.sourceId, usage: source.usage }
          )
        );
      }

      if (source.usage === "recreate" && element.type !== "shape" && element.type !== "text") {
        issues.push(
          issue(
            "error",
            "source.recreate-not-editable",
            "Recreated source visuals must be represented with editable PowerPoint shape/text elements, not flattened images or SVG.",
            `slides.${slideIndex}.elements.${elementIndex}.type`,
            { sourceId: element.sourceId }
          )
        );
      }

      if (source.usage === "recreate" && element.type === "shape" && element.decorative) {
        issues.push(
          issue(
            "error",
            "source.recreate-shape-accessibility-missing",
            "Source-linked recreated shapes must be marked non-decorative and include altText, or cite the source from an accessible text element instead.",
            `slides.${slideIndex}.elements.${elementIndex}.decorative`,
            { sourceId: element.sourceId }
          )
        );
      }
    });

    issues.push(...lintSlide(slide, slideIndex, deck));
  });

  return {
    ok: !issues.some((item) => item.severity === "error"),
    issues
  };
}
