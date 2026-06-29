import { defaultTokens } from "./color.js";
import { estimateTextOverflow, normalizeDeckLayout } from "./layout.js";
import type {
  ContentMode,
  DeckMessageMap,
  DeckSpec,
  DesignTokens,
  Locale,
  ShapeElement,
  Slide,
  SlideElement,
  SlideIntent,
  SlideVisualAsset,
  SvgElement,
  TextElement
} from "./schema.js";
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
  "image-message",
  "photo-hero",
  "focal-proof",
  "section-break",
  "concept",
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

type IconKey = "baby" | "calendar" | "check" | "clipboard" | "heart" | "home-care" | "hospital" | "map-pin" | "route" | "scale" | "spark" | "yen";

const ICON_PATHS: Record<IconKey, string> = {
  baby: '<circle cx="10" cy="8" r="3.2"/><path d="M5.2 15.8c.9-2.4 2.6-3.7 4.8-3.7s3.9 1.3 4.8 3.7"/><path d="M8.3 8.2h.1M11.6 8.2h.1"/><path d="M8.7 10.2c.8.5 1.8.5 2.6 0"/>',
  calendar: '<rect x="4" y="5.2" width="12" height="10.8" rx="1.8"/><path d="M7 3.8v3M13 3.8v3M4 8.4h12"/><path d="M7 11h2M11 11h2M7 13.5h2"/>',
  check: '<path d="M4.5 10.2 8.3 14 15.7 6.2"/>',
  clipboard: '<rect x="5" y="4.6" width="10" height="12" rx="1.6"/><rect x="7.5" y="3" width="5" height="3.2" rx="1"/><path d="M7.8 9.2h4.4M7.8 12h4.4"/>',
  heart: '<path d="M10 16.2S4.2 12.8 4.2 8.4A2.9 2.9 0 0 1 9.4 6.7L10 7.5l.6-.8a2.9 2.9 0 0 1 5.2 1.7c0 4.4-5.8 7.8-5.8 7.8Z"/>',
  "home-care": '<path d="M3.8 9.4 10 4.2l6.2 5.2"/><path d="M5.4 8.8v7h9.2v-7"/><path d="M10 11.2v3.6M8.2 13h3.6"/>',
  hospital: '<rect x="4" y="4.2" width="12" height="12" rx="1.5"/><path d="M10 7.2v6M7 10.2h6"/><path d="M7 16.2v-2.4h6v2.4"/>',
  "map-pin": '<path d="M14.2 8.2c0 3.3-4.2 8-4.2 8s-4.2-4.7-4.2-8a4.2 4.2 0 0 1 8.4 0Z"/><circle cx="10" cy="8.2" r="1.3"/>',
  route: '<path d="M5.2 15.2c3.8 0 1.4-10.4 5.2-10.4 3.4 0 1.7 7.2 4.4 7.2"/><circle cx="5.2" cy="15.2" r="1.3"/><circle cx="10.4" cy="4.8" r="1.3"/><circle cx="14.8" cy="12" r="1.3"/>',
  scale: '<path d="M10 4v12M6.2 16h7.6M5.2 6.6h9.6"/><path d="m5.4 6.8-2 4h4l-2-4ZM14.6 6.8l-2 4h4l-2-4Z"/>',
  spark: '<path d="M10 3.4 11.7 8l4.6 1.7-4.6 1.7L10 16l-1.7-4.6-4.6-1.7L8.3 8 10 3.4Z"/>',
  yen: '<path d="m6 4 4 6 4-6M7.2 10.4h5.6M7.2 13h5.6M10 10v5.4"/>'
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

function icon(
  id: string,
  key: IconKey,
  x: number,
  y: number,
  size: number,
  readingOrder: number,
  theme: Theme,
  options: { color?: string; decorative?: boolean; altText?: string; bg?: string } = {}
): SvgElement {
  const color = options.color ?? theme.accent;
  const bg = options.bg
    ? `<rect x="1.2" y="1.2" width="17.6" height="17.6" rx="5" fill="${options.bg}" stroke="${mix(color, theme.background, 0.55)}" stroke-width="0.7"/>`
    : "";
  return {
    id,
    type: "svg",
    x,
    y,
    w: size,
    h: size,
    readingOrder,
    decorative: options.decorative ?? false,
    altText: options.altText ?? key,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="${color}" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">${bg}${ICON_PATHS[key]}</svg>`
  };
}

function iconForEvidence(value: string, index: number): IconKey {
  if (/費|円|価格|自費|助成/u.test(value)) return "yen";
  if (/病院|医師|医療/u.test(value)) return "hospital";
  if (/助産|生活|家庭|預か|休息/u.test(value)) return "home-care";
  if (/申請|承認|確認/u.test(value)) return "clipboard";
  if (/予約|日|週|月|営業/u.test(value)) return "calendar";
  if (/場所|近さ|候補|施設/u.test(value)) return "map-pin";
  return (["check", "heart", "spark", "route"] as const)[index % 4];
}

function illustrationSvg(theme: Theme, intent: SlideIntent): string {
  const iconKey = iconForEvidence([intent.title, intent.message, intent.emphasis, ...intent.evidence].filter(Boolean).join(" "), 0);
  const path = ICON_PATHS[iconKey];
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 640" role="img">',
    `<rect width="960" height="640" rx="36" fill="${theme.accentSoft}"/>`,
    `<circle cx="230" cy="190" r="92" fill="${theme.surface}" stroke="${theme.line}" stroke-width="4"/>`,
    `<circle cx="730" cy="430" r="120" fill="${theme.accent}" opacity="0.16"/>`,
    `<rect x="270" y="300" width="420" height="180" rx="32" fill="${theme.surface}" stroke="${theme.line}" stroke-width="4"/>`,
    `<g transform="translate(430 250) scale(8)" fill="none" stroke="${theme.accent}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${path}</g>`,
    `<path d="M170 476 C260 384, 340 548, 460 454 S680 370, 790 468" fill="none" stroke="${theme.accent}" stroke-width="8" opacity="0.5"/>`,
    "</svg>"
  ].join("");
}

function svgIntrinsicSize(svg: string): { width: number; height: number } {
  const rootAttrs = svg.match(/<svg\b([^>]*)>/iu)?.[1] ?? "";
  const attr = (name: string): string | undefined => new RegExp(`(?:^|\\s)${name}=(["'])(.*?)\\1`, "iu").exec(rootAttrs)?.[2];
  const length = (value: string | undefined): number | undefined => {
    const parsed = Number(value?.trim().match(/^(\d+(?:\.\d+)?)(?:px)?$/iu)?.[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };
  const width = length(attr("width"));
  const height = length(attr("height"));
  if (width && height) {
    return { width, height };
  }

  const viewBox = rootAttrs.match(/\bviewBox=["']\s*[-+]?\d*\.?\d+\s+[-+]?\d*\.?\d+\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s*["']/iu);
  const viewBoxWidth = Number(viewBox?.[1]);
  const viewBoxHeight = Number(viewBox?.[2]);
  if (Number.isFinite(viewBoxWidth) && viewBoxWidth > 0 && Number.isFinite(viewBoxHeight) && viewBoxHeight > 0) {
    return { width: viewBoxWidth, height: viewBoxHeight };
  }

  return { width: 960, height: 540 };
}

function containFrame(
  frame: { x: number; y: number; w: number; h: number },
  size: { width: number; height: number }
): { x: number; y: number; w: number; h: number } {
  const frameRatio = frame.w / frame.h;
  const imageRatio = size.width / size.height;
  if (!Number.isFinite(frameRatio) || !Number.isFinite(imageRatio) || frameRatio <= 0 || imageRatio <= 0) {
    return frame;
  }

  if (imageRatio > frameRatio) {
    const h = frame.w / imageRatio;
    return { x: frame.x, y: frame.y + (frame.h - h) / 2, w: frame.w, h };
  }

  const w = frame.h * imageRatio;
  return { x: frame.x + (frame.w - w) / 2, y: frame.y, w, h: frame.h };
}

function hasJapanese(value: string): boolean {
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(value);
}

function compactLabel(value: string, maxLength: number): string {
  const normalized = value
    .replace(/^\s*(?:対象|観点|表現|口調|tone|profile)\s*[:：]\s*/iu, "")
    .replace(/adaptive\+|compact-copy\+|executive-summary\+|safe-contrast\+|expression-polish-\d+/giu, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return value.trim();
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  const clipped = Array.from(normalized).slice(0, Math.max(1, maxLength)).join("").trimEnd();
  const wordSafe = !hasJapanese(normalized) ? clipped.replace(/[A-Za-z0-9]+$/u, "").trimEnd() : clipped;
  return (wordSafe || clipped).replace(/[、,，・／/\s]+$/u, "").trimEnd();
}

function topicLabel(value: string): string {
  const normalized = value.replace(/^L\d+\s+/iu, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (/^対象\s*[:：]/u.test(normalized)) return "対象";
  if (/^観点\s*[:：]/u.test(normalized)) return "観点";
  if (/^表現\s*[:：]/u.test(normalized)) return "表現";
  if (/^口調\s*[:：]/u.test(normalized)) return "口調";
  if (/^executive summary$/iu.test(normalized)) {
    return "要約";
  }
  if (!hasJapanese(normalized)) {
    return compactLabel(normalized, 30);
  }

  const known = ["投資判断", "候補比較", "リスク整理", "ロードマップ", "承認", "比較", "次の行動"];
  const found = known.find((keyword) => normalized.includes(keyword));
  if (found) {
    return found;
  }

  const particles = ["の", "で", "に", "を", "と", "が", "は"];
  const particleIndex = particles.map((particle) => normalized.indexOf(particle)).filter((index) => index > 1).sort((a, b) => a - b)[0];
  const candidate = particleIndex ? normalized.slice(0, particleIndex) : normalized;
  return compactLabel(candidate, 14);
}

function titleLabel(value: string): string {
  const normalized = value.replace(/^L\d+\s+/iu, "").replace(/\s+/g, " ").trim();
  if (!hasJapanese(normalized)) {
    return compactLabel(normalized, 34);
  }

  const purposeMatch = normalized.match(/(.+?)(?:資料|スライド|デッキ)/u)?.[1];
  const candidate = purposeMatch ?? normalized;
  return compactLabel(candidate, 22);
}

function calloutLabel(value: string): string {
  return hasJapanese(value) ? compactLabel(value, 12) : compactLabel(value, 12);
}

function pointLabel(value: string): string {
  return hasJapanese(value) ? compactLabel(value, 10) : compactLabel(value, 10);
}

function visibleSentence(value: string): string {
  const text = value.trim();
  if (!text) return text;
  if (/^(対象|観点|表現|口調)\s*[:：]/u.test(text) || /、/.test(text) || text.length <= 14) {
    return text;
  }
  if (/[。.!?！？]$/u.test(text) || /(する|した|できる|ある|いる|なる|進める|示す|伝える|確認する|選ぶ)$/u.test(text)) {
    return text;
  }
  return hasJapanese(text) ? `${text}を確認する。` : `${text} matters.`;
}

function coverTitleText(value: string): string {
  if (!hasJapanese(value) || value.includes("\n")) {
    return value;
  }
    const breakPoints = ["するための", "するため", "に向けた", "のための", "ための"];
  for (const point of breakPoints) {
    const index = value.indexOf(point);
    if (index > 3) {
      return `${value.slice(0, index + point.length)}\n${value.slice(index + point.length)}`;
    }
  }
  return value;
}

function visualAssetElement(
  asset: SlideVisualAsset | undefined,
  theme: Theme,
  intent: SlideIntent,
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  readingOrder: number
): SlideElement {
  if (asset?.type === "image" && (asset.path || asset.dataUri)) {
    return {
      id,
      type: "image",
      x,
      y,
      w,
      h,
      readingOrder,
      decorative: false,
      altText: asset.altText,
      path: asset.path,
      dataUri: asset.dataUri,
      sourceId: asset.sourceId,
      citation: asset.citation,
      description: asset.caption
    };
  }

  const svg = asset?.svg ?? illustrationSvg(theme, intent);
  const frame = containFrame({ x, y, w, h }, svgIntrinsicSize(svg));
  return {
    id,
    type: "svg",
    x: frame.x,
    y: frame.y,
    w: frame.w,
    h: frame.h,
    readingOrder,
    decorative: false,
    altText: asset?.altText ?? `${intent.title} illustration`,
    sourceId: asset?.sourceId,
    citation: asset?.citation,
    title: asset?.caption ?? intent.title,
    description: asset?.caption ?? intent.message,
    svg
  };
}

function slideShell(theme: Theme, intent: SlideIntent, elements: SlideElement[], archetype: MessageDeckArchetype, index: number): Slide {
  const id = intent.slideId;
  const title = slideTopicTitle(intent);
  const layout = archetype === "image-message" ? "message-image" : `message-${archetype}`;
  return {
    id,
    title,
    layout,
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
      icon(`${id}-header-icon`, iconForEvidence(intent.emphasis ?? intent.title, index), 0.7, 0.86, 0.42, 4, theme, {
        color: theme.accent,
        decorative: true,
        bg: theme.accentSoft
      }),
      text(`${id}-eyebrow`, "caption", `SLIDE ${String(index + 1).padStart(2, "0")}`, 0.7, 0.38, 1.5, 0.25, 1, theme, {
        color: theme.accent,
        bg: theme.background,
        fontSize: 12,
        bold: true
      }),
      text(`${id}-title`, "title", title, 1.22, 0.72, 3.62, 0.58, 2, theme, { fontSize: 24 }),
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
  return replacements[normalized] ?? topicLabel(normalized);
}

function evidenceItems(intent: SlideIntent, min = 3): string[] {
  const values = intent.evidence.map((item) => compactLabel(item, 18)).filter(Boolean);
  while (values.length < min) values.push(intent.emphasis ?? intent.message);
  return values.slice(0, Math.max(min, Math.min(values.length, 6)));
}

function statementVisual(theme: Theme, intent: SlideIntent, id: string): SlideElement[] {
  const items = evidenceItems(intent, 3).slice(0, 3);
  const elements: SlideElement[] = [
    shape(`${id}-statement-panel`, "roundRect", 0.82, 2.05, 5.55, 3.98, 10, theme.accentSoft, theme.line, { radius: 0.18 }),
    icon(`${id}-statement-icon`, iconForEvidence(intent.emphasis ?? intent.message, 0), 1.16, 2.48, 0.54, 10, theme, { color: theme.accent, decorative: true }),
    text(`${id}-statement-focus`, "callout", calloutLabel(topicLabel(intent.emphasis ?? intent.message)), 1.88, 2.55, 4.13, 0.72, 11, theme, {
      bg: theme.accentSoft,
      color: theme.accent,
      fontSize: 24
    }),
    text(`${id}-statement-body`, "body", visibleSentence(intent.message), 1.16, 3.45, 4.85, 1.35, 12, theme, {
      bg: theme.accentSoft,
      color: theme.text,
      fontSize: 20
    })
  ];
  items.forEach((item, index) => {
    const y = 2.12 + index * 1.22;
    elements.push(shape(`${id}-evidence-chip-${index}`, "roundRect", 7.05, y, 4.95, 0.86, 20 + index * 2, theme.surface, theme.line, { radius: 0.18 }));
    elements.push(icon(`${id}-evidence-icon-${index}`, iconForEvidence(item, index), 7.28, y + 0.2, 0.34, 21 + index * 3, theme, { color: theme.accent, decorative: true }));
    elements.push(text(`${id}-evidence-text-${index}`, "body", item, 7.78, y + 0.18, 3.92, 0.38, 22 + index * 3, theme, { bg: theme.surface, fontSize: 18 }));
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
    elements.push(shape(`${id}-flow-node-${index}`, "roundRect", x, 2.9, nodeW, 1.42, order, index === 0 ? theme.accent : theme.surface, index === 0 ? theme.accent : theme.line, { radius: 0.2 }));
    elements.push(icon(`${id}-flow-icon-${index}`, iconForEvidence(item, index), x + nodeW / 2 - 0.17, 3.05, 0.34, order + 1, theme, {
      color: index === 0 ? theme.inkOnAccent : theme.accent,
      decorative: true
    }));
    elements.push(text(`${id}-flow-label-${index}`, "caption", `STEP ${index + 1}`, x + 0.2, 3.46, nodeW - 0.4, 0.2, order + 2, theme, {
      color: index === 0 ? theme.inkOnAccent : theme.accent,
      bg: index === 0 ? theme.accent : theme.surface,
      fontSize: 12,
      bold: true,
      align: "center"
    }));
    elements.push(text(`${id}-flow-text-${index}`, "body", visibleSentence(item), x + 0.22, 3.75, nodeW - 0.44, 0.34, order + 3, theme, {
      color: index === 0 ? theme.inkOnAccent : theme.text,
      bg: index === 0 ? theme.accent : theme.surface,
      fontSize: 17,
      align: "center"
    }));
    if (index < items.length - 1) {
      elements.push(shape(`${id}-flow-connector-${index}`, "line", x + nodeW + 0.12, 3.62, gap - 0.24, 0, order + 4, "none", theme.accent, { width: 1.4, endArrow: true }));
    }
  });
  return elements;
}

function contrastVisual(theme: Theme, intent: SlideIntent, id: string, afterLabel = "補完"): SlideElement[] {
  const items = evidenceItems(intent, 4);
  const left = items.slice(0, 2);
  const right = items.slice(2, 4);
  const isJapanese = hasJapanese([intent.title, intent.message, intent.emphasis, ...intent.evidence].filter(Boolean).join(" "));
  const leftTitle = afterLabel === "比較" ? (isJapanese ? "比較A" : "Option A") : isJapanese ? "現状" : "Before";
  const rightTitle = afterLabel === "比較" ? (isJapanese ? "比較B" : "Option B") : isJapanese ? afterLabel : "After";
  return [
    shape(`${id}-left-panel`, "roundRect", 0.82, 2.0, 4.75, 3.92, 10, theme.surface, theme.line, { radius: 0.18 }),
    shape(`${id}-right-panel`, "roundRect", 7.75, 2.0, 4.75, 3.92, 20, theme.accentSoft, theme.line, { radius: 0.18 }),
    shape(`${id}-bridge`, "rightArrow", 5.95, 3.46, 1.32, 0.64, 30, theme.accent, theme.accent, { radius: 0.04 }),
    icon(`${id}-left-icon`, iconForEvidence(left[0] ?? "left", 0), 1.18, 2.14, 0.46, 10, theme, { color: theme.accent, decorative: true }),
    icon(`${id}-right-icon`, iconForEvidence(right[0] ?? "right", 1), 8.1, 2.14, 0.46, 20, theme, { color: theme.accent, decorative: true }),
    text(`${id}-left-title`, "callout", leftTitle, 1.78, 2.42, 3.45, 0.42, 11, theme, { bg: theme.surface, fontSize: 21, color: theme.text }),
    text(`${id}-left-body`, "body", visibleSentence(left[1] ?? intent.message), 1.18, 3.18, 4.05, 1.4, 12, theme, { bg: theme.surface, fontSize: 19, color: theme.mutedText }),
    text(`${id}-bridge-text`, "caption", afterLabel, 6.15, 3.63, 0.9, 0.22, 31, theme, { bg: theme.accent, color: theme.inkOnAccent, align: "center", fontSize: 12 }),
    text(`${id}-right-title`, "callout", rightTitle, 8.7, 2.42, 3.45, 0.42, 21, theme, { bg: theme.accentSoft, fontSize: 21, color: theme.accent }),
    text(`${id}-right-body`, "body", visibleSentence(right[1] ?? intent.message), 8.1, 3.18, 4.05, 1.4, 22, theme, { bg: theme.accentSoft, fontSize: 19, color: theme.text })
  ];
}

function imageMessageVisual(theme: Theme, intent: SlideIntent, id: string): SlideElement[] {
  const placement = intent.visualAsset?.placement ?? "left";
  const imageFrame = placement === "right" ? { x: 7.05, y: 1.92, w: 5.35, h: 4.82 } : { x: 0.86, y: 1.92, w: 5.35, h: 4.82 };
  const copyFrame = placement === "right" ? { x: 0.92, y: 2.08, w: 5.55, h: 4.35 } : { x: 6.65, y: 2.08, w: 5.55, h: 4.35 };
  const items = evidenceItems(intent, 3).slice(0, 4);
  const elements: SlideElement[] = [
    shape(`${id}-image-backdrop`, "roundRect", imageFrame.x, imageFrame.y, imageFrame.w, imageFrame.h, 10, theme.accentSoft, theme.line, { radius: 0.22 }),
    visualAssetElement(intent.visualAsset, theme, intent, `${id}-visual-asset`, imageFrame.x + 0.22, imageFrame.y + 0.22, imageFrame.w - 0.44, imageFrame.h - 0.72, 11),
    shape(`${id}-copy-panel`, "roundRect", copyFrame.x, copyFrame.y, copyFrame.w, copyFrame.h, 20, theme.surface, theme.line, { radius: 0.2 }),
    icon(`${id}-copy-icon`, iconForEvidence(intent.emphasis ?? intent.message, 0), copyFrame.x + 0.38, copyFrame.y + 0.36, 0.52, 21, theme, {
      color: theme.accent,
      decorative: true
    }),
    text(`${id}-copy-heading`, "callout", calloutLabel(topicLabel(intent.emphasis ?? intent.title)), copyFrame.x + 1.08, copyFrame.y + 0.43, copyFrame.w - 1.55, 0.38, 22, theme, {
      bg: theme.surface,
      color: theme.accent,
      fontSize: 22
    }),
    text(`${id}-copy-message`, "body", visibleSentence(intent.message), copyFrame.x + 0.42, copyFrame.y + 1.12, copyFrame.w - 0.84, 0.8, 23, theme, {
      bg: theme.surface,
      color: theme.text,
      fontSize: 19
    })
  ];
  if (intent.visualAsset?.caption) {
    elements.push(
      text(`${id}-image-caption`, "caption", intent.visualAsset.caption, imageFrame.x + 0.36, imageFrame.y + imageFrame.h - 0.38, imageFrame.w - 0.72, 0.18, 12, theme, {
        bg: theme.accentSoft,
        color: theme.mutedText,
        fontSize: 12
      })
    );
  }
  items.forEach((item, index) => {
    const y = copyFrame.y + 2.2 + index * 0.52;
    elements.push(icon(`${id}-copy-item-icon-${index}`, iconForEvidence(item, index), copyFrame.x + 0.5, y + 0.02, 0.24, 30 + index * 3, theme, { color: theme.accent, decorative: true }));
    elements.push(text(`${id}-copy-item-${index}`, "caption", item, copyFrame.x + 0.88, y, copyFrame.w - 1.25, 0.24, 31 + index * 3, theme, { bg: theme.surface, fontSize: 13, color: theme.text }));
  });
  return elements;
}

function photoHeroVisual(theme: Theme, intent: SlideIntent, id: string): SlideElement[] {
  const visualAsset = intent.visualAsset ?? { type: "svg" as const, svg: illustrationSvg(theme, intent), altText: `${intent.title} scene`, placement: "right" as const };
  return [
    shape(`${id}-photo-bg`, "rect", 0.72, 1.72, 11.9, 5.3, 10, theme.accentSoft, theme.line, { radius: 0.2 }),
    visualAssetElement(visualAsset, theme, intent, `${id}-photo`, 0.92, 1.92, 6.35, 4.85, 11),
    shape(`${id}-caption-panel`, "roundRect", 7.55, 2.18, 4.58, 3.95, 20, theme.surface, theme.line, { radius: 0.22 }),
    text(`${id}-caption-kicker`, "caption", "SCENE", 7.95, 2.52, 1.4, 0.22, 21, theme, { bg: theme.surface, color: theme.accent, bold: true, fontSize: 12 }),
    text(`${id}-caption-title`, "callout", topicLabel(intent.emphasis ?? intent.title), 7.95, 2.92, 3.72, 0.46, 22, theme, { bg: theme.surface, color: theme.text, fontSize: 25 }),
    text(`${id}-caption-message`, "body", intent.message, 7.95, 3.68, 3.74, 1.08, 23, theme, { bg: theme.surface, color: theme.text, fontSize: 18 }),
    text(`${id}-caption-proof`, "caption", evidenceItems(intent, 1)[0] ?? intent.title, 7.95, 5.18, 3.6, 0.34, 24, theme, { bg: theme.surface, color: theme.mutedText, fontSize: 13 })
  ];
}

function focalProofVisual(theme: Theme, intent: SlideIntent, id: string): SlideElement[] {
  const proof = evidenceItems(intent, 1).find((item) => /\d|%|倍|億|万|円|pt|ポイント|減|増/u.test(item)) ?? intent.emphasis ?? intent.title;
  return [
    shape(`${id}-proof-band`, "roundRect", 0.82, 1.92, 4.95, 4.9, 10, theme.accent, theme.accent, { radius: 0.22 }),
    text(`${id}-proof-number`, "title", proof, 1.22, 2.5, 4.18, 1.1, 11, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 48, bold: true, align: "center" }),
    text(`${id}-proof-label`, "caption", "FOCAL PROOF", 1.5, 4.0, 3.65, 0.22, 12, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 12, bold: true, align: "center" }),
    shape(`${id}-message-panel`, "roundRect", 6.2, 2.0, 5.95, 4.7, 20, theme.surface, theme.line, { radius: 0.2 }),
    text(`${id}-message-title`, "callout", topicLabel(intent.title), 6.62, 2.45, 4.95, 0.45, 21, theme, { bg: theme.surface, color: theme.accent, fontSize: 23 }),
    text(`${id}-message-body`, "body", intent.message, 6.62, 3.18, 4.95, 1.12, 22, theme, { bg: theme.surface, color: theme.text, fontSize: 19 }),
    text(`${id}-message-evidence`, "body", evidenceItems(intent, 2).slice(0, 2).join(" / "), 6.62, 4.75, 4.95, 0.72, 23, theme, { bg: theme.surface, color: theme.mutedText, fontSize: 16 })
  ];
}

function sectionBreakVisual(theme: Theme, intent: SlideIntent, id: string): SlideElement[] {
  return [
    shape(`${id}-section-bg`, "rect", 0, 1.65, W, 4.45, 10, theme.accent, theme.accent, { radius: 0 }),
    text(`${id}-section-label`, "caption", "SECTION", 1.02, 2.12, 2.0, 0.28, 11, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 13, bold: true }),
    text(`${id}-section-title`, "title", topicLabel(intent.title), 1.0, 2.72, 9.8, 0.84, 12, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 38 }),
    text(`${id}-section-message`, "subtitle", intent.message, 1.04, 4.08, 9.5, 0.62, 13, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 22 }),
    shape(`${id}-section-rule`, "rect", 1.04, 5.05, 2.4, 0.07, 14, theme.inkOnAccent, theme.inkOnAccent, { radius: 0 })
  ];
}

function conceptVisual(theme: Theme, intent: SlideIntent, id: string): SlideElement[] {
  const items = evidenceItems(intent, 4).slice(0, 4);
  const cx = 6.55;
  const cy = 4.05;
  const positions = [
    [2.3, 2.35],
    [9.25, 2.35],
    [9.25, 5.28],
    [2.3, 5.28]
  ] as const;
  const elements: SlideElement[] = [
    shape(`${id}-concept-center`, "ellipse", cx - 0.88, cy - 0.88, 1.76, 1.76, 10, theme.accent, theme.accent),
    text(`${id}-concept-center-text`, "caption", topicLabel(intent.emphasis ?? intent.title), cx - 0.68, cy - 0.13, 1.36, 0.28, 11, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 13, bold: true, align: "center" })
  ];
  items.forEach((item, index) => {
    const [x, y] = positions[index];
    const order = 20 + index * 5;
    elements.push(shape(`${id}-concept-node-${index}`, "roundRect", x, y, 2.25, 0.84, order, index % 2 === 0 ? theme.surface : theme.accentSoft, theme.line, { radius: 0.18 }));
    elements.push(text(`${id}-concept-label-${index}`, "body", item, x + 0.18, y + 0.2, 1.88, 0.28, order + 1, theme, { bg: index % 2 === 0 ? theme.surface : theme.accentSoft, color: theme.text, fontSize: 15, align: "center" }));
    elements.push(shape(`${id}-concept-link-${index}`, "line", Math.min(cx, x + 1.12), Math.min(cy, y + 0.42), Math.abs(cx - (x + 1.12)), Math.abs(cy - (y + 0.42)), order + 2, "none", theme.accent, { width: 1.1, endArrow: true }));
  });
  return elements;
}

function tableVisual(theme: Theme, intent: SlideIntent, id: string): SlideElement[] {
  const items = evidenceItems(intent, 4).slice(0, 5);
  const elements: SlideElement[] = [
    shape(`${id}-table-bg`, "roundRect", 0.82, 1.95, 11.65, 4.78, 10, theme.surface, theme.line, { radius: 0.16 }),
    shape(`${id}-table-head`, "rect", 0.82, 1.95, 11.65, 0.72, 11, theme.accent, theme.accent, { radius: 0 })
  ];
  elements.push(icon(`${id}-table-icon`, iconForEvidence(intent.emphasis ?? intent.title, 0), 1.05, 2.09, 0.34, 12, theme, { color: theme.inkOnAccent, decorative: true }));
  elements.push(text(`${id}-table-head-text`, "callout", calloutLabel(topicLabel(intent.emphasis ?? intent.title)), 1.55, 2.12, 10.5, 0.28, 13, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 18 }));
  items.forEach((item, index) => {
    const y = 2.85 + index * 0.68;
    const fill = index % 2 === 0 ? mix(theme.surface, theme.background, 0.35) : theme.surface;
    elements.push(shape(`${id}-row-${index}`, "rect", 0.98, y, 11.3, 0.56, 20 + index * 3, fill, fill, { radius: 0 }));
    elements.push(icon(`${id}-row-icon-${index}`, iconForEvidence(item, index), 1.2, y + 0.12, 0.28, 21 + index * 4, theme, { color: theme.accent, decorative: true }));
    elements.push(text(`${id}-row-index-${index}`, "caption", String(index + 1).padStart(2, "0"), 1.58, y + 0.16, 0.5, 0.18, 22 + index * 4, theme, { bg: fill, color: theme.accent, fontSize: 12, bold: true }));
    elements.push(text(`${id}-row-text-${index}`, "body", item, 2.28, y + 0.08, 9.45, 0.3, 23 + index * 4, theme, { bg: fill, fontSize: 17 }));
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
    shape(`${id}-insight`, "roundRect", 8.42, 2.18, 3.82, 3.95, 50, theme.accentSoft, theme.line, { radius: 0.18 }),
    icon(`${id}-insight-icon`, "scale", 8.92, 2.42, 0.42, 50, theme, { color: theme.accent, decorative: true }),
    text(`${id}-insight-title`, "callout", calloutLabel(topicLabel(intent.emphasis ?? "判断軸")), 9.48, 2.5, 2.42, 0.32, 51, theme, { bg: theme.accentSoft, color: theme.accent, fontSize: 21 }),
    text(`${id}-insight-body`, "body", visibleSentence(intent.message), 8.78, 3.24, 3.14, 2.0, 52, theme, { bg: theme.accentSoft, color: theme.text, fontSize: 16 })
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
    elements.push(text(`${id}-point-label-${index}`, "caption", visibleSentence(pointLabel(item)), x + 0.42, y - 0.08, 1.92, 0.38, 21 + index * 3, theme, { bg: theme.surface, fontSize: 12, color: theme.text }));
  });
  return elements;
}

type HubPanel = {
  title: string;
  iconKey: IconKey;
  items: string[];
};

function hubPanelModel(intent: SlideIntent, locale: Locale): [HubPanel, HubPanel] {
  const items = evidenceItems(intent, 5).slice(0, 5);
  const clueText = [intent.title, intent.message, intent.emphasis, ...intent.evidence, ...intent.quietInfo].filter(Boolean).join(" ");
  const healthcareFacilitySplit = /病院型|助産院型|助産|midwife|hospital/i.test(clueText);
  const leftItems = items.slice(0, Math.ceil(items.length / 2));
  const rightItems = items.slice(Math.ceil(items.length / 2));

  if (healthcareFacilitySplit) {
    return [
      {
        title: locale === "ja-JP" ? "病院型" : "Hospital type",
        iconKey: "hospital",
        items: leftItems
      },
      {
        title: locale === "ja-JP" ? "助産院型" : "Midwife / home-care type",
        iconKey: "home-care",
        items: rightItems
      }
    ];
  }

  return [
    {
      title: locale === "ja-JP" ? "候補群A" : "Option group A",
      iconKey: iconForEvidence(leftItems.join(" "), 0),
      items: leftItems
    },
    {
      title: locale === "ja-JP" ? "候補群B" : "Option group B",
      iconKey: iconForEvidence(rightItems.join(" "), 1),
      items: rightItems
    }
  ];
}

function hubMapVisual(theme: Theme, intent: SlideIntent, id: string, locale: Locale): SlideElement[] {
  const [leftPanel, rightPanel] = hubPanelModel(intent, locale);
  const elements: SlideElement[] = [
    shape(`${id}-left-panel`, "roundRect", 0.95, 2.0, 5.15, 4.75, 10, theme.surface, theme.line, { radius: 0.2 }),
    shape(`${id}-right-panel`, "roundRect", 7.22, 2.0, 5.15, 4.75, 30, theme.accentSoft, theme.line, { radius: 0.2 }),
    shape(`${id}-relation-band`, "roundRect", 5.72, 3.62, 1.9, 0.62, 50, theme.accent, theme.accent, { radius: 0.2 }),
    icon(`${id}-left-icon`, leftPanel.iconKey, 1.32, 2.34, 0.58, 11, theme, { color: theme.accent, decorative: true }),
    icon(`${id}-right-icon`, rightPanel.iconKey, 7.6, 2.34, 0.58, 31, theme, { color: theme.accent, decorative: true }),
    text(`${id}-left-title`, "callout", leftPanel.title, 2.08, 2.42, 3.3, 0.34, 12, theme, { bg: theme.surface, color: theme.text, fontSize: 22 }),
    text(`${id}-right-title`, "callout", rightPanel.title, 8.36, 2.42, 3.3, 0.34, 32, theme, { bg: theme.accentSoft, color: theme.text, fontSize: 22 }),
    text(`${id}-relation`, "caption", compactLabel(intent.emphasis ?? "施設タイプ", 14), 5.78, 3.83, 1.78, 0.18, 51, theme, {
      bg: theme.accent,
      color: theme.inkOnAccent,
      align: "center",
      fontSize: 12,
      bold: true
    })
  ];
  leftPanel.items.forEach((item, index) => {
    const y = 3.18 + index * 0.82;
    elements.push(shape(`${id}-left-chip-${index}`, "roundRect", 1.32, y, 4.28, 0.58, 20 + index * 3, mix(theme.surface, theme.background, 0.25), theme.line, { radius: 0.16 }));
    elements.push(icon(`${id}-left-chip-icon-${index}`, iconForEvidence(item, index), 1.52, y + 0.14, 0.28, 21 + index * 3, theme, { color: theme.accent, decorative: true }));
    elements.push(text(`${id}-left-chip-text-${index}`, "body", visibleSentence(item), 1.98, y + 0.1, 3.22, 0.22, 22 + index * 3, theme, { bg: theme.surface, fontSize: 15, align: "left" }));
  });
  rightPanel.items.forEach((item, index) => {
    const y = 3.18 + index * 0.82;
    elements.push(shape(`${id}-right-chip-${index}`, "roundRect", 7.6, y, 4.28, 0.58, 40 + index * 3, theme.surface, theme.line, { radius: 0.16 }));
    elements.push(icon(`${id}-right-chip-icon-${index}`, iconForEvidence(item, index + 3), 7.8, y + 0.14, 0.28, 41 + index * 3, theme, { color: theme.accent, decorative: true }));
    elements.push(text(`${id}-right-chip-text-${index}`, "body", visibleSentence(item), 8.26, y + 0.1, 3.22, 0.22, 42 + index * 3, theme, { bg: theme.surface, fontSize: 15, align: "left" }));
  });
  return elements;
}

function stepsVisual(theme: Theme, intent: SlideIntent, id: string): SlideElement[] {
  const items = evidenceItems(intent, 5).slice(0, 6);
  const elements: SlideElement[] = [
    shape(`${id}-rail`, "roundRect", 0.88, 2.0, 3.45, 4.6, 10, theme.accent, theme.accent, { radius: 0.18 }),
    icon(`${id}-rail-icon`, "clipboard", 1.18, 2.18, 0.52, 10, theme, { color: theme.inkOnAccent, decorative: true }),
    text(`${id}-rail-title`, "callout", calloutLabel(topicLabel(intent.emphasis ?? "実行順")), 1.86, 2.45, 2.05, 0.45, 11, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 22 }),
    text(`${id}-rail-body`, "body", calloutLabel(topicLabel(intent.emphasis ?? intent.message)), 1.18, 3.25, 2.85, 1.4, 12, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 18 })
  ];
  items.forEach((item, index) => {
    const y = 2.05 + index * 0.76;
    const order = 20 + index * 5;
    elements.push(shape(`${id}-step-dot-${index}`, "ellipse", 5.35, y + 0.08, 0.34, 0.34, order, theme.accent, theme.accent));
    elements.push(icon(`${id}-step-icon-${index}`, iconForEvidence(item, index), 5.43, y + 0.16, 0.18, order + 1, theme, { color: theme.inkOnAccent, decorative: true }));
    elements.push(shape(`${id}-step-line-${index}`, "line", 5.52, y + 0.45, 0.001, 0.32, order + 2, "none", theme.line, { width: 1 }));
    elements.push(text(`${id}-step-text-${index}`, "body", visibleSentence(item), 5.98, y, 5.75, 0.36, order + 3, theme, { bg: theme.background, fontSize: 17 }));
  });
  return elements;
}

export function archetypeForIntent(intent: SlideIntent): MessageDeckArchetype {
  const text = [intent.title, intent.message, intent.emphasis, ...intent.evidence, ...intent.quietInfo].join(" ");
  const proofText = [intent.emphasis, ...intent.evidence].filter(Boolean).join(" ");
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
    case "image":
      return "photo-hero";
    case "summary":
      if (/\d|%|倍|億|万|円|pt|ポイント|減|増/u.test(proofText)) return "focal-proof";
      return "statement";
    case "section":
      return "section-break";
    case "cycle":
      return "concept";
    case "cards":
    case "visual-scaffold":
    case "detail":
    case "cycle":
    case "section":
    default:
      return "statement";
  }
}

function visualForIntent(theme: Theme, intent: SlideIntent, locale: Locale): [MessageDeckArchetype, SlideElement[]] {
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
      return [archetype, hubMapVisual(theme, intent, id, locale)];
    case "image-message":
      return [archetype, imageMessageVisual(theme, intent, id)];
    case "photo-hero":
      return [archetype, photoHeroVisual(theme, intent, id)];
    case "focal-proof":
      return [archetype, focalProofVisual(theme, intent, id)];
    case "section-break":
      return [archetype, sectionBreakVisual(theme, intent, id)];
    case "concept":
      return [archetype, conceptVisual(theme, intent, id)];
    case "steps":
      return [archetype, stepsVisual(theme, intent, id)];
    case "statement":
    default:
      return [archetype, statementVisual(theme, intent, id)];
  }
}

function createCover(theme: Theme, title: string, messageMap: DeckMessageMap): Slide {
  const displayTitle = coverTitleText(titleLabel(title));
  return {
    id: "cover",
    title: displayTitle,
    layout: "cover",
    background: { color: theme.background },
    speakerNotes: [messageMap.objective, messageMap.audience, messageMap.desiredAction].filter(Boolean).join("\n"),
    elements: [
      shape("cover-bg", "rect", 0, 0, W, H, 0, theme.background, theme.background, { radius: 0 }),
      shape("cover-focus", "roundRect", 7.65, 0.9, 4.6, 5.65, 1, theme.accentSoft, theme.line, { radius: 0.24 }),
      shape("cover-orbit-1", "ellipse", 8.25, 1.55, 1.05, 1.05, 2, theme.surface, theme.line),
      shape("cover-orbit-2", "ellipse", 10.35, 2.65, 1.3, 1.3, 3, theme.accent, theme.accent),
      shape("cover-orbit-3", "ellipse", 8.95, 4.65, 1.0, 1.0, 4, theme.surface, theme.line),
      icon("cover-icon-1", "baby", 8.52, 1.81, 0.5, 5, theme, { color: theme.accent, decorative: true }),
      icon("cover-icon-2", "heart", 10.72, 3.0, 0.55, 6, theme, { color: theme.inkOnAccent, decorative: true }),
      icon("cover-icon-3", "map-pin", 9.22, 4.9, 0.5, 7, theme, { color: theme.accent, decorative: true }),
      text("cover-kicker", "caption", "MESSAGE-FIRST DECK", 0.78, 1.08, 4.2, 0.28, 8, theme, { color: theme.accent, fontSize: 12, bold: true }),
      text("cover-title", "title", displayTitle, 0.76, 1.62, 6.4, 1.62, 9, theme, { fontSize: 34 }),
      text("cover-objective", "body", messageMap.objective ?? "目的を1つに絞り、各スライドを1メッセージで構成します。", 0.8, 3.66, 6.15, 0.86, 10, theme, {
        color: theme.mutedText,
        fontSize: 20
      }),
      text("cover-action", "callout", messageMap.desiredAction ?? "次の判断へ進む", 0.8, 5.48, 5.55, 0.54, 11, theme, { color: theme.accent, fontSize: 21 })
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
    const [archetype, elements] = visualForIntent(theme, intent, locale);
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
