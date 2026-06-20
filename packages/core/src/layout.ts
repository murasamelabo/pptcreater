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
// Width reserved (inches) for renderer text padding plus glyph-advance variance between fonts. Some
// renderers (LibreOffice, used for PNG/JPG previews) ignore Japanese kinsoku, so if an emitted line
// is even slightly wider than the real box they re-wrap it and push "、"/"。" to the next line start.
// Reserving this margin keeps every emitted line comfortably inside the box so no re-wrap happens.
const TEXT_BOX_INSET = 0.06;
const BAD_LINE_START_PATTERN = /^[、。，．・,，!?！？:：;；）」』】\]\})]/;
const BAD_LINE_END_PATTERN = /[（「『【\[\({]$/;
// Characters that must not start a line (closing punctuation, small kana, prolonged sound mark,
// and a spaced slash separator so "A / B" never wraps to a line beginning with "/").
const NO_BREAK_BEFORE_PATTERN = /[、。，．・,.!?！？:：;；)\]\}）」』】〉》〕｝ーぁぃぅぇぉっゃゅょゎ々/／]/;
// Characters that must not end a line (opening punctuation).
const NO_BREAK_AFTER_PATTERN = /[（「『【〔｛(\[\{〈《]/;
// Letters, digits, kana, and kanji count as line "content"; punctuation does not.
const CONTENT_CHAR_PATTERN = /[A-Za-z0-9\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const JAPANESE_SCRIPT_PATTERN = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
// Full-width glyphs (kana, kanji, prolonged-sound mark, middle dot, full-width forms) take ~1 em.
const FULL_WIDTH_PATTERN = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\u30FC\u30FB\uFF01-\uFF60\uFFE0-\uFFE6]/u;
// A kanji (Han) ideograph; adjacent Han glyphs stay together so compounds like 削除 are not split.
const HAN_PATTERN = /\p{Script=Han}/u;
// A maximal run of katakana stays together so loanwords (オブジェクト, メンバー) never break.
const KATAKANA_RUN = "[\\u30A0-\\u30FF\\u31F0-\\u31FF\\uFF66-\\uFF9F\\u30FC\\u30FB]+";
// An atomic token keeps Latin words, identifiers, grouped numbers (150,000, v1.2), and katakana
// loanwords together; every other character (kanji, hiragana, punctuation) is its own token.
const WRAP_TOKEN_PATTERN = new RegExp(`[A-Za-z0-9]+(?:[.,_+#%@'’-][A-Za-z0-9]+)*|${KATAKANA_RUN}|\\s+|[\\s\\S]`, "gu");

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

  if (element.role === "callout" || element.role === "subtitle") {
    return 14;
  }

  if (element.role === "caption") {
    if (isGeneratedDiagramIntentText(element)) {
      return 8.5;
    }

    return 12;
  }

  // Dense Japanese report cards still need a practical floor; below 12pt, projected decks and
  // Studio/PDF previews become visibly fragile even when the text technically fits.
  return 12;
}

function isGeneratedDiagramIntentText(element: TextElement): boolean {
  return /^diagram-intent-/u.test(element.id) || element.altText === "generated diagram intent text";
}

export function textReadableMinimumFontSize(element: TextElement): number {
  if (element.role === "title") {
    return 24;
  }

  if (element.role === "callout" || element.role === "subtitle") {
    return 14;
  }

  if (element.role === "caption") {
    if (isGeneratedDiagramIntentText(element)) {
      return 8.5;
    }

    return 12;
  }

  return 12;
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
  const usableWidth = Math.max(0.1, (width - TEXT_BOX_INSET) * LINE_WIDTH_SAFETY);
  return Math.max(2, usableWidth / ((fontSize * TEXT_WIDTH_FACTOR) / 72));
}

// The true number of units a box holds at a font size (no early-wrap safety margin, but still net of
// renderer padding). Used to validate that a line really overflows, so keeping a kanji compound
// together (which may slightly exceed the early wrap target) is not mistaken for overflow when it
// still fits the actual box.
function lineCapacity(width: number, fontSize: number): number {
  const usableWidth = Math.max(0.1, width - TEXT_BOX_INSET);
  return Math.max(2, usableWidth / ((fontSize * TEXT_WIDTH_FACTOR) / 72));
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

function wrapLineIfOverwide(value: string, maxUnits: number): string[] {
  return textUnits(value.trim()) > maxUnits ? wrapParagraph(value.trim(), maxUnits) : [value];
}

function splitOverwideToken(token: string, maxUnits: number): string[] {
  if (/^[A-Za-z0-9_]+(?:[.,_+#%@'’-][A-Za-z0-9_]+)*$/.test(token)) {
    return [token];
  }

  const chunks: string[] = [];
  let chunk = "";
  for (const char of Array.from(token)) {
    if (chunk && textUnits(`${chunk}${char}`) > maxUnits) {
      chunks.push(chunk);
      chunk = char;
    } else {
      chunk += char;
    }
  }

  if (chunk) {
    chunks.push(chunk);
  }

  return chunks.length ? chunks : [token];
}

function hardWrapLineToWidth(value: string, maxUnits: number): string[] {
  const tokens = tokenizeForWrap(value.trim()).filter((token) => token.length > 0);
  const lines: string[] = [];
  let line = "";

  const pushLine = () => {
    if (line.trim()) {
      lines.push(line.trim());
      line = "";
    }
  };

  for (const token of tokens) {
    if (/^\s+$/.test(token)) {
      if (line && !line.endsWith(" ")) {
        line += " ";
      }
      continue;
    }

    const candidates = textUnits(token) > maxUnits ? splitOverwideToken(token, maxUnits) : [token];
    for (const candidate of candidates) {
      const nextLine = `${line}${candidate}`;
      if (!line || textUnits(nextLine) <= maxUnits) {
        line = nextLine;
        continue;
      }

      pushLine();
      line = candidate;
    }
  }

  pushLine();
  return repairHardWrappedLines(lines.length ? lines : [value.trim()]);
}

function contentCharacterCount(value: string): number {
  return Array.from(value).filter((char) => CONTENT_CHAR_PATTERN.test(char)).length;
}

function movePreviousTailToLine(previous: string, current: string): [string, string] {
  const previousChars = Array.from(previous.trimEnd());
  while (previousChars.length > 0) {
    const char = previousChars.pop() ?? "";
    if (!char.trim()) {
      continue;
    }

    return [previousChars.join("").trimEnd(), `${char}${current}`.trim()];
  }

  return [previous, current];
}

function repairHardWrappedLines(lines: string[]): string[] {
  const repaired = [...lines];
  for (let index = 1; index < repaired.length; index += 1) {
    const current = repaired[index].trim();
    if (/^[/／|｜]+$/.test(current)) {
      if (index + 1 < repaired.length) {
        repaired[index + 1] = `${current} ${repaired[index + 1].trimStart()}`.trim();
        repaired.splice(index, 1);
        index -= 1;
      } else {
        repaired[index - 1] = `${repaired[index - 1].trimEnd()} ${current}`.trim();
        repaired.splice(index, 1);
        index -= 1;
      }
      continue;
    }

    if (contentCharacterCount(current) <= 1 && repaired[index - 1].trim().length > 1) {
      const [previous, next] = movePreviousTailToLine(repaired[index - 1], current);
      repaired[index - 1] = previous;
      repaired[index] = next;
    }
  }

  return repaired.filter((line) => line.trim());
}

function enforceLineWidths(value: string, width: number, fontSize: number): string {
  const maxUnits = maxUnitsPerLine(width, fontSize);
  return value
    .split(/\r?\n/)
    .flatMap((line) => (textUnits(line.trim()) > maxUnits ? hardWrapLineToWidth(line, maxUnits) : [line]))
    .join("\n");
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

function isListMarkerOnly(value: string): boolean {
  return /^(?:[-*•・✓✔]|\d+[.)．、]|[（(]?\d+[）)]|[A-Za-z][.)])\s*$/.test(value.trim());
}

function startsWithBadJapaneseContinuation(previous: string, value: string): boolean {
  const prior = previous.trim();
  const current = value.trim();
  if (!JAPANESE_SCRIPT_PATTERN.test(current)) {
    return false;
  }

  if (/^[ぁ-んー]\p{Script=Han}/u.test(current)) {
    return true;
  }

  if (!JAPANESE_SCRIPT_PATTERN.test(prior)) {
    return false;
  }

  if (!/[\p{Script=Hiragana}]$/u.test(prior)) {
    return false;
  }

  return /^(?:る(?:こと|ため|場合|状態|入口|よう|$)|れ(?:る|ば|た|て)|られ(?:る|た|て)|て(?:いる|いない|おり|ある|ない|ください|しま|も|は|、|$)|で(?:いる|いない|おり|ある|ない|も|は|、|$)|ない(?:場合|こと|ため|状態|$)|ます|ました|ません|して|した|する|され|いる|いない|おり|ある|あり|なる|なり|きる|できる|できない|こと|ため|もの|場合|状態|入口)/u.test(
    current
  );
}

function isBadContinuationLine(previous: string, current: string): boolean {
  const trimmed = current.trim();
  if (!trimmed || isListLine(trimmed)) {
    return false;
  }

  const currentContentChars = contentCharacterCount(trimmed);
  if (currentContentChars <= 1 && !isAcceptableShortLine(trimmed)) {
    return true;
  }

  return previous.trim().length > 0 && startsWithBadJapaneseContinuation(previous, trimmed);
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
    if (element.role === "caption" && isGeneratedDiagramIntentText(element)) {
      return lines.join("\n");
    }

    const hasBlankLine = lines.some((line) => !line.trim());
    const nonEmptyLines = lines.filter((line) => line.trim());
    if (nonEmptyLines.length > 1 && nonEmptyLines.some(isListLine)) {
      return lines.flatMap((line) => (line.trim() ? wrapLineIfOverwide(line, unitsPerLine) : [line])).join("\n");
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

function textFitsAtSize(element: TextElement, fontSize: number): { fits: boolean; text: string } {
  const text = normalizeTextLines(element, fontSize);
  const candidate = { ...element, text, fontSize };
  const overflow = estimateTextOverflow(candidate);
  const hasBadBreak = Boolean(findTextLineBreakIssue(candidate));
  const lineWidthBudget = lineCapacity(candidate.w, fontSize);
  const anyLineTooWide = text.split(/\r?\n/).some((line) => textUnits(line.trim()) > lineWidthBudget + 0.01);
  return { fits: !overflow.overflows && !hasBadBreak && !anyLineTooWide, text };
}

function shortenTextToFit(element: TextElement, fontSize: number): string {
  const normalized = element.text.replace(/\s+/g, " ").trim();
  const chars = Array.from(normalized);
  if (chars.length <= 1) {
    return normalized;
  }

  let low = 1;
  let high = chars.length;
  const ellipsisFit = textFitsAtSize({ ...element, text: "…" }, fontSize);
  let best = ellipsisFit.fits ? ellipsisFit.text : "…";
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidateText = `${chars.slice(0, mid).join("").trimEnd()}…`;
    const result = textFitsAtSize({ ...element, text: candidateText }, fontSize);
    if (result.fits) {
      best = result.text;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

export function findTextLineBreakIssue(element: TextElement): string | undefined {
  if (!element.text.includes("\n") || isPreformattedText(element.text)) {
    return undefined;
  }

  const lines = element.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) {
    return undefined;
  }

  const markerOnlyLine = lines.find(isListMarkerOnly);
  if (markerOnlyLine) {
    return `Line "${markerOnlyLine}" is only a list marker; keep the marker with its item text.`;
  }

  const hasListStructure = lines.some(isListLine);
  if (hasListStructure) {
    for (let index = 1; index < lines.length; index += 1) {
      if (isBadContinuationLine(lines[index - 1], lines[index])) {
        return `Line "${lines[index]}" looks like a broken continuation inside a list; rebalance the line break, widen the box, or shorten the copy.`;
      }
    }

    return undefined;
  }

  const badLine = lines.find((line) => BAD_LINE_START_PATTERN.test(line) || BAD_LINE_END_PATTERN.test(line));
  if (badLine) {
    return `Line "${badLine}" starts or ends with punctuation that should stay with adjacent text.`;
  }

  const previousMaxUnits = Math.max(...lines.slice(0, -1).map(textUnits), 0);
  const isCompactLabelValue = isCompactManualStructure(element, lines) && previousMaxUnits <= 6;
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    const contentChars = Array.from(line).filter((char) => CONTENT_CHAR_PATTERN.test(char)).length;
    if (startsWithBadJapaneseContinuation(lines[index - 1], line)) {
      return `Line "${line}" looks like a broken continuation; rebalance the line break, widen the box, or shorten the copy.`;
    }

    if (contentChars <= 1 && !isAcceptableShortLine(line) && !isCompactLabelValue) {
      return `Line "${line}" is an orphan; rebalance the line break, widen the box, or shorten the copy.`;
    }
  }

  return undefined;
}

function fitTextElement(element: TextElement, tokens: DesignTokens, options: { shortenAtMinimum?: boolean } = {}): TextElement {
  let next: TextElement = cloneElement(element);
  let fontSize = Math.max(next.fontSize ?? defaultFontSizeForRole(next.role, tokens), textMinimumFontSize(next));
  const minimumFontSize = textMinimumFontSize(next);

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const result = textFitsAtSize(next, fontSize);
    if (result.fits) {
      next = { ...next, text: result.text };
      break;
    }

    if (fontSize <= minimumFontSize) {
      const text = result.text;
      const shouldShorten = next.role === "caption" && !isGeneratedDiagramIntentText(next);
      next = {
        ...next,
        text: shouldShorten && options.shortenAtMinimum ? shortenTextToFit({ ...next, text }, fontSize) : isPreformattedText(text) ? text : enforceLineWidths(text, next.w, fontSize)
      };
      break;
    }
    fontSize = Math.max(minimumFontSize, fontSize - 1);
  }

  return { ...next, fontSize };
}

function requiredTextHeightInches(element: TextElement, fontSize: number): number {
  const overflow = estimateTextOverflow({ ...element, fontSize });
  return Math.max(element.h, (overflow.estimatedLines * fontSize * LINE_HEIGHT_FACTOR) / 72);
}

function requiredTextWidthInches(element: TextElement, fontSize: number): number {
  const longestLineUnits = Math.max(...element.text.split(/\r?\n/).map((line) => textUnits(line.trim())), 0);
  return Math.max(element.w, (longestLineUnits * ((fontSize * TEXT_WIDTH_FACTOR) / 72)) / LINE_WIDTH_SAFETY + TEXT_BOX_INSET);
}

function nearlyEqual(a: number, b: number, tolerance = 0.04): boolean {
  return Math.abs(a - b) <= tolerance;
}

function horizontalOverlap(a: SlideElement, b: SlideElement): number {
  return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
}

function isRoundedCardShape(element: SlideElement): element is Extract<SlideElement, { type: "shape" }> {
  return element.type === "shape" && (element.shape === "roundRect" || element.shape === "roundedRect") && element.fill !== "none" && element.w >= 1 && element.h >= 0.45;
}

function isCardEdgeAccentBar(element: SlideElement): element is Extract<SlideElement, { type: "shape" }> {
  return element.type === "shape" && (element.shape === "rect" || element.shape === "roundRect" || element.shape === "roundedRect") && element.fill !== "none" && element.decorative && element.w <= 0.22 && element.h >= 0.45;
}

function expandCardsToContainContent(elements: SlideElement[]): SlideElement[] {
  const cards = elements.filter(isRoundedCardShape).filter((card) => !isFullBleed(card));
  if (cards.length === 0) {
    return elements;
  }

  const expandedHeights = new Map<string, number>();
  for (const card of cards) {
    const blockingTop = Math.min(
      ...cards
        .filter((candidate) => candidate.id !== card.id && candidate.y > card.y + 0.12 && horizontalOverlap(card, candidate) > Math.min(card.w, candidate.w) * 0.35)
        .map((candidate) => candidate.y),
      SLIDE_WIDE.height
    );
    const maxBottom = Math.min(SLIDE_WIDE.height - 0.08, blockingTop - 0.08);
    const contentBottom = Math.max(
      card.y + card.h,
      ...elements
        .filter((element) => {
          if (element.id === card.id || element.type === "image" || element.type === "svg" || element.type === "diagram") {
            return false;
          }

          const horizontallyInside = element.x >= card.x - 0.04 && element.x + element.w <= card.x + card.w + 0.04;
          const verticallyAssociated = element.y >= card.y - 0.04 && element.y <= card.y + card.h + 0.85;
          const isNestedCard = isRoundedCardShape(element) && element.w > card.w * 0.55 && element.h > card.h * 0.55;
          return horizontallyInside && verticallyAssociated && !isNestedCard;
        })
        .map((element) => element.y + element.h)
    );
    const desiredHeight = Math.min(maxBottom, contentBottom + 0.16) - card.y;
    if (desiredHeight > card.h + 0.03) {
      expandedHeights.set(card.id, Math.max(card.h, desiredHeight));
    }
  }

  if (expandedHeights.size === 0) {
    return elements;
  }

  return elements.map((element) => {
    if (isRoundedCardShape(element) && expandedHeights.has(element.id)) {
      return { ...element, h: expandedHeights.get(element.id) ?? element.h };
    }

    if (isCardEdgeAccentBar(element)) {
      const card = cards.find((candidate) => expandedHeights.has(candidate.id) && nearlyEqual(candidate.x, element.x) && nearlyEqual(candidate.y, element.y) && nearlyEqual(candidate.h, element.h));
      if (card) {
        return { ...element, h: expandedHeights.get(card.id) ?? element.h };
      }
    }

    return element;
  });
}

function normalizeCardAccentBars(elements: SlideElement[]): SlideElement[] {
  const cards = elements.filter(isRoundedCardShape);
  if (cards.length === 0) {
    return elements;
  }

  return elements.map((element) => {
    if (!isCardEdgeAccentBar(element)) {
      return element;
    }

    const card = cards.find(
      (candidate) =>
        candidate.id !== element.id &&
        nearlyEqual(candidate.x, element.x) &&
        nearlyEqual(candidate.y, element.y) &&
        nearlyEqual(candidate.h, element.h) &&
        candidate.w > element.w * 4
    );
    if (!card) {
      return element;
    }

    const insetY = Math.min(0.16, Math.max(0.05, card.h * 0.08));
    const insetX = Math.min(0.08, Math.max(0.03, card.w * 0.01));
    return {
      ...element,
      shape: "roundRect",
      x: card.x + insetX,
      y: card.y + insetY,
      w: Math.min(element.w, 0.14),
      h: Math.max(0.08, card.h - insetY * 2),
      radius: Math.min(0.06, element.w / 2),
      line: { color: element.fill, width: 0.1 }
    };
  });
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
    let fitted = fitTextElement(next, tokens);
    const fittedFontSize = fitted.fontSize ?? defaultFontSizeForRole(fitted.role, tokens);
    const requiredWidth = requiredTextWidthInches(fitted, fittedFontSize);
    if (requiredWidth > fitted.w && fitted.x + fitted.w < SLIDE_WIDE.width) {
      fitted = fitTextElement({
        ...fitted,
        w: clamp(requiredWidth, fitted.w, SLIDE_WIDE.width - fitted.x)
      }, tokens);
    }
    const requiredHeight = requiredTextHeightInches(fitted, fitted.fontSize ?? defaultFontSizeForRole(fitted.role, tokens));
    let expanded = fitted;
    if (requiredHeight > fitted.h) {
      expanded = {
        ...fitted,
        h: clamp(requiredHeight, fitted.h, SLIDE_WIDE.height - fitted.y)
      };
    }

    return fitTextElement(expanded, tokens, { shortenAtMinimum: true });
  }

  return next;
}

export function normalizeSlideLayout(slide: Slide, tokens: DesignTokens = defaultTokens("en-US")): Slide {
  const fittedElements = slide.elements.map((element) => fitElementToSlide(element, tokens));
  return normalizeReadingOrder({
    ...slide,
    elements: normalizeCardAccentBars(expandCardsToContainContent(fittedElements))
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
