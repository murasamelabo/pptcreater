import type { ContentMode, DeckSpec, DesignTokens, Locale, ShapeElement, SlideElement, TextElement } from "./schema.js";
import { estimateTextOverflow } from "./layout.js";
import { getTemplate, recommendTemplateForContentMode, styleProfileTokens, templateForStyleProfile, type StyleProfile } from "./templates.js";

export type CreateSampleDeckOptions = {
  purpose?: string;
  audience?: string;
  slideCount?: number;
  contentMode?: ContentMode;
  styleProfile?: StyleProfile;
};

type Theme = {
  tokens: DesignTokens;
  background: string;
  surface: string;
  text: string;
  mutedText: string;
  accent: string;
  strongAccent: string;
  accentOnBackground: string;
  onAccent: string;
  cardLine: string;
  isDark: boolean;
};

function relativeLuminance(hex: string): number {
  const value = Number.parseInt(hex.replace("#", "").length === 3 ? hex.replace("#", "").replace(/(.)/g, "$1$1") : hex.replace("#", ""), 16);
  const channel = (c: number) => {
    const n = c / 255;
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel((value >> 16) & 255) + 0.7152 * channel((value >> 8) & 255) + 0.0722 * channel(value & 255);
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function readableOn(background: string): string {
  return contrastRatio("#ffffff", background) >= contrastRatio("#0f172a", background) ? "#ffffff" : "#0f172a";
}

function scaleToward(hex: string, factor: number): string {
  const normalized = hex.replace("#", "").length === 3 ? hex.replace("#", "").replace(/(.)/g, "$1$1") : hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  const r = Math.round(((value >> 16) & 255) * factor);
  const g = Math.round(((value >> 8) & 255) * factor);
  const b = Math.round((value & 255) * factor);
  return `#${[r, g, b].map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("")}`;
}

function strongAccent(accent: string): string {
  let candidate = accent;
  for (let attempt = 0; attempt < 12 && contrastRatio("#ffffff", candidate) < 4.5; attempt += 1) {
    candidate = scaleToward(candidate, 0.86);
  }
  return candidate;
}

function lightenToward(hex: string, factor: number): string {
  const normalized = hex.replace("#", "").length === 3 ? hex.replace("#", "").replace(/(.)/g, "$1$1") : hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  const mix = (c: number) => Math.round(c + (255 - c) * factor);
  const r = mix((value >> 16) & 255);
  const g = mix((value >> 8) & 255);
  const b = mix(value & 255);
  return `#${[r, g, b].map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("")}`;
}

function accentReadableOn(accent: string, background: string): string {
  if (contrastRatio(accent, background) >= 4.5) {
    return accent;
  }

  const onDark = relativeLuminance(background) < 0.4;
  let candidate = accent;
  for (let attempt = 0; attempt < 12 && contrastRatio(candidate, background) < 4.5; attempt += 1) {
    candidate = onDark ? lightenToward(candidate, 0.16) : scaleToward(candidate, 0.86);
  }
  return candidate;
}

function buildTheme(tokens: DesignTokens): Theme {
  const isDark = relativeLuminance(tokens.colors.background) < 0.4;
  const strong = strongAccent(tokens.colors.accent);
  return {
    tokens,
    background: tokens.colors.background,
    surface: tokens.colors.surface,
    text: tokens.colors.text,
    mutedText: tokens.colors.mutedText,
    accent: tokens.colors.accent,
    strongAccent: strong,
    accentOnBackground: accentReadableOn(tokens.colors.accent, tokens.colors.background),
    onAccent: readableOn(strong),
    cardLine: isDark ? "#334155" : "#cbd5e1",
    isDark
  };
}

function minFontForRole(role: TextElement["role"]): number {
  if (role === "title") {
    return 28;
  }

  if (role === "caption") {
    return 12;
  }

  return 20;
}

// Reduce a font size until the text fits its box (never below the role minimum),
// so generated slides never trip the layout.text-overflow-risk lint or visibly clip.
function fitFontSize(role: TextElement["role"], text: string, w: number, h: number, fontSize: number): number {
  const floor = minFontForRole(role);
  let size = Math.max(fontSize, floor);

  for (let attempt = 0; attempt < 28 && size > floor; attempt += 1) {
    const overflow = estimateTextOverflow({
      id: "fit",
      type: "text",
      role,
      text,
      x: 0,
      y: 0,
      w,
      h,
      fontSize: size,
      bold: false,
      decorative: false
    });

    if (!overflow.overflows) {
      break;
    }

    size -= 1;
  }

  return size;
}

function characterSpacingFor(role: TextElement["role"], text: string): number | undefined {
  if (role !== "title" && role !== "callout") {
    return undefined;
  }

  const hasJapanese = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(text);
  return hasJapanese ? -0.4 : -1;
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
  align?: TextElement["align"],
  valign?: TextElement["valign"]
): SlideElement {
  return {
    id,
    type: "text",
    role,
    text,
    x,
    y,
    w,
    h,
    fontSize: fitFontSize(role, text, w, h, Math.max(fontSize, minFontForRole(role))),
    color,
    contrastBackground,
    characterSpacing: characterSpacingFor(role, text),
    align,
    valign,
    bold: role === "title" || role === "callout",
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
  readingOrder: number,
  fill: ShapeElement["fill"],
  line: ShapeElement["line"],
  fillOpacity?: number
): SlideElement {
  return {
    id,
    type: "shape",
    shape,
    x,
    y,
    w,
    h,
    fill,
    fillOpacity,
    line,
    decorative: true,
    readingOrder
  };
}

const ICON_PATHS: Record<string, string> = {
  idea: '<path d="M10 2.5a5 5 0 0 0-3 9v2h6v-2a5 5 0 0 0-3-9Z" /><path d="M8 16h4" /><path d="M8.5 18h3" />',
  people:
    '<circle cx="7" cy="8" r="2.4" /><circle cx="13.4" cy="8.6" r="2" /><path d="M3.4 16c0-2.3 1.8-3.7 3.6-3.7S10.6 13.7 10.6 16" /><path d="M12 12.7c1.9 0 3.6 1.2 3.6 3.3" />',
  structure:
    '<rect x="3" y="3.4" width="5" height="3.8" rx="1" /><rect x="12" y="12.8" width="5" height="3.8" rx="1" /><path d="M5.5 7.2v3.1a2 2 0 0 0 2 2h4.5" />',
  visual: '<rect x="3" y="4" width="14" height="9" rx="1" /><path d="M10 13v3" /><path d="M7 16.2h6" />',
  verify: '<path d="M10 2.6 16 5v4.4c0 4-2.7 6.3-6 8-3.3-1.7-6-4-6-8V5Z" /><path d="M7.4 9.9 9.3 11.8 12.9 8" />',
  glance:
    '<path d="M10 2.6v2.6" /><path d="M10 14.8v2.6" /><path d="M2.6 10h2.6" /><path d="M14.8 10h2.6" /><path d="m5 5 1.8 1.8" /><path d="m13.2 13.2 1.8 1.8" /><path d="m15 5-1.8 1.8" /><path d="m6.8 13.2-1.8 1.8" /><circle cx="10" cy="10" r="2.3" />',
  hierarchy:
    '<path d="M3 16.2h14" /><path d="M5 16.2v-3.6" /><path d="M9 16.2v-6.4" /><path d="M13 16.2v-4.8" /><path d="m3.4 9.6 3.6-3.6 3 3 5-5" />',
  check: '<path d="M4 10.5 8.2 14.7 16.5 5.8" />'
};

function iconSvgElement(
  id: string,
  iconKey: keyof typeof ICON_PATHS,
  color: string,
  x: number,
  y: number,
  size: number,
  readingOrder: number
): SlideElement {
  const path = ICON_PATHS[iconKey] ?? ICON_PATHS.glance;
  return {
    id,
    type: "svg",
    x,
    y,
    w: size,
    h: size,
    decorative: true,
    readingOrder,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`
  };
}

function atmosphereSvg(theme: Theme, base: string, glowA: string, glowB: string, idSuffix: string): string {
  const baseAlt = theme.isDark ? lightenToward(base, 0.12) : scaleToward(base, 0.965);
  const opacityA = theme.isDark ? 0.3 : 0.14;
  const opacityB = theme.isDark ? 0.24 : 0.1;
  const baseId = `atm-base-${idSuffix}`;
  const glowAId = `atm-a-${idSuffix}`;
  const glowBId = `atm-b-${idSuffix}`;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">',
    "<defs>",
    `<linearGradient id="${baseId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${base}" /><stop offset="1" stop-color="${baseAlt}" /></linearGradient>`,
    `<radialGradient id="${glowAId}" cx="0.82" cy="0.16" r="0.62"><stop offset="0" stop-color="${glowA}" stop-opacity="${opacityA}" /><stop offset="1" stop-color="${glowA}" stop-opacity="0" /></radialGradient>`,
    `<radialGradient id="${glowBId}" cx="0.12" cy="0.92" r="0.7"><stop offset="0" stop-color="${glowB}" stop-opacity="${opacityB}" /><stop offset="1" stop-color="${glowB}" stop-opacity="0" /></radialGradient>`,
    "</defs>",
    `<rect x="0" y="0" width="1280" height="720" fill="url(#${baseId})" />`,
    `<rect x="0" y="0" width="1280" height="720" fill="url(#${glowAId})" />`,
    `<rect x="0" y="0" width="1280" height="720" fill="url(#${glowBId})" />`,
    "</svg>"
  ].join("");
}

function backgroundElement(theme: Theme, id: string, base: string, glowA: string, glowB: string): SlideElement {
  return {
    id,
    type: "svg",
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    decorative: true,
    readingOrder: 0,
    svg: atmosphereSvg(theme, base, glowA, glowB, id)
  };
}

function cardFillOpacity(theme: Theme): number | undefined {
  return theme.isDark ? 0.68 : undefined;
}

function normalizeContentMode(value: unknown): ContentMode {
  if (value === undefined) {
    return "presentation";
  }

  if (value === "presentation" || value === "report" || value === "technical" || value === "handout" || value === "decision") {
    return value;
  }

  throw new Error("contentMode must be one of: presentation, report, technical, handout, decision.");
}

function heroSlide(theme: Theme, isJapanese: boolean, title: string, subtitle: string, audience: string): SlideElement[] {
  const background = backgroundElement(theme, "hero-bg", theme.background, theme.accent, theme.strongAccent);
  const accentBand = shapeElement("hero-band", "rect", 0, 0, 0.34, 7.5, 1, theme.accent, { color: theme.accent, width: 0.1 });
  const panel = shapeElement("hero-panel", "roundRect", 7.7, 1.0, 4.9, 5.3, 2, theme.surface, { color: theme.cardLine, width: 1 }, cardFillOpacity(theme));
  const panelAccent = shapeElement("hero-panel-accent", "roundRect", 8.1, 1.5, 1.6, 0.22, 3, theme.accent, { color: theme.accent, width: 0.1 });

  return [
    background,
    accentBand,
    panel,
    panelAccent,
    iconSvgElement("hero-panel-icon", "idea", theme.accentOnBackground, 11.5, 1.95, 0.6, 4),
    textElement("eyebrow", "caption", "PPTCREATER DECK", 0.8, 0.78, 6.2, 0.4, 5, 14, theme.accentOnBackground, theme.background, "left", "middle"),
    textElement("title", "title", title, 0.8, 1.35, 6.5, 2.3, 6, theme.tokens.typography.titleSize, theme.text, theme.background, "left", "top"),
    textElement("subtitle", "body", subtitle, 0.8, 3.95, 6.4, 1.4, 7, theme.tokens.typography.bodySize, theme.mutedText, theme.background, "left", "top"),
    textElement("audience", "caption", `${isJapanese ? "対象" : "Audience"}: ${audience}`, 0.8, 5.7, 6.4, 0.6, 8, theme.tokens.typography.captionSize, theme.mutedText, theme.background, "left", "middle"),
    textElement("panel-title", "callout", isJapanese ? "このデッキの読み方" : "How to read this deck", 8.1, 1.95, 3.2, 0.6, 9, 18, theme.text, theme.surface, "left", "middle"),
    textElement(
      "panel-body",
      "body",
      isJapanese
        ? "各スライドは1メッセージ。図やカードは編集可能なPowerPointオブジェクトです。"
        : "One message per slide. Cards and shapes are editable PowerPoint objects.",
      8.1,
      2.7,
      4.1,
      3.2,
      10,
      theme.tokens.typography.bodySize,
      theme.mutedText,
      theme.surface,
      "left",
      "top"
    )
  ];
}

function cardSlide(theme: Theme, isJapanese: boolean, title: string, cards: [string, string, keyof typeof ICON_PATHS][]): SlideElement[] {
  const elements: SlideElement[] = [
    backgroundElement(theme, "cards-bg", theme.background, theme.strongAccent, theme.accent),
    textElement("title", "title", title, 0.8, 0.7, 11.7, 1.0, 1, theme.tokens.typography.titleSize - 6, theme.text, theme.background, "left", "middle")
  ];

  const cardWidth = 3.7;
  const gap = 0.42;
  const startX = (13.333 - (cardWidth * cards.length + gap * (cards.length - 1))) / 2;
  const cardOpacity = cardFillOpacity(theme);

  cards.forEach(([heading, body, iconKey], index) => {
    const x = startX + index * (cardWidth + gap);
    const order = 2 + index * 6;
    elements.push(shapeElement(`card-${index}`, "roundRect", x, 2.1, cardWidth, 3.7, order, theme.surface, { color: theme.cardLine, width: 1 }, cardOpacity));
    elements.push(shapeElement(`card-accent-${index}`, "roundRect", x + 0.35, 2.5, 0.72, 0.72, order + 1, theme.strongAccent, { color: theme.strongAccent, width: 0.1 }));
    elements.push(iconSvgElement(`card-icon-${index}`, iconKey, theme.onAccent, x + 0.53, 2.68, 0.36, order + 2));
    elements.push(textElement(`card-heading-${index}`, "callout", heading, x + 0.4, 3.45, cardWidth - 0.8, 0.7, order + 3, 22, theme.text, theme.surface, "left", "top"));
    elements.push(textElement(`card-body-${index}`, "body", body, x + 0.4, 4.25, cardWidth - 0.8, 1.4, order + 4, theme.tokens.typography.bodySize - 4, theme.mutedText, theme.surface, "left", "top"));
  });

  return elements;
}

function stepSlide(theme: Theme, isJapanese: boolean, title: string, steps: [string, keyof typeof ICON_PATHS][], caption: string): SlideElement[] {
  const elements: SlideElement[] = [
    backgroundElement(theme, "steps-bg", theme.background, theme.accent, theme.strongAccent),
    textElement("title", "title", title, 0.8, 0.7, 11.7, 1.0, 1, theme.tokens.typography.titleSize - 6, theme.text, theme.background, "left", "middle"),
    shapeElement("track", "line", 1.2, 3.4, 11.0, 0, 2, "none", { color: theme.cardLine, width: 3 })
  ];

  const nodeWidth = 1.7;
  const gap = (11.0 - nodeWidth * steps.length) / Math.max(1, steps.length - 1);

  steps.forEach(([label, iconKey], index) => {
    const x = 1.2 + index * (nodeWidth + gap);
    const order = 3 + index * 4;
    const cx = x + nodeWidth / 2 - 0.45;
    elements.push(shapeElement(`node-${index}`, "ellipse", cx, 2.95, 0.9, 0.9, order, theme.strongAccent, { color: theme.strongAccent, width: 0.1 }));
    elements.push(iconSvgElement(`node-icon-${index}`, iconKey, theme.onAccent, cx + 0.27, 3.22, 0.36, order + 1));
    elements.push(textElement(`node-num-${index}`, "caption", `STEP ${index + 1}`, x, 4.0, nodeWidth, 0.4, order + 2, theme.tokens.typography.captionSize, theme.accentOnBackground, theme.background, "center", "top"));
    elements.push(textElement(`node-label-${index}`, "caption", label, x, 4.45, nodeWidth, 0.7, order + 3, theme.tokens.typography.captionSize + 2, theme.text, theme.background, "center", "top"));
  });

  elements.push(textElement("step-caption", "body", caption, 1.2, 5.7, 11.0, 1.0, 100, theme.tokens.typography.bodySize, theme.mutedText, theme.background, "left", "top"));
  return elements;
}

function closingSlide(theme: Theme, isJapanese: boolean, title: string, body: string): SlideElement[] {
  return [
    backgroundElement(theme, "closing-bg", theme.strongAccent, theme.accent, theme.strongAccent),
    shapeElement("closing-rule", "rect", 1.0, 4.25, 2.4, 0.07, 1, theme.onAccent, { color: theme.onAccent, width: 0.1 }),
    iconSvgElement("closing-icon", "check", theme.onAccent, 1.0, 1.5, 0.7, 2),
    textElement("title", "title", title, 1.0, 2.4, 11.3, 1.8, 3, theme.tokens.typography.titleSize, theme.onAccent, theme.strongAccent, "left", "top"),
    textElement("body", "body", body, 1.0, 4.6, 11.3, 1.6, 4, theme.tokens.typography.bodySize, theme.onAccent, theme.strongAccent, "left", "top")
  ];
}

export function createSampleDeck(locale: Locale, options: CreateSampleDeckOptions = {}): DeckSpec {
  const isJapanese = locale === "ja-JP";
  const purpose = options.purpose ?? (isJapanese ? "AIで資料作成の品質を標準化する" : "standardizing AI-assisted slide quality");
  const audience = options.audience ?? (isJapanese ? "意思決定者と実務担当者" : "decision makers and delivery teams");
  const contentMode = normalizeContentMode(options.contentMode);
  const recommendation = recommendTemplateForContentMode(contentMode);
  const styleProfile = options.styleProfile ?? recommendation.styleProfile;
  const templateId = options.styleProfile ? templateForStyleProfile(options.styleProfile) : recommendation.templateId;
  const baseTokens = getTemplate(templateId)?.tokens ?? styleProfileTokens(locale, styleProfile);
  const localeTypography = styleProfileTokens(locale, styleProfile).typography;
  const tokens: DesignTokens = {
    colors: baseTokens.colors,
    spacing: baseTokens.spacing,
    typography: {
      ...baseTokens.typography,
      headingFont: localeTypography.headingFont,
      bodyFont: localeTypography.bodyFont,
      fallbackFonts: localeTypography.fallbackFonts
    }
  };
  const theme = buildTheme(tokens);
  const targetSlideCount = Number.isInteger(options.slideCount) ? Math.max(1, Math.min(options.slideCount ?? 4, 4)) : 4;

  const deckTitle = isJapanese ? "デザイン品質を備えたAIスライド作成" : "AI slide creation with design quality";

  const modeGuidance = {
    presentation: isJapanese ? "発表向けに1スライド1メッセージで構成しています。" : "Optimized for live presentation with one message per slide.",
    report: isJapanese ? "報告資料向けに要点と根拠を整理した構成です。" : "Optimized for reports with structured key points and evidence.",
    technical: isJapanese ? "技術資料向けに構成図と概念を整理しています。" : "Optimized for technical material with architecture and concepts.",
    handout: isJapanese ? "配布資料向けに補足文脈をnotesへ残しています。" : "Optimized for handouts with context preserved in notes.",
    decision: isJapanese ? "意思決定向けに論点と次アクションを明確化しています。" : "Optimized for decisions with clear options and next actions."
  }[contentMode];

  const qualityCards: [string, string, keyof typeof ICON_PATHS][] = isJapanese
    ? [
        ["3秒で伝わる", "結論型タイトルで要点を即伝達", "glance"],
        ["視覚階層", "サイズ・余白・色で視線を設計", "hierarchy"],
        ["アクセシブル", "コントラスト・読み順・alt textを検証", "verify"]
      ]
    : [
        ["Glance", "Assertion titles communicate instantly", "glance"],
        ["Hierarchy", "Size, whitespace, and color guide the eye", "hierarchy"],
        ["Accessible", "Verify contrast, reading order, and alt text", "verify"]
      ];

  const steps: [string, keyof typeof ICON_PATHS][] = isJapanese
    ? [
        ["目的", "idea"],
        ["聴衆", "people"],
        ["構成", "structure"],
        ["可視化", "visual"],
        ["検証", "check"]
      ]
    : [
        ["Purpose", "idea"],
        ["Audience", "people"],
        ["Structure", "structure"],
        ["Visualize", "visual"],
        ["Verify", "check"]
      ];

  const slides = [
    (() => {
      const useJapaneseTopicTitles = isJapanese && (contentMode === "report" || contentMode === "technical" || contentMode === "handout");
      const title = useJapaneseTopicTitles
        ? "AIスライド品質標準"
        : isJapanese
          ? "3秒で要点が伝わるスライドを標準化する"
          : "Standardize slides that pass the three-second glance test";
      return {
        id: "slide-1",
        title,
        layout: "hero",
        speakerNotes: isJapanese
          ? `目的: ${purpose}。聴衆: ${audience}。${modeGuidance}`
          : `Purpose: ${purpose}. Audience: ${audience}. ${modeGuidance}`,
        elements: heroSlide(
          theme,
          isJapanese,
          title,
          isJapanese ? "用途・聴衆・ボリュームを先に固定し、編集可能な図形で表現します。" : "Brief purpose, audience, and volume first; express it with editable shapes.",
          audience
        )
      };
    })(),
    (() => {
      const useJapaneseTopicTitles = isJapanese && (contentMode === "report" || contentMode === "technical" || contentMode === "handout");
      const title = useJapaneseTopicTitles
        ? "ヒアリングから可視化までの流れ"
        : isJapanese
          ? "ヒアリングから可視化までを1つの流れにする"
          : "Turn briefing and visuals into one flow";
      return {
        id: "slide-2",
        title,
        layout: "steps",
        speakerNotes: isJapanese ? "目的と聴衆を確認し、構成・可視化・検証へ進めます。" : "Clarify purpose and audience, then structure, visualize, and verify.",
        elements: stepSlide(
          theme,
          isJapanese,
          title,
          steps,
          isJapanese ? "先に聞くほど、後のスライドは短く・強く・見やすくなります。" : "Better upfront briefing makes later slides shorter, stronger, and clearer."
        )
      };
    })(),
    (() => {
      const useJapaneseTopicTitles = isJapanese && (contentMode === "report" || contentMode === "technical" || contentMode === "handout");
      const title = useJapaneseTopicTitles
        ? "情報UIとしてのスライド設計"
        : isJapanese
          ? "スライドは装飾ではなく情報UIとして設計する"
          : "Design slides as information interfaces";
      return {
        id: "slide-3",
        title,
        layout: "cards",
        speakerNotes: isJapanese ? "カード・テキストは編集可能なPowerPointオブジェクトです。" : "Cards and text are editable PowerPoint objects.",
        elements: cardSlide(theme, isJapanese, title, qualityCards)
      };
    })(),
    {
      id: "slide-4",
      title: isJapanese ? "用途別スタイル選定" : "Choose the style for the purpose",
      layout: "closing",
      speakerNotes: isJapanese ? "presentation / report / technical で見た目が切り替わります。" : "presentation, report, and technical change the look automatically.",
      elements: closingSlide(
        theme,
        isJapanese,
        isJapanese ? "用途別スタイル選定" : "Choose the style for the purpose",
        isJapanese
          ? `現在のスタイル: ${styleProfile}。テンプレート: ${templateId}。`
          : `Style: ${styleProfile}; template: ${templateId}; lint and polish reduce layout risk.`
      )
    }
  ];

  return {
    version: "0.1",
    title: deckTitle,
    locale,
    template: templateId,
    skillPack: isJapanese ? "slide-briefing-ja" : "slide-briefing-en",
    tokens,
    metadata: {
      keywords: ["accessible", "powerpoint", "deck", "native-shape", "editable", styleProfile],
      contentMode,
      sources: []
    },
    slides: slides.slice(0, targetSlideCount)
  };
}

