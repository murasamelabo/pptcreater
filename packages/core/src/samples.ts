import type { ContentMode, DeckSpec, DesignTokens, Locale, ShapeElement, SlideElement, TextElement } from "./schema.js";
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
    fontSize: Math.max(fontSize, minFontForRole(role)),
    color,
    contrastBackground,
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
  line: ShapeElement["line"]
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
    line,
    decorative: true,
    readingOrder
  };
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
  const accentBand = shapeElement("hero-band", "rect", 0, 0, 0.34, 7.5, 0, theme.accent, { color: theme.accent, width: 0.1 });
  const panel = shapeElement("hero-panel", "roundRect", 7.7, 1.0, 4.9, 5.3, 1, theme.surface, { color: theme.cardLine, width: 1 });
  const panelAccent = shapeElement("hero-panel-accent", "roundRect", 8.1, 1.5, 1.6, 0.22, 2, theme.accent, { color: theme.accent, width: 0.1 });

  return [
    accentBand,
    panel,
    panelAccent,
    textElement("eyebrow", "caption", isJapanese ? "PPTCREATER DECK" : "PPTCREATER DECK", 0.8, 0.78, 6.2, 0.4, 3, 14, theme.accentOnBackground, theme.background, "left", "middle"),
    textElement("title", "title", title, 0.8, 1.35, 6.5, 2.3, 4, theme.tokens.typography.titleSize, theme.text, theme.background, "left", "top"),
    textElement("subtitle", "body", subtitle, 0.8, 3.95, 6.4, 1.4, 5, theme.tokens.typography.bodySize, theme.mutedText, theme.background, "left", "top"),
    textElement("audience", "caption", `${isJapanese ? "対象" : "Audience"}: ${audience}`, 0.8, 5.7, 6.4, 0.6, 6, theme.tokens.typography.captionSize, theme.mutedText, theme.background, "left", "middle"),
    textElement("panel-title", "callout", isJapanese ? "このデッキの読み方" : "How to read this deck", 8.1, 1.95, 4.1, 0.6, 7, 18, theme.text, theme.surface, "left", "middle"),
    textElement(
      "panel-body",
      "body",
      isJapanese
        ? "各スライドは1メッセージ。図・カードは編集可能なPowerPointオブジェクトです。"
        : "One message per slide. Cards and shapes are editable PowerPoint objects.",
      8.1,
      2.7,
      4.1,
      3.2,
      8,
      theme.tokens.typography.bodySize,
      theme.mutedText,
      theme.surface,
      "left",
      "top"
    )
  ];
}

function cardSlide(theme: Theme, isJapanese: boolean, title: string, cards: [string, string][]): SlideElement[] {
  const elements: SlideElement[] = [
    textElement("title", "title", title, 0.8, 0.7, 11.7, 1.0, 0, theme.tokens.typography.titleSize - 6, theme.text, theme.background, "left", "middle")
  ];

  const cardWidth = 3.7;
  const gap = 0.42;
  const startX = (13.333 - (cardWidth * cards.length + gap * (cards.length - 1))) / 2;

  cards.forEach(([heading, body], index) => {
    const x = startX + index * (cardWidth + gap);
    const order = 1 + index * 6;
    elements.push(shapeElement(`card-${index}`, "roundRect", x, 2.1, cardWidth, 3.7, order, theme.surface, { color: theme.cardLine, width: 1 }));
    elements.push(shapeElement(`card-accent-${index}`, "roundRect", x + 0.35, 2.5, 0.6, 0.6, order + 1, theme.strongAccent, { color: theme.strongAccent, width: 0.1 }));
    elements.push(textElement(`card-num-${index}`, "callout", String(index + 1), x + 0.35, 2.6, 0.6, 0.4, order + 2, 20, theme.onAccent, theme.strongAccent, "center", "middle"));
    elements.push(textElement(`card-heading-${index}`, "callout", heading, x + 0.4, 3.35, cardWidth - 0.8, 0.7, order + 3, 22, theme.text, theme.surface, "left", "top"));
    elements.push(textElement(`card-body-${index}`, "body", body, x + 0.4, 4.15, cardWidth - 0.8, 1.4, order + 4, theme.tokens.typography.bodySize - 4, theme.mutedText, theme.surface, "left", "top"));
  });

  return elements;
}

function stepSlide(theme: Theme, isJapanese: boolean, title: string, steps: string[], caption: string): SlideElement[] {
  const elements: SlideElement[] = [
    textElement("title", "title", title, 0.8, 0.7, 11.7, 1.0, 0, theme.tokens.typography.titleSize - 6, theme.text, theme.background, "left", "middle"),
    shapeElement("track", "line", 1.2, 3.4, 11.0, 0, 1, "none", { color: theme.cardLine, width: 3 })
  ];

  const nodeWidth = 1.7;
  const gap = (11.0 - nodeWidth * steps.length) / Math.max(1, steps.length - 1);

  steps.forEach((label, index) => {
    const x = 1.2 + index * (nodeWidth + gap);
    const order = 2 + index * 3;
    elements.push(shapeElement(`node-${index}`, "ellipse", x + nodeWidth / 2 - 0.45, 2.95, 0.9, 0.9, order, theme.strongAccent, { color: theme.strongAccent, width: 0.1 }));
    elements.push(textElement(`node-num-${index}`, "callout", String(index + 1), x + nodeWidth / 2 - 0.45, 3.1, 0.9, 0.5, order + 1, 22, theme.onAccent, theme.strongAccent, "center", "middle"));
    elements.push(textElement(`node-label-${index}`, "caption", label, x, 4.1, nodeWidth, 0.7, order + 2, theme.tokens.typography.captionSize + 2, theme.text, theme.background, "center", "top"));
  });

  elements.push(textElement("step-caption", "body", caption, 1.2, 5.4, 11.0, 1.0, 100, theme.tokens.typography.bodySize, theme.mutedText, theme.background, "left", "top"));
  return elements;
}

function closingSlide(theme: Theme, isJapanese: boolean, title: string, body: string): SlideElement[] {
  return [
    shapeElement("closing-bg", "rect", 0, 0, 13.333, 7.5, 0, theme.strongAccent, { color: theme.strongAccent, width: 0.1 }),
    textElement("title", "title", title, 1.0, 2.3, 11.3, 2.0, 1, theme.tokens.typography.titleSize, theme.onAccent, theme.strongAccent, "left", "top"),
    textElement("body", "body", body, 1.0, 4.6, 11.3, 1.6, 2, theme.tokens.typography.bodySize, theme.onAccent, theme.strongAccent, "left", "top")
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

  const qualityCards: [string, string][] = isJapanese
    ? [
        [isJapanese ? "3秒で伝わる" : "Glance", "結論型タイトルで要点を即伝達"],
        ["視覚階層", "サイズ・余白・色で視線を設計"],
        ["アクセシブル", "コントラスト・読み順・alt textを検証"]
      ]
    : [
        ["Glance", "Assertion titles communicate instantly"],
        ["Hierarchy", "Size, whitespace, and color guide the eye"],
        ["Accessible", "Verify contrast, reading order, and alt text"]
      ];

  const steps = isJapanese ? ["目的", "聴衆", "構成", "可視化", "検証"] : ["Purpose", "Audience", "Structure", "Visualize", "Verify"];

  const slides = [
    {
      id: "slide-1",
      title: isJapanese ? "3秒で要点が伝わるスライドを標準化する" : "Standardize slides that pass the three-second glance test",
      layout: "hero",
      speakerNotes: isJapanese
        ? `目的: ${purpose}。聴衆: ${audience}。${modeGuidance}`
        : `Purpose: ${purpose}. Audience: ${audience}. ${modeGuidance}`,
      elements: heroSlide(
        theme,
        isJapanese,
        isJapanese ? "3秒で要点が伝わるスライドを標準化する" : "Standardize slides that pass the three-second glance test",
        isJapanese ? "用途・聴衆・ボリュームを先に固定し、編集可能な図形で表現します。" : "Brief purpose, audience, and volume first; express it with editable shapes.",
        audience
      )
    },
    {
      id: "slide-2",
      title: isJapanese ? "ヒアリングから可視化までを1つの流れにする" : "Turn briefing and visuals into one flow",
      layout: "steps",
      speakerNotes: isJapanese ? "目的と聴衆を確認し、構成・可視化・検証へ進めます。" : "Clarify purpose and audience, then structure, visualize, and verify.",
      elements: stepSlide(
        theme,
        isJapanese,
        isJapanese ? "ヒアリングから可視化までを1つの流れにする" : "Turn briefing and visuals into one flow",
        steps,
        isJapanese ? "先に聞くほど、後のスライドは短く・強く・見やすくなります。" : "Better upfront briefing makes later slides shorter, stronger, and clearer."
      )
    },
    {
      id: "slide-3",
      title: isJapanese ? "スライドは装飾ではなく情報UIとして設計する" : "Design slides as information interfaces",
      layout: "cards",
      speakerNotes: isJapanese ? "カード・テキストは編集可能なPowerPointオブジェクトです。" : "Cards and text are editable PowerPoint objects.",
      elements: cardSlide(theme, isJapanese, isJapanese ? "スライドは装飾ではなく情報UIとして設計する" : "Design slides as information interfaces", qualityCards)
    },
    {
      id: "slide-4",
      title: isJapanese ? "用途に合わせてスタイルを選ぶ" : "Choose the style for the purpose",
      layout: "closing",
      speakerNotes: isJapanese ? "presentation / report / technical で見た目が切り替わります。" : "presentation, report, and technical change the look automatically.",
      elements: closingSlide(
        theme,
        isJapanese,
        isJapanese ? "用途に合わせてスタイルを選ぶ" : "Choose the style for the purpose",
        isJapanese
          ? `現在のスタイル: ${styleProfile}。テンプレート: ${templateId}。lint と polish で被り・はみ出しを抑えます。`
          : `Current style: ${styleProfile}. Template: ${templateId}. Lint and polish reduce overlap and overflow.`
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
