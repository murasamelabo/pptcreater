import { contrastRatio, defaultTokens, expandHex, hexToRgb } from "./color.js";
import type { DesignTokens, Locale, ShapeElement, Slide, SlideElement, TextElement } from "./schema.js";

const SLIDE_WIDTH = 13.333;
const SLIDE_HEIGHT = 7.5;
const MARGIN_X = 1.0;

export type SectionDividerInput = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
};

export type SectionDividerOptions = {
  locale?: Locale;
  tokens?: DesignTokens;
  accent?: string;
  numbered?: boolean;
  index?: number;
  total?: number;
  id?: string;
  idPrefix?: string;
  speakerNotes?: string;
};

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function scaleTowardBlack(hex: string, factor: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `#${[r, g, b].map((channel) => clampChannel(channel * factor).toString(16).padStart(2, "0")).join("")}`;
}

// Section dividers carry the chapter signal, so they use a saturated full-bleed
// background. Darken the accent until white body text clears the AA threshold,
// guaranteeing the divider is readable regardless of the brand accent supplied.
function dividerBackground(accent: string): string {
  let candidate = expandHex(accent);
  for (let attempt = 0; attempt < 24 && contrastRatio("#ffffff", candidate) < 4.8; attempt += 1) {
    candidate = scaleTowardBlack(candidate, 0.86);
  }
  return candidate;
}

function readableOn(background: string): string {
  return contrastRatio("#ffffff", background) >= contrastRatio("#0f172a", background) ? "#ffffff" : "#0f172a";
}

function softOn(background: string, onColor: string): string {
  // A slightly muted variant of the on-color for eyebrow/subtitle text while
  // staying above AA. Move 22% toward the background, then verify contrast.
  const bg = hexToRgb(background);
  const fg = hexToRgb(onColor);
  const blend = {
    r: clampChannel(fg.r * 0.78 + bg.r * 0.22),
    g: clampChannel(fg.g * 0.78 + bg.g * 0.22),
    b: clampChannel(fg.b * 0.78 + bg.b * 0.22)
  };
  const candidate = `#${[blend.r, blend.g, blend.b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  return contrastRatio(candidate, background) >= 4.5 ? candidate : onColor;
}

function titleFontSize(title: string): number {
  const length = [...title].length;
  if (length <= 12) {
    return 44;
  }
  if (length <= 18) {
    return 38;
  }
  if (length <= 26) {
    return 32;
  }
  if (length <= 36) {
    return 26;
  }
  return 24;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function eyebrowLabel(input: SectionDividerInput, options: SectionDividerOptions, isJapanese: boolean): string {
  if (input.eyebrow && input.eyebrow.trim().length > 0) {
    return input.eyebrow.trim();
  }

  const base = isJapanese ? "セクション" : "SECTION";
  const numbered = options.numbered ?? true;
  if (!numbered || options.index === undefined) {
    return base;
  }

  const indexLabel = pad2(options.index);
  if (options.total === undefined) {
    return `${base} ${indexLabel}`;
  }

  return `${base} ${indexLabel} / ${pad2(options.total)}`;
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
  options: { bold?: boolean; align?: TextElement["align"]; valign?: TextElement["valign"]; characterSpacing?: number } = {}
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
    characterSpacing: options.characterSpacing,
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
  readingOrder: number
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
    line: { color: fill, width: 0.1 },
    decorative: true,
    readingOrder
  };
}

export function createSectionDividerSlide(
  input: SectionDividerInput | string,
  options: SectionDividerOptions = {}
): Slide {
  const section: SectionDividerInput = typeof input === "string" ? { title: input } : input;
  const title = section.title.trim();
  if (title.length === 0) {
    throw new Error("Section divider requires a non-empty title.");
  }

  const locale = options.locale ?? "ja-JP";
  const isJapanese = locale === "ja-JP";
  const tokens = options.tokens ?? defaultTokens(locale);
  const accent = options.accent ?? tokens.colors.accent;
  const background = dividerBackground(accent);
  const onAccent = readableOn(background);
  const softColor = softOn(background, onAccent);

  const idPrefix = options.idPrefix ?? "section";
  const slideId = options.id ?? `${idPrefix}-${options.index ?? 1}`;
  const elementPrefix = slideId;

  const eyebrow = eyebrowLabel(section, options, isJapanese);
  const fontSize = titleFontSize(title);

  const elements: SlideElement[] = [
    shapeElement(`${elementPrefix}-bg`, "rect", 0, 0, SLIDE_WIDTH, SLIDE_HEIGHT, background, 0),
    shapeElement(`${elementPrefix}-rule`, "rect", MARGIN_X, 2.5, 1.8, 0.08, onAccent, 1),
    textElement(`${elementPrefix}-eyebrow`, "caption", eyebrow, MARGIN_X, 1.85, SLIDE_WIDTH - MARGIN_X * 2, 0.5, 2, 16, softColor, background, {
      bold: true,
      valign: "middle",
      characterSpacing: 2
    }),
    textElement(`${elementPrefix}-title`, "title", title, MARGIN_X, 2.85, SLIDE_WIDTH - MARGIN_X * 2, 2.4, 3, fontSize, onAccent, background, {
      bold: true,
      valign: "top"
    })
  ];

  if (section.subtitle && section.subtitle.trim().length > 0) {
    elements.push(
      textElement(`${elementPrefix}-subtitle`, "subtitle", section.subtitle.trim(), MARGIN_X, 5.35, SLIDE_WIDTH - MARGIN_X * 2, 1.3, 4, 22, softColor, background, {
        valign: "top"
      })
    );
  }

  return {
    id: slideId,
    title,
    layout: "section",
    speakerNotes: options.speakerNotes,
    elements
  };
}

export function createSectionDividerSlides(
  sections: Array<SectionDividerInput | string>,
  options: Omit<SectionDividerOptions, "index" | "total" | "id"> = {}
): Slide[] {
  const total = sections.length;
  const numbered = options.numbered ?? true;
  return sections.map((section, position) =>
    createSectionDividerSlide(section, {
      ...options,
      numbered,
      index: position + 1,
      total
    })
  );
}
