import { contrastRatio, defaultTokens } from "./color.js";
import { reviewDeckContent } from "./content.js";
import { estimateTextOverflow, findTextLineBreakIssue, SLIDE_WIDE } from "./layout.js";
import type { DeckSpec, ShapeElement, Slide, SlideElement, TextElement } from "./schema.js";
import { hasCompleteSourceReferenceSlide } from "./sourceReferences.js";
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

function parseSvgViewBox(svg: string): { width: number; height: number } | undefined {
  const viewBox = /viewBox\s*=\s*["']\s*[-+]?\d*\.?\d+\s+[-+]?\d*\.?\d+\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s*["']/iu.exec(svg);
  if (viewBox) {
    const width = Number(viewBox[1]);
    const height = Number(viewBox[2]);
    return width > 0 && height > 0 ? { width, height } : undefined;
  }

  const width = /<svg\b[^>]*\bwidth\s*=\s*["']\s*([0-9.]+)/iu.exec(svg);
  const height = /<svg\b[^>]*\bheight\s*=\s*["']\s*([0-9.]+)/iu.exec(svg);
  if (!width || !height) {
    return undefined;
  }

  const parsedWidth = Number(width[1]);
  const parsedHeight = Number(height[1]);
  return parsedWidth > 0 && parsedHeight > 0 ? { width: parsedWidth, height: parsedHeight } : undefined;
}

function svgFontSizes(svg: string): number[] {
  const sizes = new Set<number>();
  const regexes = [
    /\bfont-size\s*=\s*["']\s*([0-9.]+)(?:px|pt)?\s*["']/giu,
    /\bfont-size\s*:\s*([0-9.]+)(?:px|pt)?/giu
  ];

  regexes.forEach((regex) => {
    for (const match of svg.matchAll(regex)) {
      const size = Number(match[1]);
      if (Number.isFinite(size) && size > 0) {
        sizes.add(size);
      }
    }
  });

  return [...sizes];
}

function svgTextElementCount(svg: string): number {
  return (svg.match(/<text\b/giu) ?? []).length;
}

function lintEmbeddedSvgText(element: Extract<SlideElement, { type: "svg" | "diagram" }>, path: string): LintIssue[] {
  const viewBox = parseSvgViewBox(element.svg);
  const fontSizes = svgFontSizes(element.svg);
  if (!viewBox || fontSizes.length === 0) {
    return [];
  }

  const scale = Math.min((element.w * 72) / viewBox.width, (element.h * 72) / viewBox.height);
  const minimumSvgFont = Math.min(...fontSizes);
  const effectiveFontSize = minimumSvgFont * scale;
  const textCount = svgTextElementCount(element.svg);
  const issues: LintIssue[] = [];

  if (effectiveFontSize < 8) {
    issues.push(
      issue(
        "error",
        "visual.svg-text-too-small",
        "Embedded SVG text will render too small to read at this slide size. Enlarge the SVG element, simplify/split the diagram, or use generate_diagram/generate_schematic with fewer labels.",
        `${path}.svg`,
        {
          effectiveFontSize: Number(effectiveFontSize.toFixed(1)),
          minimumFontSize: 8,
          svgFontSize: minimumSvgFont,
          viewBoxWidth: viewBox.width,
          viewBoxHeight: viewBox.height,
          textCount
        }
      )
    );
  } else if (effectiveFontSize < 10 && textCount >= 4) {
    issues.push(
      issue(
        "warning",
        "visual.svg-text-small",
        "Embedded SVG text is likely hard to read after scaling. Prefer a larger diagram area, fewer labels, or a split/detail slide.",
        `${path}.svg`,
        {
          effectiveFontSize: Number(effectiveFontSize.toFixed(1)),
          recommendedFontSize: 10,
          svgFontSize: minimumSvgFont,
          textCount
        }
      )
    );
  }

  return issues;
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
            "error",
            "layout.text-overflow-risk",
            "Text may overflow its bounding box. Shorten the copy, split it across slides, increase the box size, or run polish_deck_layout before rendering.",
            `${path}.text`,
            { estimatedLines: overflow.estimatedLines, maxLines: overflow.maxLines }
          )
        );
      }

      const lineBreakIssue = findTextLineBreakIssue(element);
      if (lineBreakIssue) {
        issues.push(
          issue(
            "error",
            "layout.bad-line-break",
            `${lineBreakIssue} Avoid orphan lines and punctuation-only breaks.`,
            `${path}.text`
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

    if (element.type === "svg" || element.type === "diagram") {
      issues.push(...lintEmbeddedSvgText(element, path));
    }
  });

  const textBoxes = slide.elements
    .map((element, elementIndex) => ({ element, elementIndex }))
    .filter((entry): entry is { element: TextElement; elementIndex: number } => entry.element.type === "text");

  const bodyTextBoxes = textBoxes.filter(({ element }) => {
    const fontSize = element.fontSize ?? defaultFontSizeForRole(element.role, tokens);
    return element.role === "body" && element.text.length >= 8 && element.text.length <= 40 && fontSize >= 18;
  });
  const hierarchyTextBoxes = textBoxes.filter(({ element }) => element.role === "callout" || element.role === "title");
  const visualElements = slide.elements.filter((element) => element.type !== "text");
  if (bodyTextBoxes.length >= 3 && hierarchyTextBoxes.length < bodyTextBoxes.length && visualElements.length === 0) {
    issues.push(
      issue(
        "warning",
        "layout.enumeration-hierarchy",
        "Large enumerations should use a visual hierarchy: callout headings, icons, accent rules, or a schematic list/table instead of body text boxes only.",
        `slides.${slideIndex}`
      )
    );
  }

  // Hand-placed connector shapes (arrows) are the main source of dangling/penetrating arrows: an
  // agent guesses endpoint coordinates, which only happens to line up for a simple horizontal row.
  // Detect a connected diagram built from native shapes and steer it to the diagram engine, which
  // routes every arrow border-to-border (and auto-lays-out nodes when coordinates are omitted).
  const ARROW_HEAD_TYPES = new Set(["arrow", "stealth", "triangle", "diamond", "oval"]);
  const connectorShapes = slide.elements.filter(
    (element): element is ShapeElement =>
      element.type === "shape" &&
      (element.shape === "rightArrow" ||
        element.shape === "arrow" ||
        (element.shape === "line" &&
          ((element.line?.endArrowType !== undefined && ARROW_HEAD_TYPES.has(element.line.endArrowType)) ||
            (element.line?.beginArrowType !== undefined && ARROW_HEAD_TYPES.has(element.line.beginArrowType)))))
  );
  const nodeLikeShapes = slide.elements.filter(
    (element) => element.type === "shape" && ["rect", "roundRect", "roundedRect", "ellipse", "oval"].includes(element.shape)
  );
  const hasEngineDiagram = slide.elements.some((element) => element.type === "diagram");
  if (!hasEngineDiagram && (connectorShapes.length >= 2 || (connectorShapes.length >= 1 && nodeLikeShapes.length >= 4))) {
    issues.push(
      issue(
        "warning",
        "diagram.native-connectors",
        "This slide draws a connected diagram from hand-placed arrow shapes, which dangle or penetrate nodes unless the layout is a simple row. Build it with generate_diagram (omit node x/y for automatic layout) and embed the returned SVG as a diagram element so every arrow connects border-to-border.",
        `slides.${slideIndex}`,
        { connectors: connectorShapes.length, nodes: nodeLikeShapes.length }
      )
    );
  }

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
            "error",
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
  const urlSourceCount = deck.metadata.sources.filter((source) => Boolean(source.url)).length;
  const hasFinalReferenceSlide = hasCompleteSourceReferenceSlide(deck);
  const referencedSourceIds = new Set(
    deck.slides.flatMap((slide) => slide.elements.map((element) => element.sourceId).filter((sourceId): sourceId is string => Boolean(sourceId)))
  );

  if (urlSourceCount > 0 && !hasFinalReferenceSlide) {
    issues.push(
      issue(
        "error",
        "source.reference-slide-missing",
        "Decks that use external source URLs must collect the actual reference URLs on the final slide.",
        "slides",
        { sourceCount: urlSourceCount }
      )
    );
  }

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

    if ((source.usage === "quote" || source.usage === "recreate") && !source.attribution && !source.url) {
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

    if ((source.usage === "quote" || source.usage === "recreate") && !referencedSourceIds.has(source.id) && !source.url) {
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

      if ((source.usage === "quote" || source.usage === "recreate") && !element.citation && !source.url) {
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
  issues.push(...reviewDeckContent(deck).issues);

  return {
    ok: !issues.some((item) => item.severity === "error"),
    issues
  };
}
