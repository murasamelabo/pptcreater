import { contrastRatio, defaultTokens } from "./color.js";
import { reviewDeckContent } from "./content.js";
import { estimateTextOverflow, findTextLineBreakIssue, SLIDE_WIDE, textReadableMinimumFontSize } from "./layout.js";
import type { DeckSpec, ShapeElement, Slide, SlideElement, TextElement } from "./schema.js";
import { hasCompleteSourceReferenceSlide } from "./sourceReferences.js";
import { defaultFontSizeForRole } from "./typography.js";

export type LintSeverity = "error" | "warning" | "suggestion";

/**
 * Lint codes that {@link normalizeDeckLayout} (a.k.a. `pptcreater polish`, the renderer's built-in
 * `--polish`, and the `polish_deck_layout` MCP tool) resolves deterministically. These are reported
 * as errors so that authors who skip polishing still see them, but they do NOT require manual copy
 * edits: running polish/finalize fixes them automatically. Surfacing this distinction stops agents
 * from hand-shortening text one element at a time when a single polish pass would do it.
 */
export const POLISH_FIXABLE_LINT_CODES = [
  "layout.text-overflow-risk",
  "layout.bad-line-break",
  "layout.text-too-small-to-read",
  "layout.card-accent-bar-unshaped",
  "element.reading-order-duplicate"
] as const;

const POLISH_FIXABLE_LINT_CODE_SET: ReadonlySet<string> = new Set(POLISH_FIXABLE_LINT_CODES);

/** True when the lint code is one that layout polish resolves without manual copy edits. */
export function isPolishFixableLintCode(code: string): boolean {
  return POLISH_FIXABLE_LINT_CODE_SET.has(code);
}

export type LintIssue = {
  severity: LintSeverity;
  code: string;
  message: string;
  path: string;
  details?: Record<string, number | string>;
  /** Set when the issue is resolved automatically by layout polish / finalize, not manual editing. */
  polishFixable?: boolean;
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
  const base: LintIssue = { severity, code, message, path, details };
  if (POLISH_FIXABLE_LINT_CODE_SET.has(code)) {
    base.polishFixable = true;
  }

  return base;
}

/**
 * Split a lint report into the issues an author must fix by hand versus the ones layout polish /
 * finalize resolves automatically. Used by the `finalize` CLI command and the `finalize_deck` MCP
 * tool so a single pass surfaces only the genuine blockers instead of auto-fixable noise.
 */
export function classifyLintReport(report: LintReport): {
  blockingErrors: LintIssue[];
  polishFixable: LintIssue[];
  warnings: LintIssue[];
} {
  const blockingErrors: LintIssue[] = [];
  const polishFixable: LintIssue[] = [];
  const warnings: LintIssue[] = [];

  for (const item of report.issues) {
    if (item.polishFixable ?? POLISH_FIXABLE_LINT_CODE_SET.has(item.code)) {
      polishFixable.push(item);
    } else if (item.severity === "error") {
      blockingErrors.push(item);
    } else {
      warnings.push(item);
    }
  }

  return { blockingErrors, polishFixable, warnings };
}

function textLength(slide: Slide): number {
  return slide.elements.reduce((sum, element) => {
    return element.type === "text" ? sum + element.text.length : sum;
  }, 0);
}

function textElementMinimumSize(element: TextElement, deck: DeckSpec): number {
  if (element.role === "caption" && isGeneratedDiagramIntentText(element)) {
    return 8.5;
  }

  if (deck.template === "report-formal" || deck.metadata.contentMode === "report" || deck.metadata.contentMode === "handout") {
    if (element.role === "title") {
      return 24;
    }

    if (element.role === "caption") {
      return 12;
    }

    if (element.role === "callout" || element.role === "subtitle") {
      return 14;
    }

    return 12;
  }

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

function isSvgImageElement(element: SlideElement): boolean {
  if (element.type !== "image") {
    return false;
  }

  return Boolean(element.path?.toLowerCase().endsWith(".svg") || /^data:image\/svg\+xml(?:[;,]|$)/iu.test(element.dataUri ?? ""));
}

function isLikelyDiagramImage(element: Extract<SlideElement, { type: "image" }>, deck: DeckSpec): boolean {
  const clueText = [element.id, element.path, element.description, element.altText]
    .filter((value): value is string => Boolean(value))
    .join(" ");
  const diagramPattern =
    /diagram|architecture|flow|schematic|ponchi|access[-_\s]?model|enterprise[-_\s]?access|privileged[-_\s]?(?:access|session)|session[-_\s]?control|control[-_\s]?(?:chain|plane|model|diagram)|policy[-_\s]?(?:flow|model|diagram)|decision[-_\s]?(?:tree|flow|model|diagram)|security[-_\s]?(?:architecture|model|diagram)|tier[-_\s]?(?:model|to)|marketplace[-_\s]?(?:architecture|flow|model|diagram)|(?:architecture|flow|model|diagram)[-_\s]?marketplace|構成図|図解|フロー|ポンチ|(?:統制|管理|判定|セキュリティ).*(?:構成|図|モデル|フロー)/iu;

  return diagramPattern.test(clueText);
}

function isGeneratedNativeDiagramConnector(element: ShapeElement): boolean {
  return /(?:^|-)connector-\d+-\d+$/u.test(element.id) || element.altText === "generated diagram intent connector";
}

function isGeneratedNativeDiagramNode(element: SlideElement): boolean {
  return (
    element.type === "shape" &&
    (/(?:^|-)node-[a-zA-Z0-9._-]+-\d+$/u.test(element.id) || element.altText === "generated diagram intent shape")
  );
}

function isGeneratedDiagramIntentText(element: TextElement): boolean {
  return /^diagram-intent-/u.test(element.id) || element.altText === "generated diagram intent text";
}

function hasReferenceSlideMarkers(slide: Slide): boolean {
  return slide.layout === "references" || slide.id === "source-references" || slide.title === "参考URL・出典" || slide.title === "References and sources";
}

function isReferenceSlide(slide: Slide, deck: DeckSpec, slideIndex: number): boolean {
  const hasUrlSources = deck.metadata.sources.some((source) => Boolean(source.url));
  return hasReferenceSlideMarkers(slide) || (hasUrlSources && slideIndex === deck.slides.length - 1 && hasCompleteSourceReferenceSlide(deck));
}

function isContentSlide(slide: Slide, deck: DeckSpec, slideIndex: number): boolean {
  if (isReferenceSlide(slide, deck, slideIndex)) {
    return false;
  }

  if (["cover", "title", "section", "divider", "closing", "references"].includes(slide.layout ?? "")) {
    return false;
  }

  const bodyTextCount = slide.elements.filter((element) => element.type === "text" && element.role === "body").length;
  return textLength(slide) >= 100 || bodyTextCount >= 2 || slide.elements.length >= 4;
}

function visualRichnessLevel(slide: Slide): number {
  return slide.elements.reduce((score, element) => {
    if (element.type === "diagram" || element.type === "smartart" || element.type === "pptxSlide") {
      return score + 4;
    }

    if (element.type === "svg" || element.type === "image") {
      return score + 3;
    }

    if (element.type === "shape") {
      return score + 1;
    }

    if (element.type === "text" && (element.role === "callout" || element.role === "subtitle")) {
      return score + 1;
    }

    return score;
  }, 0);
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

function svgTransformScale(attributes: string): number {
  let scale = 1;
  for (const match of attributes.matchAll(/\btransform\s*=\s*["'][^"']*\bscale\(\s*([-+]?\d*\.?\d+)(?:[\s,]+([-+]?\d*\.?\d+))?\s*\)/giu)) {
    const xScale = Math.abs(Number(match[1]));
    const yScale = Math.abs(Number(match[2] ?? match[1]));
    if (Number.isFinite(xScale) && Number.isFinite(yScale) && xScale > 0 && yScale > 0) {
      scale *= Math.min(xScale, yScale);
    }
  }
  for (const match of attributes.matchAll(/\btransform\s*=\s*["'][^"']*\bmatrix\(\s*([-+]?\d*\.?\d+)[\s,]+([-+]?\d*\.?\d+)[\s,]+([-+]?\d*\.?\d+)[\s,]+([-+]?\d*\.?\d+)[\s,]+[-+]?\d*\.?\d+[\s,]+[-+]?\d*\.?\d+\s*\)/giu)) {
    const a = Number(match[1]);
    const b = Number(match[2]);
    const c = Number(match[3]);
    const d = Number(match[4]);
    const xScale = Math.hypot(a, b);
    const yScale = Math.hypot(c, d);
    if (Number.isFinite(xScale) && Number.isFinite(yScale) && xScale > 0 && yScale > 0) {
      scale *= Math.min(xScale, yScale);
    }
  }

  return scale;
}

function svgFontSizeFromAttributes(attributes: string): number | undefined {
  const direct = /\bfont-size\s*=\s*["']\s*([0-9.]+)(?:px|pt)?\s*["']/iu.exec(attributes);
  const styled = /\bfont-size\s*:\s*([0-9.]+)(?:px|pt)?/iu.exec(attributes);
  const size = Number(styled?.[1] ?? direct?.[1]);
  return Number.isFinite(size) && size > 0 ? size : undefined;
}

function svgVisibleTextFontSizes(svg: string): number[] {
  const invisibleContainers = new Set(["clippath", "defs", "filter", "lineargradient", "marker", "mask", "metadata", "pattern", "radialgradient", "script", "style", "symbol"]);
  const stack: Array<{ tag: string; hidden: boolean; scale: number; fontSize?: number }> = [];
  const sizes: number[] = [];
  const tagPattern = /<\s*(\/?)([a-zA-Z][\w:-]*)([^<>]*?)(\/?)\s*>/gu;

  for (const match of svg.matchAll(tagPattern)) {
    const isClosing = match[1] === "/";
    const tag = (match[2] ?? "").toLowerCase();

    if (isClosing) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].tag === tag) {
          stack.splice(index);
          break;
        }
      }
      continue;
    }

    const attributes = match[3] ?? "";
    const parent = stack[stack.length - 1];
    const inheritedHidden = stack.some((entry) => entry.hidden);
    const hidden = inheritedHidden || invisibleContainers.has(tag) || isHiddenSvgAttributes(attributes);
    const scale = (parent?.scale ?? 1) * svgTransformScale(attributes);
    const fontSize = svgFontSizeFromAttributes(attributes) ?? parent?.fontSize;

    if ((tag === "text" || tag === "tspan") && !hidden && fontSize) {
      const contentStart = match.index + match[0].length;
      const closeMatch = new RegExp(`</\\s*${tag}\\s*>`, "iu").exec(svg.slice(contentStart));
      const content = closeMatch ? svg.slice(contentStart, contentStart + closeMatch.index) : "";
      const visibleText = tag === "text" ? stripDirectSvgTextContent(content) : stripSvgTextContent(content);
      if (visibleText.length > 0) {
        sizes.push(fontSize * scale);
      }
    }

    if (match[4] !== "/") {
      stack.push({ tag, hidden, scale, fontSize });
    }
  }

  return sizes;
}

function stripSvgTextContent(content: string): string {
  return content
    .replace(/<[^>]*>/gu, "")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/gu, "'")
    .trim();
}

function stripDirectSvgTextContent(content: string): string {
  let direct = "";
  let depth = 0;
  let cursor = 0;
  const tagPattern = /<\s*(\/?)([a-zA-Z][\w:-]*)(?:\s[^<>]*?)?(\/?)\s*>/gu;

  for (const match of content.matchAll(tagPattern)) {
    if (depth === 0 && match.index > cursor) {
      direct += content.slice(cursor, match.index);
    }

    const closing = match[1] === "/";
    const selfClosing = match[3] === "/";
    if (closing) {
      depth = Math.max(0, depth - 1);
    } else if (!selfClosing) {
      depth += 1;
    }
    cursor = match.index + match[0].length;
  }

  if (depth === 0 && cursor < content.length) {
    direct += content.slice(cursor);
  }

  return stripSvgTextContent(direct);
}

function svgAttributeValue(attributes: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "iu").exec(attributes);
  return match?.[1]?.trim();
}

function svgStyleValue(attributes: string, name: string): string | undefined {
  const style = svgAttributeValue(attributes, "style");
  if (!style) {
    return undefined;
  }

  for (const declaration of style.split(";")) {
    const separatorIndex = declaration.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }

    const key = declaration.slice(0, separatorIndex).trim().toLowerCase();
    if (key === name.toLowerCase()) {
      return declaration
        .slice(separatorIndex + 1)
        .replace(/\s*!important\s*$/iu, "")
        .trim();
    }
  }

  return undefined;
}

function isZeroOpacity(value: string | undefined): boolean {
  return value !== undefined && /^0(?:\.0+)?$/u.test(value.trim());
}

function isHiddenSvgAttributes(attributes: string): boolean {
  const display = svgAttributeValue(attributes, "display") ?? svgStyleValue(attributes, "display");
  const visibility = svgAttributeValue(attributes, "visibility") ?? svgStyleValue(attributes, "visibility");
  const opacity = svgAttributeValue(attributes, "opacity") ?? svgStyleValue(attributes, "opacity");

  return display?.toLowerCase() === "none" || ["hidden", "collapse"].includes(visibility?.toLowerCase() ?? "") || isZeroOpacity(opacity);
}

function svgTextElementCount(svg: string): number {
  const invisibleContainers = new Set(["clippath", "defs", "filter", "lineargradient", "marker", "mask", "metadata", "pattern", "radialgradient", "script", "style", "symbol"]);
  const stack: Array<{ tag: string; hidden: boolean }> = [];
  const tagPattern = /<\s*(\/?)([a-zA-Z][\w:-]*)([^<>]*?)(\/?)\s*>/gu;
  let count = 0;

  for (const match of svg.matchAll(tagPattern)) {
    const isClosing = match[1] === "/";
    const tag = (match[2] ?? "").toLowerCase();

    if (isClosing) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].tag === tag) {
          stack.splice(index);
          break;
        }
      }
      continue;
    }

    const attributes = match[3] ?? "";
    const inheritedHidden = stack.some((entry) => entry.hidden);
    const hidden = inheritedHidden || invisibleContainers.has(tag) || isHiddenSvgAttributes(attributes);
    if (tag === "text" && !hidden) {
      const contentStart = match.index + match[0].length;
      const closeMatch = /<\/\s*text\s*>/iu.exec(svg.slice(contentStart));
      const content = closeMatch ? svg.slice(contentStart, contentStart + closeMatch.index) : "";
      if (stripSvgTextContent(content).length > 0) {
        count += 1;
      }
    }

    if (match[4] !== "/") {
      stack.push({ tag, hidden });
    }
  }

  return count;
}

function svgPrimitiveCount(svg: string): number {
  return (svg.match(/<(?:rect|circle|ellipse|path|line|polyline|polygon)\b/giu) ?? []).length;
}

/** Inches a label may sit beyond a diagram edge and still read as one of its node labels. */
const DIAGRAM_ADJACENT_LABEL_GAP_IN = 0.85;
/** Slack applied when testing whether a label aligns with the diagram's cross axis. */
const DIAGRAM_LABEL_ALIGN_TOLERANCE_IN = 0.12;

/**
 * True when a label-less connector/track diagram is accompanied by visible text elements that act as
 * its node labels — e.g. a horizontal flow whose stage names sit in cards directly beneath it. In
 * that layout the labels are real and readable, just authored as sibling text instead of inline
 * `<text>`, so flagging the SVG as "missing visible labels" would be a false positive that dead-ends
 * one-shot finalize. We only treat this as a pass for thin connector tracks/rails (a small minor
 * dimension or high aspect ratio) and require at least two aligned, adjacent labels that span a
 * meaningful portion of the diagram, so a full-canvas diagram or a lone figure caption never
 * satisfies the check.
 */
function diagramHasAdjacentVisibleLabels(diagram: Extract<SlideElement, { type: "svg" | "diagram" }>, slide: Slide): boolean {
  const minorExtent = Math.min(diagram.w, diagram.h);
  const majorExtent = Math.max(diagram.w, diagram.h);
  const aspectRatio = minorExtent > 0 ? majorExtent / minorExtent : Number.POSITIVE_INFINITY;
  const isConnectorTrack = minorExtent <= 2.2 || aspectRatio >= 3;
  if (!isConnectorTrack) {
    return false;
  }

  const dx0 = diagram.x;
  const dy0 = diagram.y;
  const dx1 = diagram.x + diagram.w;
  const dy1 = diagram.y + diagram.h;
  const horizontal = diagram.w >= diagram.h;

  let count = 0;
  let spanMin = Number.POSITIVE_INFINITY;
  let spanMax = Number.NEGATIVE_INFINITY;

  for (const candidate of slide.elements) {
    if (candidate === diagram || candidate.type !== "text" || candidate.text.trim().length === 0) {
      continue;
    }

    const ex0 = candidate.x;
    const ey0 = candidate.y;
    const ex1 = candidate.x + candidate.w;
    const ey1 = candidate.y + candidate.h;

    const horizontallyAligned = ex1 > dx0 - DIAGRAM_LABEL_ALIGN_TOLERANCE_IN && ex0 < dx1 + DIAGRAM_LABEL_ALIGN_TOLERANCE_IN;
    const verticallyAligned = ey1 > dy0 - DIAGRAM_LABEL_ALIGN_TOLERANCE_IN && ey0 < dy1 + DIAGRAM_LABEL_ALIGN_TOLERANCE_IN;
    const verticalGap = Math.max(dy0 - ey1, ey0 - dy1);
    const horizontalGap = Math.max(dx0 - ex1, ex0 - dx1);
    const belongsAboveBelow = horizontallyAligned && verticalGap <= DIAGRAM_ADJACENT_LABEL_GAP_IN;
    const belongsBeside = verticallyAligned && horizontalGap <= DIAGRAM_ADJACENT_LABEL_GAP_IN;

    if (!belongsAboveBelow && !belongsBeside) {
      continue;
    }

    count += 1;
    if (horizontal) {
      spanMin = Math.min(spanMin, ex0);
      spanMax = Math.max(spanMax, ex1);
    } else {
      spanMin = Math.min(spanMin, ey0);
      spanMax = Math.max(spanMax, ey1);
    }
  }

  if (count < 2) {
    return false;
  }

  const diagramExtent = horizontal ? diagram.w : diagram.h;
  const labelSpan = spanMax - spanMin;
  return diagramExtent <= 0 || labelSpan / diagramExtent >= 0.4;
}

function lintVisibleDiagramLabels(element: Extract<SlideElement, { type: "svg" | "diagram" }>, path: string, slide: Slide): LintIssue[] {
  if (element.decorative) {
    return [];
  }

  const textCount = svgTextElementCount(element.svg);
  if (textCount > 0) {
    return [];
  }

  const primitiveCount = svgPrimitiveCount(element.svg);
  const renderedArea = element.w * element.h;
  const isDiagram = element.type === "diagram";
  const isLargeComplexSvg = element.type === "svg" && renderedArea >= 8 && primitiveCount >= 6;
  if ((!isDiagram && !isLargeComplexSvg) || (isDiagram && primitiveCount < 2 && renderedArea < 8)) {
    return [];
  }

  if (diagramHasAdjacentVisibleLabels(element, slide)) {
    return [];
  }

  return [
    issue(
      "error",
      "diagram.visible-labels-missing",
      "Meaningful diagrams must include visible labels or callouts inside the SVG; altText, summary, and longDescription are not visible to slide viewers.",
      `${path}.svg`,
      { primitiveCount, textCount }
    )
  ];
}

function lintEmbeddedSvgText(element: Extract<SlideElement, { type: "svg" | "diagram" }>, path: string): LintIssue[] {
  const viewBox = parseSvgViewBox(element.svg);
  const fontSizes = svgVisibleTextFontSizes(element.svg);
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
      const minimum = textElementMinimumSize(element, deck);
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

      const readableMinimum = textReadableMinimumFontSize(element);
      if (fontSize < readableMinimum) {
        issues.push(
          issue(
            "error",
            "layout.text-too-small-to-read",
            "Text is below the practical readable size for this role. Enlarge the element, shorten the copy, split the slide, or run polish_deck_layout before rendering.",
            `${path}.fontSize`,
            { fontSize, minimum: readableMinimum, role: element.role }
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
      issues.push(...lintVisibleDiagramLabels(element, path, slide));
      issues.push(...lintEmbeddedSvgText(element, path));
    }

    if (element.type === "image" && !element.decorative && isSvgImageElement(element) && element.w * element.h >= 8 && isLikelyDiagramImage(element, deck)) {
      issues.push(
        issue(
          "error",
          "diagram.image-svg-not-editable",
          "This looks like a diagram embedded as an SVG image, so labels and boxes would be flattened and may become hard to edit or read after scaling. Recreate architecture/flow/ponchi-e visuals with generate_native_diagram so PowerPoint shapes, connectors, and labels stay editable; use image SVG only for small icons or when exact fidelity is required.",
          path,
          { renderedArea: Number((element.w * element.h).toFixed(2)) }
        )
      );
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
  if (isContentSlide(slide, deck, slideIndex) && visualRichnessLevel(slide) < 3) {
    issues.push(
      issue(
        "error",
        "visual.richness-missing",
        "Content slides must include a meaningful visual structure, such as generate_schematic, generate_diagram, registered icons, images, or card/shape composition. Do not deliver text-only slides.",
        `slides.${slideIndex}`,
        { richnessScore: visualRichnessLevel(slide) }
      )
    );
  }

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
  const hasGeneratedNativeDiagram =
    connectorShapes.length > 0 && connectorShapes.every(isGeneratedNativeDiagramConnector) && nodeLikeShapes.some(isGeneratedNativeDiagramNode);
  if (!hasEngineDiagram && !hasGeneratedNativeDiagram && (connectorShapes.length >= 2 || (connectorShapes.length >= 1 && nodeLikeShapes.length >= 4))) {
    // A handful of hand-placed connectors can line up by luck, so a small flow is only a warning.
    // Once the flow is complex (4+ hand-placed connectors), routing every arrow to the right border
    // by hand reliably fails — arrows dangle, pierce nodes, or leave gaps (exactly the defects the
    // diagram engine exists to prevent), so it is escalated to a render-blocking error that forces
    // adoption of generate_native_diagram.
    const complex = connectorShapes.length >= 4;
    issues.push(
      issue(
        complex ? "error" : "warning",
        "diagram.native-connectors",
        complex
          ? "This slide hand-places several connectors for a connected diagram, which reliably produces arrows that dangle, pierce nodes, or leave gaps to the boxes. Rebuild it with generate_native_diagram (call recommend_figure first if unsure) so connectors route border-to-border, nodes auto-space, and labels stay editable; nudging coordinates will not make hand-routed arrows reliable."
          : "This slide draws a connected diagram from hand-placed arrow shapes, which can dangle, pierce nodes, or become uneven unless the layout is a simple row. Build it with generate_native_diagram (call recommend_figure first if unsure) so connectors, boxes, and labels remain editable PowerPoint objects with automatic spacing; use generate_diagram SVG only when you need a single fixed illustration.",
        `slides.${slideIndex}`,
        { connectors: connectorShapes.length, nodes: nodeLikeShapes.length }
      )
    );
  }

  const opaqueShapes = slide.elements.filter(
    (element): element is ShapeElement =>
      element.type === "shape" && element.fill !== "none" && (element.fillOpacity === undefined || element.fillOpacity >= 0.6)
  );

  const roundedCards = slide.elements.filter(
    (element): element is ShapeElement =>
      element.type === "shape" && (element.shape === "roundRect" || element.shape === "roundedRect") && element.fill !== "none" && element.w >= 1 && element.h >= 0.45
  );
  slide.elements.forEach((element, elementIndex) => {
    if (
      element.type !== "shape" ||
      element.shape !== "rect" ||
      element.fill === "none" ||
      !element.decorative ||
      element.w > 0.22 ||
      element.h < 0.45
    ) {
      return;
    }

    const flushCard = roundedCards.find(
      (card) =>
        card.id !== element.id &&
        Math.abs(card.x - element.x) <= 0.04 &&
        Math.abs(card.y - element.y) <= 0.04 &&
        Math.abs(card.h - element.h) <= 0.04 &&
        card.w > element.w * 4
    );
    if (!flushCard) {
      return;
    }

    issues.push(
      issue(
        "error",
        "layout.card-accent-bar-unshaped",
        "A square accent bar is flush with a rounded card edge. Run polish_deck_layout so the bar is inset and rounded, or model the card as a single SVG/diagram.",
        `slides.${slideIndex}.elements.${elementIndex}`,
        { cardId: flushCard.id }
      )
    );
  });

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
  const contentSlides = deck.slides.filter((slide, slideIndex) => isContentSlide(slide, deck, slideIndex));
  const contentSlideCount = contentSlides.length;
  const richContentSlideCount = contentSlides.filter((slide) => visualRichnessLevel(slide) >= 3).length;
  const substantiveVisualCount = contentSlides.flatMap((slide) =>
    slide.elements.filter((element) => element.type === "svg" || element.type === "image" || element.type === "diagram")
  ).length;
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

  if (contentSlideCount >= 3 && richContentSlideCount / contentSlideCount < 0.75) {
    issues.push(
      issue(
        "error",
        "visual.richness-deck",
        "The deck is too text-heavy for pptcreater output. At least 75% of content slides should use visual structure, and the deck should include diagrams, schematics, icons, or images.",
        "slides",
        {
          contentSlides: contentSlideCount,
          richSlides: richContentSlideCount,
          substantiveVisuals: substantiveVisualCount
        }
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
