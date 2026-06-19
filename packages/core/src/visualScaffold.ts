import { contrastRatio, defaultTokens, expandHex, hexToRgb } from "./color.js";
import type { DesignTokens, Locale, ShapeElement, SlideElement, SvgElement, TextElement } from "./schema.js";

const SLIDE_WIDTH = 13.333;
const SLIDE_HEIGHT = 7.5;

export type VisualScaffoldFrame = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type VisualScaffoldInput = {
  concept: string;
  caption?: string;
  points?: string[];
  iconSvg?: string;
};

export type VisualScaffoldOptions = {
  locale?: Locale;
  tokens?: DesignTokens;
  accent?: string;
  frame?: Partial<VisualScaffoldFrame>;
  idPrefix?: string;
  readingOrderStart?: number;
};

export type VisualScaffoldResult = {
  elements: SlideElement[];
  summary: string;
  longDescription: string;
  warnings: string[];
};

const DEFAULT_FRAME: VisualScaffoldFrame = { x: 8.95, y: 1.5, w: 3.7, h: 5.6 };
const MAX_POINTS = 4;

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b].map((channel) => clampChannel(channel).toString(16).padStart(2, "0")).join("")}`;
}

// Blend `color` toward `background` by `ratio` (0 keeps color, 1 becomes background).
function blendToward(color: string, background: string, ratio: number): string {
  const fg = hexToRgb(color);
  const bg = hexToRgb(background);
  const mix = Math.max(0, Math.min(1, ratio));
  return toHex({
    r: fg.r * (1 - mix) + bg.r * mix,
    g: fg.g * (1 - mix) + bg.g * mix,
    b: fg.b * (1 - mix) + bg.b * mix
  });
}

function scaleTowardBlack(hex: string, factor: number): string {
  const { r, g, b } = hexToRgb(hex);
  return toHex({ r: r * factor, g: g * factor, b: b * factor });
}

// The emblem holds a white graphic (icon or monogram). Keep the accent unless it
// fails the 3:1 non-text contrast floor against white, then darken until it clears.
function emblemFill(accent: string): string {
  let candidate = expandHex(accent);
  for (let attempt = 0; attempt < 24 && contrastRatio("#ffffff", candidate) < 3.2; attempt += 1) {
    candidate = scaleTowardBlack(candidate, 0.86);
  }
  return candidate;
}

function readableText(preferred: string, fallback: string, background: string): string {
  return contrastRatio(preferred, background) >= 4.5 ? preferred : fallback;
}

function firstGrapheme(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "•";
  }
  const grapheme = [...trimmed][0] ?? "•";
  return /[a-z]/.test(grapheme) ? grapheme.toUpperCase() : grapheme;
}

function conceptFontSize(concept: string): number {
  const length = [...concept].length;
  if (length <= 8) {
    return 22;
  }
  if (length <= 14) {
    return 19;
  }
  if (length <= 22) {
    return 17;
  }
  return 15;
}

function pointFontSize(points: string[]): number {
  const longest = points.reduce((max, point) => Math.max(max, [...point].length), 0);
  if (longest <= 12) {
    return 14;
  }
  if (longest <= 20) {
    return 13;
  }
  return 12;
}

const MIN_FRAME_W = 1.6;
const MIN_FRAME_H = 2.4;

function resolveFrame(frame: Partial<VisualScaffoldFrame> | undefined): VisualScaffoldFrame {
  const resolved = { ...DEFAULT_FRAME, ...(frame ?? {}) };
  const x = Math.max(0, Math.min(resolved.x, SLIDE_WIDTH - MIN_FRAME_W));
  const y = Math.max(0, Math.min(resolved.y, SLIDE_HEIGHT - MIN_FRAME_H));
  const w = Math.max(MIN_FRAME_W, Math.min(resolved.w, SLIDE_WIDTH - x));
  const h = Math.max(MIN_FRAME_H, Math.min(resolved.h, SLIDE_HEIGHT - y));
  return { x, y, w, h };
}

function textElement(
  id: string,
  role: TextElement["role"],
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  readingOrder: number,
  fontSize: number,
  color: string,
  contrastBackground: string,
  options: { bold?: boolean; align?: TextElement["align"]; valign?: TextElement["valign"] } = {}
): TextElement {
  return {
    id,
    type: "text",
    x,
    y,
    w,
    h,
    role,
    text,
    fontSize,
    color,
    contrastBackground,
    bold: options.bold ?? false,
    align: options.align ?? "left",
    valign: options.valign ?? "top",
    decorative: false,
    readingOrder
  };
}

function shapeElement(
  id: string,
  shape: ShapeElement["shape"],
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  readingOrder: number,
  options: { radius?: number; lineColor?: string; lineWidth?: number } = {}
): ShapeElement {
  return {
    id,
    type: "shape",
    x,
    y,
    w,
    h,
    shape,
    fill,
    line: { color: options.lineColor ?? fill, width: options.lineWidth ?? 0.75 },
    radius: options.radius,
    decorative: true,
    readingOrder
  };
}

function svgElement(
  id: string,
  svg: string,
  x: number,
  y: number,
  w: number,
  h: number,
  readingOrder: number,
  altText: string
): SvgElement {
  return {
    id,
    type: "svg",
    x,
    y,
    w,
    h,
    svg,
    title: altText,
    description: altText,
    altText,
    decorative: false,
    readingOrder
  };
}

// Build a tasteful, editable right-rail concept visual for a content slide. The
// scaffold gives each slide visual structure (icon/emblem + concept label +
// supporting aspect chips) without flattened raster images, so it satisfies the
// visual-richness gate while staying accessible and overflow-safe.
export function createVisualScaffold(
  input: VisualScaffoldInput | string,
  options: VisualScaffoldOptions = {}
): VisualScaffoldResult {
  const normalized: VisualScaffoldInput = typeof input === "string" ? { concept: input } : input;
  const concept = normalized.concept.trim();
  if (concept.length === 0) {
    throw new Error("Visual scaffold requires a non-empty concept.");
  }

  const warnings: string[] = [];
  const locale = options.locale ?? "ja-JP";
  const tokens = options.tokens ?? defaultTokens(locale);
  const accent = options.accent ?? tokens.colors.accent;
  const frame = resolveFrame(options.frame);
  const idPrefix = options.idPrefix ?? "scaffold";
  let order = options.readingOrderStart ?? 200;
  const nextOrder = () => order++;

  const panelFill = blendToward(accent, tokens.colors.background, 0.9);
  const panelLine = blendToward(accent, tokens.colors.background, 0.62);
  const chipFill = blendToward(accent, tokens.colors.background, 0.84);
  const emblem = emblemFill(accent);
  const conceptColor = readableText(tokens.colors.text, "#0f172a", panelFill);
  const captionColor = readableText(tokens.colors.mutedText, conceptColor, panelFill);
  const chipText = readableText(tokens.colors.text, "#0f172a", chipFill);

  const padX = 0.32;
  const innerX = frame.x + padX;
  const innerW = frame.w - padX * 2;

  const elements: SlideElement[] = [
    shapeElement(`${idPrefix}-panel`, "roundRect", frame.x, frame.y, frame.w, frame.h, panelFill, nextOrder(), {
      radius: 0.16,
      lineColor: panelLine,
      lineWidth: 1
    })
  ];

  const emblemSize = Math.min(1.0, innerW - 0.4);
  const emblemX = frame.x + (frame.w - emblemSize) / 2;
  const emblemY = frame.y + 0.36;
  elements.push(
    shapeElement(`${idPrefix}-emblem`, "roundRect", emblemX, emblemY, emblemSize, emblemSize, emblem, nextOrder(), {
      radius: 0.22,
      lineColor: emblem
    })
  );

  const iconSvg = normalized.iconSvg?.trim();
  if (iconSvg && iconSvg.length > 0) {
    const iconPad = emblemSize * 0.24;
    elements.push(
      svgElement(
        `${idPrefix}-icon`,
        iconSvg,
        emblemX + iconPad,
        emblemY + iconPad,
        emblemSize - iconPad * 2,
        emblemSize - iconPad * 2,
        nextOrder(),
        concept
      )
    );
  } else {
    elements.push(
      textElement(
        `${idPrefix}-monogram`,
        "callout",
        firstGrapheme(concept),
        emblemX,
        emblemY,
        emblemSize,
        emblemSize,
        nextOrder(),
        Math.round(emblemSize * 34),
        "#ffffff",
        emblem,
        { bold: true, align: "center", valign: "middle" }
      )
    );
  }

  const conceptY = emblemY + emblemSize + 0.14;
  const conceptH = 0.6;
  elements.push(
    textElement(
      `${idPrefix}-concept`,
      "callout",
      concept,
      innerX,
      conceptY,
      innerW,
      conceptH,
      nextOrder(),
      conceptFontSize(concept),
      conceptColor,
      panelFill,
      { bold: true, align: "center", valign: "middle" }
    )
  );

  let cursorY = conceptY + conceptH + 0.04;
  const caption = normalized.caption?.trim();
  if (caption && caption.length > 0) {
    const captionH = 0.46;
    elements.push(
      textElement(
        `${idPrefix}-caption`,
        "caption",
        caption,
        innerX,
        cursorY,
        innerW,
        captionH,
        nextOrder(),
        12,
        captionColor,
        panelFill,
        { align: "center", valign: "top" }
      )
    );
    cursorY += captionH + 0.03;
  }

  const requestedPoints = (normalized.points ?? []).map((point) => point.trim()).filter((point) => point.length > 0);
  if (requestedPoints.length > 0) {
    const gap = 0.14;
    const bottom = frame.y + frame.h - 0.3;
    const available = bottom - cursorY;
    const chipUnit = 0.5 + gap;
    let maxChips = Math.max(0, Math.floor((available + gap) / chipUnit));
    maxChips = Math.min(maxChips, MAX_POINTS);

    if (requestedPoints.length > maxChips) {
      warnings.push(
        `visual-scaffold: ${requestedPoints.length} points provided but only ${maxChips} fit the frame; extra points were dropped. Shorten the rail or split the slide.`
      );
    }

    const points = requestedPoints.slice(0, maxChips);
    if (points.length > 0) {
      const chipH = Math.min(0.62, (available - gap * (points.length - 1)) / points.length);
      const fontSize = pointFontSize(points);
      const markerSize = Math.min(0.16, chipH - 0.2);
      points.forEach((point, index) => {
        const chipY = cursorY + index * (chipH + gap);
        elements.push(
          shapeElement(`${idPrefix}-chip-${index + 1}`, "roundRect", innerX, chipY, innerW, chipH, chipFill, nextOrder(), {
            radius: 0.1,
            lineColor: chipFill
          })
        );
        elements.push(
          shapeElement(
            `${idPrefix}-chip-${index + 1}-marker`,
            "roundRect",
            innerX + 0.16,
            chipY + (chipH - markerSize) / 2,
            markerSize,
            markerSize,
            accent,
            nextOrder(),
            { radius: 0.04, lineColor: accent }
          )
        );
        if ([...point].length > 24) {
          warnings.push(`visual-scaffold: chip text "${point}" is long and may wrap; keep aspect chips to short phrases.`);
        }
        elements.push(
          textElement(
            `${idPrefix}-chip-${index + 1}-text`,
            "body",
            point,
            innerX + 0.16 + markerSize + 0.16,
            chipY,
            innerW - 0.16 - markerSize - 0.28,
            chipH,
            nextOrder(),
            fontSize,
            chipText,
            chipFill,
            { valign: "middle" }
          )
        );
      });
    }
  }

  const summary = caption ? `${concept} — ${caption}` : concept;
  const longDescription =
    requestedPoints.length > 0
      ? `${summary}. ${locale === "ja-JP" ? "観点" : "Aspects"}: ${requestedPoints.join(" / ")}.`
      : `${summary}.`;

  return { elements, summary, longDescription, warnings };
}
