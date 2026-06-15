import { defaultTokens } from "./color.js";
import type { DeckSpec, DesignTokens, Slide, SlideElement, TextElement } from "./schema.js";
import { defaultFontSizeForRole } from "./typography.js";

export const SLIDE_WIDE = {
  width: 13.333,
  height: 7.5,
  margin: 0.24
};

const TEXT_WIDTH_FACTOR = 0.52;
// Full-width kana/kanji render at ~1 em; the previous 0.92 under-counted width so PowerPoint
// fit fewer characters per line than we predicted and re-wrapped (splitting words).
const JAPANESE_WIDTH_FACTOR = 1.0;
const ASCII_WIDTH_FACTOR = 0.55;
const SPACE_WIDTH_FACTOR = 0.3;
const LINE_HEIGHT_FACTOR = 1.22;
// Wrap slightly before the true box width so PowerPoint's own greedy wrap never re-breaks a line
// we already balanced (a re-break is what splits Japanese words and orphans punctuation).
const LINE_WIDTH_SAFETY = 0.94;
const BAD_LINE_START_PATTERN = /^[、。，．・,，/／!?！？:：;；）」』】\]\})]/;
const BAD_LINE_END_PATTERN = /[（「『【\[\({]$/;
// Characters that must not start a line (closing punctuation, small kana, prolonged sound mark,
// and a spaced slash separator so "A / B" never wraps to a line beginning with "/").
const NO_BREAK_BEFORE_PATTERN = /[、。，．・,.!?！？:：;；)\]\}）」』】〉》〕｝ーぁぃぅぇぉっゃゅょゎ々/／]/;
// Characters that must not end a line (opening punctuation).
const NO_BREAK_AFTER_PATTERN = /[（「『【〔｛(\[\{〈《]/;
// Letters, digits, kana, and kanji count as line "content"; punctuation does not.
const CONTENT_CHAR_PATTERN = /[A-Za-z0-9\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
// Full-width glyphs (kana, kanji, prolonged-sound mark, middle dot, full-width forms) take ~1 em.
const FULL_WIDTH_PATTERN = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\u30FC\u30FB\uFF01-\uFF60\uFFE0-\uFFE6]/u;
// A kanji (Han) ideograph; adjacent Han glyphs stay together so compounds like 削除 are not split.
const HAN_PATTERN = /\p{Script=Han}/u;
// A maximal run of katakana stays together so loanwords (オブジェクト, メンバー) never break.
const KATAKANA_RUN = "[\\u30A0-\\u30FF\\u31F0-\\u31FF\\uFF66-\\uFF9F\\u30FC\\u30FB]+";
// An atomic token keeps Latin words, identifiers, grouped numbers (150,000, v1.2), and katakana
// loanwords together; every other character (kanji, hiragana, punctuation) is its own token.
const WRAP_TOKEN_PATTERN = new RegExp(`[A-Za-z0-9]+(?:[.,_+#%@/'’-][A-Za-z0-9]+)*|${KATAKANA_RUN}|\\s+|[\\s\\S]`, "gu");

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function cloneElement<T extends SlideElement>(element: T): T {
  return { ...element };
}

export function estimateTextOverflow(element: TextElement): { overflows: boolean; estimatedLines: number; maxLines: number } {
  const fontSize = element.fontSize ?? (element.role === "title" ? 32 : element.role === "caption" ? 14 : 22);
  const maxUnits = maxUnitsPerLine(element.w, fontSize);
  const hardCap = lineCapacity(element.w, fontSize);
  let estimatedLines = 0;
  let unbreakableToken = false;
  for (const rawLine of element.text.split(/\r?\n/)) {
    if (!rawLine.trim()) {
      estimatedLines += 1;
      continue;
    }

    const wrapped = wrapTokens(rawLine, maxUnits);
    estimatedLines += Math.max(1, wrapped.lines.length);
    // A token wider than the box, or a forced no-break run that still exceeds the real box width,
    // will be re-wrapped by PowerPoint and must be treated as overflow.
    if (wrapped.overflow || wrapped.lines.some((line) => textUnits(line) > hardCap + 0.01)) {
      unbreakableToken = true;
    }
  }
  const maxLines = Math.max(1, Math.floor((element.h * 72) / (fontSize * LINE_HEIGHT_FACTOR)));
  return {
    overflows: unbreakableToken || estimatedLines > maxLines,
    estimatedLines,
    maxLines
  };
}

function textMinimumFontSize(element: TextElement): number {
  if (element.role === "title") {
    return 24;
  }

  if (element.role === "caption") {
    // Captions include hand-placed diagram labels in very small boxes; allow shrinking far enough
    // to fit them (a non-blocking small-font warning is preferable to overflow or a blocked render).
    return 8;
  }

  return 14;
}

function textUnits(value: string): number {
  return Array.from(value).reduce((sum, char) => {
    if (/\s/.test(char)) {
      return sum + SPACE_WIDTH_FACTOR / TEXT_WIDTH_FACTOR;
    }

    if (FULL_WIDTH_PATTERN.test(char)) {
      return sum + JAPANESE_WIDTH_FACTOR / TEXT_WIDTH_FACTOR;
    }

    return sum + ASCII_WIDTH_FACTOR / TEXT_WIDTH_FACTOR;
  }, 0);
}

function maxUnitsPerLine(width: number, fontSize: number): number {
  const usableWidth = Math.max(0.1, width * LINE_WIDTH_SAFETY);
  return Math.max(2, usableWidth / ((fontSize * TEXT_WIDTH_FACTOR) / 72));
}

// The true number of units a box holds at a font size (no safety margin). Used to validate that a
// line really overflows, so keeping a kanji compound together (which may slightly exceed the early
// wrap target) is not mistaken for overflow when it still fits the actual box.
function lineCapacity(width: number, fontSize: number): number {
  return Math.max(2, width / ((fontSize * TEXT_WIDTH_FACTOR) / 72));
}

export function isPreformattedText(value: string): boolean {
  return /(^|\n)[\t ]+\S/.test(value) || /[\t ]+$/.test(value);
}

function tokenizeForWrap(value: string): string[] {
  return value.match(WRAP_TOKEN_PATTERN) ?? [];
}

function canBreakBetween(left: string, right: string): boolean {
  if (!left || !right) {
    return true;
  }

  if (NO_BREAK_BEFORE_PATTERN.test(right)) {
    return false;
  }

  if (NO_BREAK_AFTER_PATTERN.test(left)) {
    return false;
  }

  // Keep adjacent kanji together so two-character compounds (削除, 場合, 未満) are never split.
  if (HAN_PATTERN.test(left) && HAN_PATTERN.test(right)) {
    return false;
  }

  return true;
}

// Greedy line breaking that never splits an atomic token (Latin word, identifier, or grouped
// number) and never starts a line with closing punctuation. Reports overflow when a single
// token is wider than the available line width, which would otherwise force an ugly mid-word break.
function wrapTokens(value: string, maxUnits: number): { lines: string[]; overflow: boolean } {
  const tokens = tokenizeForWrap(value);
  const lines: string[] = [];
  let line = "";
  let lineUnits = 0;
  let overflow = false;

  for (const token of tokens) {
    if (/^\s+$/.test(token)) {
      if (line) {
        line += " ";
        lineUnits += SPACE_WIDTH_FACTOR / TEXT_WIDTH_FACTOR;
      }
      continue;
    }

    const tokenUnits = textUnits(token);
    if (line === "") {
      line = token;
      lineUnits = tokenUnits;
      if (tokenUnits > maxUnits) {
        overflow = true;
      }
      continue;
    }

    if (lineUnits + tokenUnits <= maxUnits) {
      line += token;
      lineUnits += tokenUnits;
      continue;
    }

    const trimmed = line.replace(/\s+$/, "");
    if (canBreakBetween(trimmed.slice(-1), token[0])) {
      lines.push(trimmed);
      line = token;
      lineUnits = tokenUnits;
      if (tokenUnits > maxUnits) {
        overflow = true;
      }
    } else {
      line += token;
      lineUnits += tokenUnits;
    }
  }

  if (line.trim()) {
    lines.push(line.trim());
  }

  return { lines: lines.length ? lines : [value.trim()], overflow };
}

// Reduce the per-line width as far as possible while keeping the same line count, so the last
// line is not left noticeably shorter than the others (avoids orphan lines on titles and bodies).
function wrapBalanced(value: string, maxUnits: number): string[] {
  const greedy = wrapTokens(value, maxUnits);
  const lineCount = greedy.lines.length;
  if (lineCount <= 1 || greedy.overflow) {
    return greedy.lines;
  }

  const longestToken = Math.max(...tokenizeForWrap(value).filter((token) => token.trim()).map(textUnits), 0);
  const balancedCap = Math.max(longestToken, textUnits(value) / lineCount + 0.5);
  const balanced = wrapTokens(value, balancedCap);
  return balanced.lines.length === lineCount && !balanced.overflow ? balanced.lines : greedy.lines;
}

function wrapParagraph(value: string, maxUnits: number): string[] {
  return wrapBalanced(value.trim(), maxUnits);
}

function joinReflowLines(lines: string[]): string {
  return lines.reduce((joined, line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return joined;
    }

    if (!joined) {
      return trimmed;
    }

    const continuesWithoutSpace = /[-/／]$/.test(joined);
    const needsSpace = !continuesWithoutSpace && (/[A-Za-z0-9)]$/.test(joined) || /^[A-Za-z0-9(]/.test(trimmed));
    return `${joined}${needsSpace ? " " : ""}${trimmed}`;
  }, "");
}

function isListLine(value: string): boolean {
  return /^(?:[-*•・✓✔]|\d+[.)．、]|[（(]?\d+[）)]|[A-Za-z][.)])\s*/.test(value.trim());
}

function shouldReflowManualLines(lines: string[], unitsPerLine: number): boolean {
  const nonEmptyLines = lines.map((line) => line.trim()).filter(Boolean);
  if (nonEmptyLines.length <= 1) {
    return false;
  }

  if (nonEmptyLines.some((line) => BAD_LINE_START_PATTERN.test(line) || BAD_LINE_END_PATTERN.test(line))) {
    return true;
  }

  const compactStructureLimit = Math.min(18, unitsPerLine * 0.72);
  if (nonEmptyLines.length <= 4 && nonEmptyLines.every((line) => textUnits(line) <= compactStructureLimit)) {
    return false;
  }

  return nonEmptyLines.some((line) => textUnits(line) > unitsPerLine * 0.78);
}

function isAcceptableShortLine(value: string): boolean {
  return /^[A-Z0-9][A-Za-z0-9 .+/#-]{0,8}$/.test(value.trim());
}

function isCompactManualStructure(element: TextElement, lines: string[]): boolean {
  const compactStructureLimit = 10;
  return element.role !== "title" && lines.length === 2 && lines.every((line) => textUnits(line.trim()) <= compactStructureLimit);
}

function normalizeTextLines(element: TextElement, fontSize: number): string {
  const maxLinesByHeight = Math.max(1, Math.floor((element.h * 72) / (fontSize * LINE_HEIGHT_FACTOR)));
  const roleLineCap = element.role === "title" ? 2 : element.role === "caption" ? 2 : 3;
  const lineCap = Math.min(maxLinesByHeight, roleLineCap);
  const unitsPerLine = maxUnitsPerLine(element.w, fontSize);

  if (element.role === "title" && element.text.includes("\n")) {
    const manualLines = element.text.split(/\r?\n/).map((line) => line.trim());
    const exceedsHeight = manualLines.filter(Boolean).length > maxLinesByHeight;
    if (!findTextLineBreakIssue(element) && !exceedsHeight) {
      return manualLines.join("\n");
    }

    return wrapParagraph(joinReflowLines(element.text.split(/\r?\n/)), unitsPerLine).join("\n");
  }

  if (element.text.includes("\n") && element.role !== "title") {
    const lines = element.text.split(/\r?\n/);
    const hasBlankLine = lines.some((line) => !line.trim());
    const nonEmptyLines = lines.filter((line) => line.trim());
    if (nonEmptyLines.length > 1 && nonEmptyLines.some(isListLine)) {
      return lines.join("\n");
    }

    if (!hasBlankLine && !isPreformattedText(element.text)) {
      // When the box is too short for the author's manual breaks, reflow into fewer lines so labels
      // such as "Active\nDirectory" collapse to one line instead of overflowing a one-line-tall box.
      const exceedsHeight = nonEmptyLines.length > maxLinesByHeight;
      if (!exceedsHeight && !shouldReflowManualLines(lines, unitsPerLine)) {
        return lines.join("\n");
      }

      const joined = joinReflowLines(lines);
      return wrapParagraph(joined, unitsPerLine).join("\n");
    }

    const wrapped = lines.flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return [line];
      }

      if (line !== trimmed) {
        return [line];
      }

      return wrapParagraph(trimmed, unitsPerLine);
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

  return wrapParagraph(element.text, unitsPerLine).join("\n");
}

export function findTextLineBreakIssue(element: TextElement): string | undefined {
  if (!element.text.includes("\n") || isPreformattedText(element.text)) {
    return undefined;
  }

  const lines = element.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) {
    return undefined;
  }

  if (lines.some(isListLine)) {
    return undefined;
  }

  const badLine = lines.find((line) => BAD_LINE_START_PATTERN.test(line) || BAD_LINE_END_PATTERN.test(line));
  if (badLine) {
    return `Line "${badLine}" starts or ends with punctuation that should stay with adjacent text.`;
  }

  const lastLine = lines[lines.length - 1];
  const lastContentChars = Array.from(lastLine).filter((char) => CONTENT_CHAR_PATTERN.test(char)).length;
  const previousMaxUnits = Math.max(...lines.slice(0, -1).map(textUnits), 0);
  const isCompactLabelValue = isCompactManualStructure(element, lines) && previousMaxUnits <= 6;
  if (lastContentChars <= 1 && !isAcceptableShortLine(lastLine) && !isCompactLabelValue) {
    return `Last line "${lastLine}" is an orphan; rebalance the line break, widen the box, or shorten the copy.`;
  }

  return undefined;
}

function fitTextElement(element: TextElement, tokens: DesignTokens): TextElement {
  let next: TextElement = cloneElement(element);
  let fontSize = next.fontSize ?? defaultFontSizeForRole(next.role, tokens);
  const minimumFontSize = Math.min(textMinimumFontSize(next), fontSize);

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const text = normalizeTextLines(next, fontSize);
    const candidate = { ...next, text, fontSize };
    const overflow = estimateTextOverflow(candidate);
    const hasBadBreak = Boolean(findTextLineBreakIssue(candidate));
    // Every emitted line must fit the real box at this size, otherwise PowerPoint re-wraps it with
    // its own greedy rule and splits words. Shrinking until each line fits keeps our breaks authoritative.
    const lineWidthBudget = lineCapacity(next.w, fontSize);
    const anyLineTooWide = text.split(/\r?\n/).some((line) => textUnits(line.trim()) > lineWidthBudget + 0.01);
    if (!overflow.overflows && !hasBadBreak && !anyLineTooWide) {
      next = { ...next, text };
      break;
    }

    if (fontSize <= minimumFontSize) {
      next = { ...next, text };
      break;
    }
    fontSize = Math.max(minimumFontSize, fontSize - 1);
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
