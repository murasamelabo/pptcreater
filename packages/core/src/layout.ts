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
const CARD_CONTENT_PADDING = 0.16;
const CARD_BLOCK_GAP = 0.18;
// Horizontal breathing room kept between a card's inner content and its left/right edges.
const CARD_SIDE_PADDING = 0.16;
// Left inset (inches) applied to a card's inner content when the card carries a left-edge accent
// bar. normalizeCardAccentBars insets the bar to at most card.x + 0.08 and widens it to 0.14, so a
// 0.34 content inset guarantees the text never touches the colored bar (>=0.12in clearance) while
// keeping every card in a row aligned to the same content margin.
const CARD_ACCENT_CONTENT_INSET = 0.34;
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
function wrapTokens(value: string, maxUnits: number, avoidOrphanOnset = false): { lines: string[]; overflow: boolean } {
  const tokens = tokenizeForWrap(value);
  const lines: string[] = [];
  let line = "";
  let lineUnits = 0;
  let overflow = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
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
    // When emitting text (not when only estimating physical overflow), mirror the line-break linter:
    // never break so the next line begins with a hiragana bound to the text before it (okurigana like
    // "覆/す反" or a verb suffix). Otherwise the wrap creates exactly the orphan continuation
    // findTextLineBreakIssue flags, so a reflow can never clear it. Only hold the onset back when it
    // still fits the real box width — never trade an orphan onset for an overflow that would force a
    // Latin identifier to be hard-split.
    const onsetFitsBox = avoidOrphanOnset && textUnits(trimmed) + tokenUnits <= maxUnits / LINE_WIDTH_SAFETY;
    const breakWouldOrphanJapanese =
      onsetFitsBox && startsWithBadJapaneseContinuation(trimmed, tokens.slice(index, index + 4).join(""));
    if (canBreakBetween(trimmed.slice(-1), token[0]) && !breakWouldOrphanJapanese) {
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
function wrapBalanced(value: string, maxUnits: number, avoidOrphanOnset = false): string[] {
  const greedy = wrapTokens(value, maxUnits, avoidOrphanOnset);
  const lineCount = greedy.lines.length;
  if (lineCount <= 1 || greedy.overflow) {
    return greedy.lines;
  }

  const longestToken = Math.max(...tokenizeForWrap(value).filter((token) => token.trim()).map(textUnits), 0);
  const balancedCap = Math.max(longestToken, textUnits(value) / lineCount + 0.5);
  const balanced = wrapTokens(value, balancedCap, avoidOrphanOnset);
  return balanced.lines.length === lineCount && !balanced.overflow ? balanced.lines : greedy.lines;
}

function wrapParagraph(value: string, maxUnits: number): string[] {
  return wrapBalanced(value.trim(), maxUnits, true);
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

/**
 * Rejoin list items that an author split mid-item (e.g. a bullet whose text continues on the next
 * line, or a marker-only line), then re-wrap each whole item to the box width. A new item begins
 * only at a line that itself carries a list marker, so distinct bullets stay separate.
 */
function reflowListLines(lines: string[], unitsPerLine: number): string[] {
  const items: string[] = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }

    if (items.length === 0 || isListLine(trimmed)) {
      items.push(trimmed);
    } else {
      items[items.length - 1] = joinReflowLines([items[items.length - 1], trimmed]);
    }
  }

  return items.flatMap((item) => wrapListItem(item, unitsPerLine));
}

/**
 * Wrap one list item, guaranteeing the leading marker is never orphaned on its own line. When the
 * first content token is nearly as wide as the box (e.g. a long identifier), a plain wrap pushes the
 * marker onto a line by itself — which the line-break linter flags. Re-glue the marker to the first
 * content line; the combined line still fits the real box width even if it exceeds the early-wrap
 * target, so the renderer does not re-wrap it.
 */
function wrapListItem(item: string, maxUnits: number): string[] {
  const wrapped = wrapLineIfOverwide(item, maxUnits);
  if (wrapped.length > 1 && isListMarkerOnly(wrapped[0])) {
    const [marker, next, ...rest] = wrapped;
    return [joinReflowLines([marker, next]), ...rest];
  }

  return wrapped;
}

/**
 * Last-resort guard for author-supplied manual breaks that fall mid-word or leave orphan
 * continuations. Polish advertises `layout.bad-line-break` as auto-fixable, but the manual-break
 * preserving branches above can keep a break the line-break linter still flags. When that happens we
 * recompute a kinsoku-aware reflow (per-item for lists, whole-paragraph otherwise) and adopt it only
 * if it removes the flagged break — so we never make a layout worse, and we leave intentional compact
 * label stacks, generated diagram-intent captions, titles, and preformatted text untouched.
 */
function resolveManualBreakIssues(element: TextElement, candidateText: string, unitsPerLine: number): string {
  if (!candidateText.includes("\n") || element.role === "title" || isGeneratedDiagramIntentText(element) || isPreformattedText(candidateText)) {
    return candidateText;
  }

  if (!findTextLineBreakIssue({ ...element, text: candidateText })) {
    return candidateText;
  }

  const lines = candidateText.split(/\r?\n/);
  const reflowed = lines.some((line) => isListLine(line))
    ? reflowListLines(lines, unitsPerLine).join("\n")
    : wrapParagraph(joinReflowLines(lines), unitsPerLine).join("\n");

  if (reflowed && !findTextLineBreakIssue({ ...element, text: reflowed })) {
    return reflowed;
  }

  return candidateText;
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
      const wrappedList = lines.flatMap((line) => (line.trim() ? wrapLineIfOverwide(line, unitsPerLine) : [line])).join("\n");
      return resolveManualBreakIssues(element, wrappedList, unitsPerLine);
    }

    if (!hasBlankLine && !isPreformattedText(element.text)) {
      // When the box is too short for the author's manual breaks, reflow into fewer lines so labels
      // such as "Active\nDirectory" collapse to one line instead of overflowing a one-line-tall box.
      const exceedsHeight = nonEmptyLines.length > maxLinesByHeight;
      if (!exceedsHeight && !shouldReflowManualLines(lines, unitsPerLine)) {
        return resolveManualBreakIssues(element, lines.join("\n"), unitsPerLine);
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

function isSmallBulletMark(element: SlideElement): element is Extract<SlideElement, { type: "shape" }> {
  return element.type === "shape" && (element.shape === "ellipse" || element.shape === "oval") && element.decorative && element.w <= 0.28 && element.h <= 0.28;
}

function cardContentPrefix(cardId: string): string | undefined {
  const structural = /^(.*)-(?:box|card|panel|container|tile)$/u.exec(cardId);
  if (structural) {
    return `${structural[1]}-`;
  }

  const indexed = /^(.*-(?:card|metric)-\d+)$/u.exec(cardId);
  if (indexed) {
    return `${indexed[1]}-`;
  }

  return undefined;
}

function isCardContentCandidate(element: SlideElement): boolean {
  if (element.type === "image" || element.type === "svg" || element.type === "diagram") {
    return false;
  }
  return element.type === "text" || isCardEdgeAccentBar(element) || isSmallBulletMark(element);
}

// How much of `element` (by area) sits within the card's box.
function containmentRatio(element: SlideElement, card: Extract<SlideElement, { type: "shape" }>): number {
  const overlapW = Math.min(element.x + element.w, card.x + card.w) - Math.max(element.x, card.x);
  const overlapH = Math.min(element.y + element.h, card.y + card.h) - Math.max(element.y, card.y);
  if (overlapW <= 0 || overlapH <= 0) {
    return 0;
  }
  const area = element.w * element.h;
  return area > 0 ? (overlapW * overlapH) / area : 0;
}

function isCardAssociatedElement(element: SlideElement, card: Extract<SlideElement, { type: "shape" }>): boolean {
  if (element.id === card.id || !isCardContentCandidate(element)) {
    return false;
  }

  const prefix = cardContentPrefix(card.id);
  if (prefix && element.id.startsWith(prefix)) {
    const horizontallyInside = element.x >= card.x - 0.04 && element.x + element.w <= card.x + card.w + 0.04;
    const verticallyAssociated = element.y >= card.y - 0.04 && element.y <= card.y + card.h + 0.85;
    if (horizontallyInside && verticallyAssociated) {
      return true;
    }
  }

  // Geometric fallback so cards still grow to contain their content even when the deck author did
  // not follow the `<card>-<content>` id convention (e.g. agent-authored category cards).
  if (isFullBleed(card)) {
    return false;
  }
  const verticallyInside = element.y >= card.y - 0.08 && element.y <= card.y + card.h + 0.04;
  return verticallyInside && containmentRatio(element, card) >= 0.6;
}

// Detect a colored vertical accent bar sitting on the card's left edge. Used to push the card's
// inner content clear of the bar so text never overlaps or crowds the categorizing color block.
function cardLeftAccentBar(
  card: Extract<SlideElement, { type: "shape" }>,
  elements: SlideElement[]
): Extract<SlideElement, { type: "shape" }> | undefined {
  return elements.find(
    (element): element is Extract<SlideElement, { type: "shape" }> =>
      element.id !== card.id &&
      isCardEdgeAccentBar(element) &&
      element.x >= card.x - 0.12 &&
      element.x <= card.x + Math.min(card.w * 0.25, 0.6) &&
      element.y >= card.y - 0.16 &&
      element.y + element.h <= card.y + card.h + 0.16 &&
      element.h >= card.h * 0.5
  );
}

function refitAdjustedText(element: TextElement, tokens: DesignTokens): TextElement {
  let fitted = fitTextElement(element, tokens, { shortenAtMinimum: true });
  const fontSize = fitted.fontSize ?? defaultFontSizeForRole(fitted.role, tokens);
  const requiredHeight = requiredTextHeightInches(fitted, fontSize);
  if (requiredHeight > fitted.h) {
    fitted = fitTextElement(
      { ...fitted, h: clamp(requiredHeight, fitted.h, SLIDE_WIDE.height - fitted.y) },
      tokens,
      { shortenAtMinimum: true }
    );
  }
  return fitted;
}

// Keep a card's inner text/markers comfortably inside the card and clear of a left accent bar.
// Returns the adjusted elements plus the ids of text elements that moved/shrank so the caller can
// re-fit their font size and height (a narrower box may need to re-wrap onto more lines).
function insetCardContentForBars(
  elements: SlideElement[],
  tokens: DesignTokens
): { elements: SlideElement[]; adjustedIds: Set<string> } {
  const cards = elements.filter(isRoundedCardShape).filter((card) => !isFullBleed(card));
  if (cards.length === 0) {
    return { elements, adjustedIds: new Set() };
  }

  // Per-element horizontal shift (keeps a bullet marker aligned with its text) and an absolute right
  // edge each inside-card text must stay within. Shifts move the whole left-aligned content block
  // together so the dot/text spacing is preserved while clearing the colored accent bar.
  const shifts = new Map<string, number>();
  const maxRights = new Map<string, number>();
  for (const card of cards) {
    const hasLeftBar = Boolean(cardLeftAccentBar(card, elements));
    const contentLeft = card.x + (hasLeftBar ? CARD_ACCENT_CONTENT_INSET : CARD_SIDE_PADDING);
    const contentRight = card.x + card.w - CARD_SIDE_PADDING;
    if (contentRight - contentLeft < 0.4) {
      continue;
    }

    const insideContent = elements.filter(
      (element) =>
        element.id !== card.id &&
        (element.type === "text" || isSmallBulletMark(element)) &&
        containmentRatio(element, card) >= 0.6
    );

    if (hasLeftBar) {
      const leftBlock = insideContent.filter((element) => element.x < card.x + card.w * 0.5);
      if (leftBlock.length > 0) {
        const minLeft = Math.min(...leftBlock.map((element) => element.x));
        if (minLeft < contentLeft - 0.01) {
          const delta = contentLeft - minLeft;
          for (const element of leftBlock) {
            shifts.set(element.id, (shifts.get(element.id) ?? 0) + delta);
          }
        }
      }
    }

    for (const element of insideContent) {
      if (element.type === "text") {
        maxRights.set(element.id, Math.min(maxRights.get(element.id) ?? Infinity, contentRight));
      }
    }
  }

  if (shifts.size === 0 && maxRights.size === 0) {
    return { elements, adjustedIds: new Set() };
  }

  const adjustedIds = new Set<string>();
  const next = elements.map((element) => {
    const dx = shifts.get(element.id) ?? 0;
    const maxRight = maxRights.get(element.id);
    if (dx === 0 && maxRight === undefined) {
      return element;
    }

    const x = element.x + dx;
    if (element.type !== "text") {
      return dx === 0 ? element : { ...element, x };
    }

    let w = element.w;
    if (dx > 0) {
      // Shrink by the shift so the right edge keeps the author's original margin.
      w = Math.max(0.4, w - dx);
    }
    if (maxRight !== undefined && x + w > maxRight + 0.01) {
      w = Math.max(0.4, maxRight - x);
    }

    if (x === element.x && w === element.w) {
      return element;
    }
    adjustedIds.add(element.id);
    return refitAdjustedText({ ...element, x, w }, tokens);
  });
  return { elements: next, adjustedIds };
}

function expandCardsToContainContent(elements: SlideElement[]): SlideElement[] {
  const cards = elements.filter(isRoundedCardShape).filter((card) => !isFullBleed(card));
  if (cards.length === 0) {
    return elements;
  }

  type CardPlan = { card: Extract<SlideElement, { type: "shape" }>; needed: number; limit: number };
  const targetHeights = new Map<string, number>();
  const cardPlans = new Map<string, CardPlan>();
  for (const card of cards) {
    const associatedElements = elements.filter((element) => isCardAssociatedElement(element, card));
    const blockingTop = Math.min(
      ...elements
        .filter((candidate) => {
          if (candidate.id === card.id || associatedElements.some((element) => element.id === candidate.id)) {
            return false;
          }

          // A vertically-stacked sibling below this card blocks downward growth even when it is
          // tightly spaced. Using `card.y + card.h - 0.12` (rather than `+ 0.12`) closes a dead zone
          // where a sibling within ~0.12in below the card bottom was ignored, letting the card grow
          // straight over it. Same-row neighbours (candidate.y ≈ card.y) stay excluded.
          return candidate.y > card.y + card.h - 0.12 && horizontalOverlap(card, candidate) > Math.min(card.w, candidate.w) * 0.35;
        })
        .map((candidate) => candidate.y),
      SLIDE_WIDE.height
    );
    const maxBottom = Math.min(SLIDE_WIDE.height - 0.08, blockingTop - CARD_BLOCK_GAP);
    const limit = Math.max(card.h, maxBottom - card.y);
    const contentBottom = associatedElements.length > 0 ? Math.max(...associatedElements.map((element) => element.y + element.h)) : card.y + card.h;
    const needed = associatedElements.length > 0 ? Math.max(0.45, contentBottom + CARD_CONTENT_PADDING - card.y) : card.h;
    cardPlans.set(card.id, { card, needed, limit });
  }

  for (const row of cards.reduce<Extract<SlideElement, { type: "shape" }>[][]>((rows, card) => {
    const row = rows.find((candidate) => candidate.some((item) => nearlyEqual(item.y, card.y, 0.08)));
    if (row) {
      row.push(card);
    } else {
      rows.push([card]);
    }
    return rows;
  }, [])) {
    if (row.length <= 1) {
      const plan = cardPlans.get(row[0].id);
      if (plan && plan.needed > plan.card.h + 0.03) {
        targetHeights.set(plan.card.id, Math.min(plan.needed, plan.limit));
      }
      continue;
    }

    const rowPlans = row.map((card) => cardPlans.get(card.id)).filter((plan): plan is CardPlan => Boolean(plan));
    const rowBase = Math.min(...rowPlans.map((plan) => plan.card.h));
    const target = Math.min(
      Math.max(rowBase, ...rowPlans.map((plan) => plan.needed)),
      Math.min(...rowPlans.map((plan) => plan.limit))
    );
    for (const plan of rowPlans) {
      if (Math.abs(target - plan.card.h) > 0.03) {
        targetHeights.set(plan.card.id, target);
      }
    }
  }

  if (targetHeights.size === 0) {
    return elements;
  }

  return elements.map((element) => {
    if (isRoundedCardShape(element) && targetHeights.has(element.id)) {
      return { ...element, h: targetHeights.get(element.id) ?? element.h };
    }

    if (isCardEdgeAccentBar(element)) {
      const card = cards.find((candidate) => targetHeights.has(candidate.id) && nearlyEqual(candidate.x, element.x) && nearlyEqual(candidate.y, element.y) && nearlyEqual(candidate.h, element.h));
      if (card) {
        return { ...element, h: targetHeights.get(card.id) ?? element.h };
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
  const { elements: insetElements } = insetCardContentForBars(fittedElements, tokens);
  return normalizeReadingOrder({
    ...slide,
    elements: normalizeCardAccentBars(expandCardsToContainContent(insetElements))
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
