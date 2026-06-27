import { defaultTokens } from "./color.js";
import { estimateTextOverflow, normalizeDeckLayout } from "./layout.js";
import type { ContentMode, DeckMessageMap, DeckSpec, DesignTokens, Locale, ShapeElement, Slide, SlideElement, SlideIntent, TextElement } from "./schema.js";
import { getTemplate, recommendTemplateForContentMode, styleProfileTokens, templateForStyleProfile, type StyleProfile } from "./templates.js";

const W = 13.333;
const H = 7.5;

export const MESSAGE_DECK_ARCHETYPES = [
  "statement",
  "flow",
  "contrast",
  "before-after",
  "table",
  "matrix",
  "hub-map",
  "steps"
] as const;

export type MessageDeckArchetype = (typeof MESSAGE_DECK_ARCHETYPES)[number];

export type CreateDeckFromMessageMapOptions = {
  title: string;
  locale?: Locale;
  template?: string;
  contentMode?: ContentMode;
  styleProfile?: StyleProfile;
  skillPack?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  sources?: DeckSpec["metadata"]["sources"];
  includeCover?: boolean;
  includeClosing?: boolean;
  tokens?: DesignTokens;
};

type Theme = {
  tokens: DesignTokens;
  background: string;
  surface: string;
  text: string;
  mutedText: string;
  accent: string;
  accentSoft: string;
  line: string;
  inkOnAccent: string;
};

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "").length === 3 ? hex.replace("#", "").replace(/(.)/g, "$1$1") : hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")}`;
}

function mix(hex: string, toward: string, ratio: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(toward);
  return rgbToHex([a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio, a[2] + (b[2] - a[2]) * ratio]);
}

function luminance(hex: string): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function readableOn(hex: string): string {
  return luminance(hex) < 0.45 ? "#ffffff" : "#111827";
}

function buildTheme(tokens: DesignTokens): Theme {
  return {
    tokens,
    background: tokens.colors.background,
    surface: tokens.colors.surface,
    text: tokens.colors.text,
    mutedText: tokens.colors.mutedText,
    accent: tokens.colors.accent,
    accentSoft: mix(tokens.colors.accent, tokens.colors.background, 0.86),
    line: mix(tokens.colors.mutedText, tokens.colors.background, 0.72),
    inkOnAccent: readableOn(tokens.colors.accent)
  };
}

function fontFloor(role: TextElement["role"]): number {
  if (role === "title") return 26;
  if (role === "subtitle" || role === "callout") return 18;
  if (role === "caption") return 12;
  return 18;
}

function fitText(role: TextElement["role"], value: string, w: number, h: number, preferred: number): number {
  let fontSize = Math.max(preferred, fontFloor(role));
  while (fontSize > fontFloor(role)) {
    const overflow = estimateTextOverflow({
      id: "fit",
      type: "text",
      role,
      text: value,
      x: 0,
      y: 0,
      w,
      h,
      fontSize,
      bold: false,
      decorative: false
    });
    if (!overflow.overflows) return fontSize;
    fontSize -= 1;
  }
  return fontSize;
}

function text(
  id: string,
  role: TextElement["role"],
  value: string,
  x: number,
  y: number,
  w: number,
  h: number,
  readingOrder: number,
  theme: Theme,
  options: {
    fontSize?: number;
    color?: string;
    bg?: string;
    bold?: boolean;
    align?: TextElement["align"];
    valign?: TextElement["valign"];
  } = {}
): TextElement {
  const fontSize = fitText(role, value, w, h, options.fontSize ?? (role === "title" ? 31 : role === "subtitle" ? 20 : role === "caption" ? 12 : 18));
  return {
    id,
    type: "text",
    role,
    text: value,
    x,
    y,
    w,
    h,
    readingOrder,
    decorative: false,
    fontSize,
    color: options.color ?? theme.text,
    contrastBackground: options.bg ?? theme.background,
    bold: options.bold ?? (role === "title" || role === "callout"),
    align: options.align,
    valign: options.valign
  };
}

function shape(
  id: string,
  shapeType: ShapeElement["shape"],
  x: number,
  y: number,
  w: number,
  h: number,
  readingOrder: number,
  fill: ShapeElement["fill"],
  lineColor: string,
  options: { width?: number; radius?: number; fillOpacity?: number; endArrow?: boolean } = {}
): ShapeElement {
  const altText =
    shapeType === "line" && (/connector/u.test(id) || /step-line/u.test(id) || /axis-[xy]-line/u.test(id))
      ? "generated native schematic connector"
      : ["roundRect", "roundedRect", "rect", "ellipse", "oval"].includes(shapeType)
        ? "generated native schematic shape"
        : undefined;
  return {
    id,
    type: "shape",
    shape: shapeType,
    x,
    y,
    w,
    h,
    readingOrder,
    decorative: true,
    altText,
    fill,
    fillOpacity: options.fillOpacity,
    radius: options.radius ?? 0.08,
    line: {
      color: lineColor,
      width: options.width ?? 0.9,
      endArrowType: options.endArrow ? "triangle" : undefined
    }
  };
}

function slideShell(theme: Theme, intent: SlideIntent, elements: SlideElement[], archetype: MessageDeckArchetype, index: number): Slide {
  const id = intent.slideId;
  const title = slideTopicTitle(intent);
  return {
    id,
    title,
    layout: `message-${archetype}`,
    background: { color: theme.background },
    speakerNotes: [
      `Message: ${intent.message}`,
      intent.evidence.length ? `Evidence: ${intent.evidence.join(" / ")}` : "",
      intent.quietInfo.length ? `Quiet info: ${intent.quietInfo.join(" / ")}` : ""
    ]
      .filter(Boolean)
      .join("\n"),
    elements: [
      shape(`${id}-canvas`, "rect", 0, 0, W, H, 0, theme.background, theme.background, { radius: 0 }),
      text(`${id}-eyebrow`, "caption", `SLIDE ${String(index + 1).padStart(2, "0")}`, 0.7, 0.38, 1.5, 0.25, 1, theme, {
        color: theme.accent,
        bg: theme.background,
        fontSize: 12,
        bold: true
      }),
      text(`${id}-title`, "title", title, 0.68, 0.72, 4.15, 0.72, 2, theme, { fontSize: 27 }),
      text(`${id}-message`, "subtitle", intent.message, 5.05, 0.68, 7.35, 0.92, 3, theme, { color: theme.text, fontSize: 20 }),
      ...elements
    ]
  };
}

function slideTopicTitle(intent: SlideIntent): string {
  const normalized = intent.title.trim();
  const replacements: Record<string, string> = {
    結論: "推奨方針",
    制度: "利用制度",
    候補: "候補整理",
    価格差: "費用比較",
    判断軸: "選択基準"
  };
  return replacements[normalized] ?? normalized;
}

function evidenceItems(intent: SlideIntent, min = 3): string[] {
  const values = [...intent.evidence, ...intent.quietInfo].map((item) => item.trim()).filter(Boolean);
  while (values.length < min) values.push(intent.emphasis ?? intent.message);
  return values.slice(0, Math.max(min, Math.min(values.length, 6)));
}

function statementVisual(theme: Theme, intent: SlideIntent, id: string): SlideElement[] {
  const items = evidenceItems(intent, 3).slice(0, 3);
  const elements: SlideElement[] = [
    shape(`${id}-statement-panel`, "roundRect", 0.82, 2.05, 5.55, 3.98, 10, theme.accentSoft, theme.line, { radius: 0.18 }),
    text(`${id}-statement-focus`, "callout", intent.emphasis ?? intent.message, 1.16, 2.55, 4.85, 0.72, 11, theme, {
      bg: theme.accentSoft,
      color: theme.accent,
      fontSize: 24
    }),
    text(`${id}-statement-body`, "body", intent.message, 1.16, 3.45, 4.85, 1.35, 12, theme, {
      bg: theme.accentSoft,
      color: theme.text,
      fontSize: 20
    })
  ];
  items.forEach((item, index) => {
    const y = 2.12 + index * 1.22;
    elements.push(shape(`${id}-evidence-chip-${index}`, "roundRect", 7.05, y, 4.95, 0.86, 20 + index * 2, theme.surface, theme.line, { radius: 0.18 }));
    elements.push(text(`${id}-evidence-text-${index}`, "body", item, 7.35, y + 0.18, 4.35, 0.38, 21 + index * 2, theme, { bg: theme.surface, fontSize: 18 }));
  });
  return elements;
}

function flowVisual(theme: Theme, intent: SlideIntent, id: string): SlideElement[] {
  const items = evidenceItems(intent, 4).slice(0, 4);
  const elements: SlideElement[] = [];
  const startX = 0.95;
  const nodeW = 2.35;
  const gap = 0.68;
  items.forEach((item, index) => {
    const x = startX + index * (nodeW + gap);
    const order = 10 + index * 5;
    elements.push(shape(`${id}-flow-node-${index}`, "roundRect", x, 3.0, nodeW, 1.2, order, index === 0 ? theme.accent : theme.surface, index === 0 ? theme.accent : theme.line, { radius: 0.2 }));
    elements.push(text(`${id}-flow-label-${index}`, "caption", `STEP ${index + 1}`, x + 0.2, 3.15, nodeW - 0.4, 0.22, order + 1, theme, {
      color: index === 0 ? theme.inkOnAccent : theme.accent,
      bg: index === 0 ? theme.accent : theme.surface,
      fontSize: 12,
      bold: true,
      align: "center"
    }));
    elements.push(text(`${id}-flow-text-${index}`, "body", item, x + 0.22, 3.45, nodeW - 0.44, 0.45, order + 2, theme, {
      color: index === 0 ? theme.inkOnAccent : theme.text,
      bg: index === 0 ? theme.accent : theme.surface,
      fontSize: 17,
      align: "center"
    }));
    if (index < items.length - 1) {
      elements.push(shape(`${id}-flow-connector-${index}`, "line", x + nodeW + 0.12, 3.6, gap - 0.24, 0, order + 3, "none", theme.accent, { width: 1.4, endArrow: true }));
    }
  });
  return elements;
}

function contrastVisual(theme: Theme, intent: SlideIntent, id: string, afterLabel = "補完"): SlideElement[] {
  const items = evidenceItems(intent, 4);
  const left = items.slice(0, 2);
  const right = items.slice(2, 4);
  return [
    shape(`${id}-left-panel`, "roundRect", 0.82, 2.0, 4.75, 3.92, 10, theme.surface, theme.line, { radius: 0.18 }),
    shape(`${id}-right-panel`, "roundRect", 7.75, 2.0, 4.75, 3.92, 20, theme.accentSoft, theme.line, { radius: 0.18 }),
    shape(`${id}-bridge`, "rightArrow", 5.95, 3.46, 1.32, 0.64, 30, theme.accent, theme.accent, { radius: 0.04 }),
    text(`${id}-left-title`, "callout", left[0] ?? "Before", 1.18, 2.42, 4.05, 0.42, 11, theme, { bg: theme.surface, fontSize: 21, color: theme.text }),
    text(`${id}-left-body`, "body", left[1] ?? intent.message, 1.18, 3.18, 4.05, 1.4, 12, theme, { bg: theme.surface, fontSize: 19, color: theme.mutedText }),
    text(`${id}-bridge-text`, "caption", afterLabel, 6.15, 3.63, 0.9, 0.22, 31, theme, { bg: theme.accent, color: theme.inkOnAccent, align: "center", fontSize: 12 }),
    text(`${id}-right-title`, "callout", right[0] ?? intent.emphasis ?? "After", 8.1, 2.42, 4.05, 0.42, 21, theme, { bg: theme.accentSoft, fontSize: 21, color: theme.accent }),
    text(`${id}-right-body`, "body", right[1] ?? intent.message, 8.1, 3.18, 4.05, 1.4, 22, theme, { bg: theme.accentSoft, fontSize: 19, color: theme.text })
  ];
}

function tableVisual(theme: Theme, intent: SlideIntent, id: string): SlideElement[] {
  const items = evidenceItems(intent, 4).slice(0, 5);
  const elements: SlideElement[] = [
    shape(`${id}-table-bg`, "roundRect", 0.82, 1.95, 11.65, 4.78, 10, theme.surface, theme.line, { radius: 0.16 }),
    shape(`${id}-table-head`, "rect", 0.82, 1.95, 11.65, 0.72, 11, theme.accent, theme.accent, { radius: 0 })
  ];
  elements.push(text(`${id}-table-head-text`, "callout", intent.emphasis ?? intent.title, 1.12, 2.12, 10.95, 0.28, 12, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 18 }));
  items.forEach((item, index) => {
    const y = 2.85 + index * 0.68;
    const fill = index % 2 === 0 ? mix(theme.surface, theme.background, 0.35) : theme.surface;
    elements.push(shape(`${id}-row-${index}`, "rect", 0.98, y, 11.3, 0.56, 20 + index * 3, fill, fill, { radius: 0 }));
    elements.push(text(`${id}-row-index-${index}`, "caption", String(index + 1).padStart(2, "0"), 1.2, y + 0.16, 0.5, 0.18, 21 + index * 3, theme, { bg: fill, color: theme.accent, fontSize: 12, bold: true }));
    elements.push(text(`${id}-row-text-${index}`, "body", item, 1.95, y + 0.08, 9.8, 0.3, 22 + index * 3, theme, { bg: fill, fontSize: 17 }));
  });
  return elements;
}

function matrixVisual(theme: Theme, intent: SlideIntent, id: string): SlideElement[] {
  const items = evidenceItems(intent, 4).slice(0, 4);
  const elements: SlideElement[] = [
    shape(`${id}-matrix-bg`, "roundRect", 1.0, 1.95, 7.2, 4.8, 10, theme.surface, theme.line, { radius: 0.18 }),
    shape(`${id}-axis-x-line`, "line", 1.55, 4.45, 5.95, 0, 11, "none", theme.line, { width: 1.2, endArrow: true }),
    shape(`${id}-axis-y-line`, "line", 4.55, 2.7, 0.001, 3.45, 12, "none", theme.line, { width: 1.2, endArrow: true }),
    text(`${id}-axis-x-label`, "caption", "柔軟性", 6.55, 4.66, 1.0, 0.2, 13, theme, { bg: theme.surface, color: theme.mutedText, fontSize: 12, align: "right" }),
    text(`${id}-axis-y-label`, "caption", "費用負担", 3.85, 2.32, 1.3, 0.2, 14, theme, { bg: theme.surface, color: theme.mutedText, fontSize: 12, align: "center" }),
    shape(`${id}-insight`, "roundRect", 8.55, 2.25, 3.55, 3.75, 50, theme.accentSoft, theme.line, { radius: 0.18 }),
    text(`${id}-insight-title`, "callout", intent.emphasis ?? "判断軸", 8.92, 2.7, 2.85, 0.42, 51, theme, { bg: theme.accentSoft, color: theme.accent, fontSize: 21 }),
    text(`${id}-insight-body`, "body", intent.message, 8.92, 3.42, 2.85, 1.45, 52, theme, { bg: theme.accentSoft, color: theme.text, fontSize: 18 })
  ];
  const points = [
    [2.25, 5.35],
    [3.65, 3.55],
    [5.65, 5.15],
    [6.55, 3.25]
  ] as const;
  items.forEach((item, index) => {
    const [x, y] = points[index];
    elements.push(shape(`${id}-point-${index}`, "ellipse", x, y, 0.32, 0.32, 20 + index * 3, theme.accent, theme.accent));
    elements.push(text(`${id}-point-label-${index}`, "caption", item, x + 0.42, y - 0.02, 1.85, 0.24, 21 + index * 3, theme, { bg: theme.surface, fontSize: 12, color: theme.text }));
  });
  return elements;
}

function hubMapVisual(theme: Theme, intent: SlideIntent, id: string): SlideElement[] {
  const items = evidenceItems(intent, 5).slice(0, 5);
  const hubX = 5.55;
  const hubY = 3.35;
  const nodes = [
    [1.1, 2.2],
    [8.85, 2.2],
    [1.3, 5.0],
    [8.9, 5.0],
    [5.1, 5.72]
  ] as const;
  const elements: SlideElement[] = [
    shape(`${id}-hub`, "ellipse", hubX, hubY, 1.7, 1.7, 10, theme.accent, theme.accent),
    text(`${id}-hub-text`, "callout", intent.emphasis ?? "中心", hubX + 0.2, hubY + 0.62, 1.3, 0.28, 11, theme, {
      bg: theme.accent,
      color: theme.inkOnAccent,
      fontSize: 17,
      align: "center"
    })
  ];
  items.forEach((item, index) => {
    const [x, y] = nodes[index];
    const lineX = x < hubX ? x + 2.38 : hubX + 1.7;
    const lineY = y + 0.42;
    const targetX = x < hubX ? hubX : x;
    const targetY = hubY + 0.85;
    elements.push(shape(`${id}-connector-${index}`, "line", Math.min(lineX, targetX), Math.min(lineY, targetY), Math.abs(targetX - lineX), Math.abs(targetY - lineY), 20 + index * 4, "none", theme.line, { width: 1.1 }));
    elements.push(shape(`${id}-node-${index}`, "roundRect", x, y, 2.38, 0.86, 21 + index * 4, theme.surface, theme.line, { radius: 0.18 }));
    elements.push(text(`${id}-node-text-${index}`, "body", item, x + 0.22, y + 0.18, 1.94, 0.3, 22 + index * 4, theme, { bg: theme.surface, fontSize: 16, align: "center" }));
  });
  return elements;
}

function stepsVisual(theme: Theme, intent: SlideIntent, id: string): SlideElement[] {
  const items = evidenceItems(intent, 5).slice(0, 6);
  const elements: SlideElement[] = [
    shape(`${id}-rail`, "roundRect", 0.88, 2.0, 3.45, 4.6, 10, theme.accent, theme.accent, { radius: 0.18 }),
    text(`${id}-rail-title`, "callout", intent.emphasis ?? "実行順", 1.18, 2.45, 2.85, 0.45, 11, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 22 }),
    text(`${id}-rail-body`, "body", intent.emphasis ?? intent.message, 1.18, 3.25, 2.85, 1.4, 12, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 18 })
  ];
  items.forEach((item, index) => {
    const y = 2.05 + index * 0.76;
    elements.push(shape(`${id}-step-dot-${index}`, "ellipse", 5.35, y + 0.08, 0.34, 0.34, 20 + index * 3, theme.accent, theme.accent));
    elements.push(shape(`${id}-step-line-${index}`, "line", 5.52, y + 0.45, 0.001, 0.32, 21 + index * 3, "none", theme.line, { width: 1 }));
    elements.push(text(`${id}-step-text-${index}`, "body", item, 5.98, y, 5.75, 0.36, 22 + index * 3, theme, { bg: theme.background, fontSize: 17 }));
  });
  return elements;
}

export function archetypeForIntent(intent: SlideIntent): MessageDeckArchetype {
  switch (intent.visualType) {
    case "flow":
      return "flow";
    case "step":
      return "steps";
    case "contrast":
      return "contrast";
    case "before-after":
      return "before-after";
    case "table":
      return "table";
    case "matrix":
      return "matrix";
    case "map":
    case "ponchi-e":
    case "native-diagram":
      return "hub-map";
    case "summary":
    case "cards":
    case "visual-scaffold":
    case "detail":
    case "image":
    case "cycle":
    case "section":
    default:
      return "statement";
  }
}

function visualForIntent(theme: Theme, intent: SlideIntent): [MessageDeckArchetype, SlideElement[]] {
  const id = intent.slideId;
  const archetype = archetypeForIntent(intent);
  switch (archetype) {
    case "flow":
      return [archetype, flowVisual(theme, intent, id)];
    case "contrast":
      return [archetype, contrastVisual(theme, intent, id, "比較")];
    case "before-after":
      return [archetype, contrastVisual(theme, intent, id, "補完")];
    case "table":
      return [archetype, tableVisual(theme, intent, id)];
    case "matrix":
      return [archetype, matrixVisual(theme, intent, id)];
    case "hub-map":
      return [archetype, hubMapVisual(theme, intent, id)];
    case "steps":
      return [archetype, stepsVisual(theme, intent, id)];
    case "statement":
    default:
      return [archetype, statementVisual(theme, intent, id)];
  }
}

function createCover(theme: Theme, title: string, messageMap: DeckMessageMap): Slide {
  return {
    id: "cover",
    title,
    layout: "cover",
    background: { color: theme.background },
    speakerNotes: [messageMap.objective, messageMap.audience, messageMap.desiredAction].filter(Boolean).join("\n"),
    elements: [
      shape("cover-bg", "rect", 0, 0, W, H, 0, theme.background, theme.background, { radius: 0 }),
      shape("cover-focus", "roundRect", 7.65, 0.9, 4.6, 5.65, 1, theme.accentSoft, theme.line, { radius: 0.24 }),
      shape("cover-orbit-1", "ellipse", 8.25, 1.55, 1.05, 1.05, 2, theme.surface, theme.line),
      shape("cover-orbit-2", "ellipse", 10.35, 2.65, 1.3, 1.3, 3, theme.accent, theme.accent),
      shape("cover-orbit-3", "ellipse", 8.95, 4.65, 1.0, 1.0, 4, theme.surface, theme.line),
      text("cover-kicker", "caption", "MESSAGE-FIRST DECK", 0.78, 1.08, 4.2, 0.28, 5, theme, { color: theme.accent, fontSize: 12, bold: true }),
      text("cover-title", "title", title, 0.76, 1.62, 6.4, 1.62, 6, theme, { fontSize: 34 }),
      text("cover-objective", "body", messageMap.objective ?? "目的を1つに絞り、各スライドを1メッセージで構成します。", 0.8, 3.66, 6.15, 0.86, 7, theme, {
        color: theme.mutedText,
        fontSize: 20
      }),
      text("cover-action", "callout", messageMap.desiredAction ?? "次の判断へ進む", 0.8, 5.48, 5.55, 0.54, 8, theme, { color: theme.accent, fontSize: 21 })
    ]
  };
}

function createClosing(theme: Theme, messageMap: DeckMessageMap): Slide {
  const action = messageMap.desiredAction ?? "次に確認する";
  const isJapanese = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(action);
  const title = isJapanese ? "実行確認" : "Action check";
  return {
    id: "closing",
    title,
    layout: "closing",
    background: { color: theme.accent },
    speakerNotes: action,
    elements: [
      shape("closing-bg", "rect", 0, 0, W, H, 0, theme.accent, theme.accent, { radius: 0 }),
      text("closing-kicker", "caption", "NEXT ACTION", 0.9, 1.45, 3.6, 0.3, 1, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 13, bold: true }),
      text("closing-title", "title", title, 0.88, 2.0, 10.8, 0.72, 2, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 34 }),
      text("closing-message", "subtitle", action, 0.9, 3.05, 10.6, 0.5, 3, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 21 }),
      shape("closing-rule", "rect", 0.92, 3.85, 2.4, 0.07, 4, theme.inkOnAccent, theme.inkOnAccent, { radius: 0 }),
      text("closing-body", "body", "この資料はMessage Mapから生成され、各スライドが1つの主張と根拠を持つように構成されています。", 0.9, 4.25, 9.5, 0.86, 5, theme, {
        bg: theme.accent,
        color: theme.inkOnAccent,
        fontSize: 20
      })
    ]
  };
}

function chooseTokens(locale: Locale, contentMode: ContentMode, options: CreateDeckFromMessageMapOptions): { templateId: string; tokens: DesignTokens; styleProfile: StyleProfile } {
  const recommendation = recommendTemplateForContentMode(contentMode);
  const styleProfile = options.styleProfile ?? recommendation.styleProfile;
  const templateId = options.template ?? (options.styleProfile ? templateForStyleProfile(options.styleProfile) : recommendation.templateId);
  const baseTokens = options.tokens ?? getTemplate(templateId)?.tokens ?? styleProfileTokens(locale, styleProfile);
  const localeTypography = styleProfileTokens(locale, styleProfile).typography;
  return {
    templateId,
    styleProfile,
    tokens: {
      colors: baseTokens.colors,
      spacing: baseTokens.spacing,
      typography: {
        ...baseTokens.typography,
        headingFont: localeTypography.headingFont,
        bodyFont: localeTypography.bodyFont,
        fallbackFonts: localeTypography.fallbackFonts
      }
    }
  };
}

export function createDeckFromMessageMap(messageMap: DeckMessageMap, options: CreateDeckFromMessageMapOptions): DeckSpec {
  if (messageMap.intents.length === 0) {
    throw new Error("messageMap.intents must contain at least one SlideIntent.");
  }

  const locale = options.locale ?? "ja-JP";
  const contentMode = options.contentMode ?? "report";
  const { templateId, tokens, styleProfile } = chooseTokens(locale, contentMode, options);
  const theme = buildTheme(tokens);
  const slides: Slide[] = [];
  if (options.includeCover !== false) {
    slides.push(createCover(theme, options.title, messageMap));
  }

  messageMap.intents.forEach((intent, index) => {
    const [archetype, elements] = visualForIntent(theme, intent);
    slides.push(slideShell(theme, intent, elements, archetype, index));
  });

  if (options.includeClosing !== false) {
    slides.push(createClosing(theme, messageMap));
  }

  const deck: DeckSpec = {
    version: "0.1",
    title: options.title,
    locale,
    template: templateId,
    skillPack: options.skillPack ?? (locale === "ja-JP" ? "slide-craft-ja" : "slide-craft-en"),
    tokens,
    metadata: {
      author: options.author,
      subject: options.subject ?? options.title,
      keywords: [...(options.keywords ?? []), "message-map", "generated", styleProfile],
      contentMode,
      messageMap,
      sources: options.sources ?? []
    },
    slides
  };

  return normalizeDeckLayout(deck);
}
