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
  SlideIntentDiagram,
  SlideVisualAsset,
  SvgElement,
  TextElement
} from "./schema.js";
import { createNarrativePlanArtifacts, type ExpressionPlan, type LayoutPlan, type PlanningMode } from "./narrativePlanning.js";
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
  "editorial-board",
  "steps"
] as const;

export type MessageDeckArchetype = (typeof MESSAGE_DECK_ARCHETYPES)[number];

/**
 * Request passed to a {@link NarrativeDiagramRenderer}. The narrative pipeline defines this seam so
 * the heavy `@pptcreater/diagram` generators can be injected by the CLI/MCP layer without the core
 * package depending on them. The renderer must return editable native diagram elements (or null to
 * fall back to the grammar composer).
 */
export type NarrativeDiagramRenderRequest = {
  idPrefix: string;
  title: string;
  summary: string;
  longDescription: string;
  frame: { x: number; y: number; w: number; h: number };
  readingOrderStart: number;
  accent?: string;
  diagram: SlideIntentDiagram;
};

export type NarrativeDiagramRenderer = (request: NarrativeDiagramRenderRequest) => SlideElement[] | null;

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
  planningMode?: PlanningMode;
  diagramRenderer?: NarrativeDiagramRenderer;
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
    .replace(/^\s*(?:対象|観点|表現|口調|材料|読み手|行動|トーン|tone|profile)\s*[:：]\s*/iu, "")
    .replace(/adaptive\+|compact-copy\+|executive-summary\+|safe-contrast\+|expression-polish-\d+/giu, "")
    .replace(/(?<![A-Za-z0-9])[-_]+|[-_]+(?![A-Za-z0-9])/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return value.trim();
  }
  if (normalized.length <= maxLength) {
    return trimJapaneseDanglingEnd(normalized);
  }
  const clipped = clipTextAtSemanticBoundary(normalized, maxLength);
  const wordSafe = !hasJapanese(normalized) ? clipped.replace(/[A-Za-z0-9]+$/u, "").trimEnd() : clipped;
  return (wordSafe || clipped).replace(/[、,，・／/\s]+$/u, "").trimEnd();
}

function compactChipValue(value: string, maxLength: number): string {
  const compact = compactLabel(value, maxLength);
  if (!hasJapanese(value) || Array.from(compact).length >= 5) {
    return compact;
  }
  const normalized = value
    .replace(/^\s*(?:対象|観点|表現|口調|材料|読み手|行動|トーン|tone|profile)\s*[:：]\s*/iu, "")
    .replace(/adaptive\+|compact-copy\+|executive-summary\+|safe-contrast\+|expression-polish-\d+/giu, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(normalized).slice(0, maxLength).join("").replace(/[、,，・／/\s]+$/u, "").trimEnd();
}

function chipLabel(prefix: string, value: string, maxLength: number): string {
  const compact = compactChipValue(value, maxLength);
  const normalized = compact.replace(/^(?:対象|行動|Audience|Action)\s*[:：]\s*/u, "").trim();
  const fallback = Array.from(value.replace(/\s+/g, "").trim()).slice(0, maxLength).join("");
  return `${prefix}: ${normalized.length >= 2 ? normalized : fallback}`;
}

function audienceChipValue(value: string): string {
  if (/CIO|CISO/iu.test(value)) return "CIO/CISO";
  if (/経営|役員|意思決定|取締役/u.test(value)) return "意思決定者";
  if (/財務|管理職|部長/u.test(value)) return "管理職";
  if (/家族|本人/u.test(value)) return "本人/家族";
  if (/工場|品質/u.test(value)) return "現場責任者";
  if (/自治体|行政/u.test(value)) return "行政担当";
  if (/店舗|販促/u.test(value)) return "店舗/販促";
  if (/患者/u.test(value)) return "患者/家族";
  if (/投資/u.test(value)) return "投資家";
  if (/アーキテクト|設計者|技術責任|architect/iu.test(value)) return "アーキテクト";
  if (/セキュリティ|security/iu.test(value)) return "セキュリティ";
  if (/開発|エンジニア|SRE/u.test(value)) return "開発チーム";
  return compactChipValue(value, 10);
}

function actionChipValue(value: string): string {
  if (/承認|approve/u.test(value)) return "承認";
  if (/比較|選ぶ|選定|絞/u.test(value)) return "比較/選定";
  if (/合意|agree/u.test(value)) return "合意";
  if (/寄付|donation/u.test(value)) return "寄付";
  if (/実行|launch|開始/u.test(value)) return "実行";
  if (/申請/u.test(value)) return "申請";
  if (/理解|学|learn|伝える/u.test(value)) return "理解";
  if (/確認|review/u.test(value)) return "確認";
  return "次判断";
}

function clipTextAtSemanticBoundary(value: string, maxLength: number): string {
  const chars = Array.from(value);
  const clipped = chars.slice(0, Math.max(1, maxLength)).join("").trimEnd();
  if (!hasJapanese(value)) {
    return clipped;
  }

  const punctuationIndex = Math.max(clipped.lastIndexOf("、"), clipped.lastIndexOf("，"), clipped.lastIndexOf("・"));
  if (punctuationIndex >= 4) {
    return trimJapaneseDanglingEnd(clipped.slice(0, punctuationIndex));
  }

  const particlePattern = /[をにへでとがはの]/gu;
  let lastParticle = -1;
  for (const match of clipped.matchAll(particlePattern)) {
    lastParticle = match.index ?? -1;
  }
  if (lastParticle >= 4) {
    return trimJapaneseDanglingEnd(clipped.slice(0, lastParticle));
  }

  return trimJapaneseDanglingEnd(clipped);
}

function trimJapaneseDanglingEnd(value: string): string {
  return value.replace(/[、,，・／/\s]+$/u, "").replace(/[をにへでとがはの]$/u, "").trimEnd();
}

function topicLabel(value: string): string {
  const normalized = value.replace(/^L\d+\s+/iu, "").replace(/(?<![A-Za-z0-9])[-_]+|[-_]+(?![A-Za-z0-9])/g, " ").replace(/\s+/g, " ").trim();
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

  const known = ["投資判断", "候補比較", "リスク整理", "ロードマップ", "次の行動"];
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
  if (/^(対象|観点|表現|口調|材料|読み手|行動|トーン)\s*[:：]/u.test(text) || /[:：]/.test(text) || /[、/／]/.test(text) || text.length <= 18) {
    return text;
  }
  if (/[。.!?！？]$/u.test(text) || /(する|した|できる|ある|いる|なる|進める|示す|伝える|確認する|選ぶ)$/u.test(text)) {
    return text;
  }
  return hasJapanese(text) ? `${text}。` : `${text} matters.`;
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

function audienceChipLabel(messageMap: DeckMessageMap): string {
  const audience = messageMap.audience ?? "Audience";
  return hasJapanese(audience) ? `対象: ${audienceChipValue(audience)}` : `Audience: ${compactLabel(audience, 18)}`;
}

function actionChipLabel(messageMap: DeckMessageMap): string {
  const action = messageMap.desiredAction ?? "Next decision";
  return hasJapanese(action) ? `行動: ${actionChipValue(action)}` : `Action: ${compactLabel(action, 18)}`;
}

function annotationLabel(intent: SlideIntent): string {
  const candidate = intent.visualAsset?.caption ?? intent.emphasis ?? intent.evidence[0] ?? intent.title;
  return hasJapanese(candidate) ? `注目: ${compactLabel(candidate, 14)}` : `Focus: ${compactLabel(candidate, 18)}`;
}

function captionRailText(intent: SlideIntent): string {
  const first = intent.evidence[0] ?? intent.emphasis ?? intent.title;
  const second = intent.evidence[1] ?? intent.message;
  return `${compactLabel(first, 18)} / ${compactLabel(second, 18)}`;
}

function decisionEmphasisLabel(intent: SlideIntent): string {
  const candidate = intent.emphasis ?? intent.evidence[0] ?? intent.title;
  const context = [intent.title, intent.message, intent.emphasis, ...intent.evidence, ...intent.quietInfo].filter(Boolean).join(" ");
  const candidateIsEnglish = !hasJapanese(candidate);
  const label = candidateIsEnglish ? "" : `: ${compactLabel(candidate, 8)}`;
  if (hasJapanese(context)) {
    if (/承認|判断|決裁|選定|比較|予算|投資|リスク|費用|候補|案/u.test(context)) return `判断軸${label}`;
    if (/新入|オンボーディング|学習|使い方|Tips|プロンプト|レビュー|開発|チーム/u.test(context)) return `実践${label}`;
    if (/患者|予約|支払い|注意|チェック|家族|旅館|住み替え/u.test(context)) return `確認${label}`;
    if (/原因|障害|不良|品質|改善/u.test(context)) return `原因${label}`;
    return `注目${label}`;
  }
  if (/approval|decision|choose|choice|budget|risk|cost|option|investment/i.test(context)) return "Decision axis";
  if (/onboarding|learning|tips|prompt|review|developer|team|practice/i.test(context)) return "Practice point";
  if (/patient|booking|payment|check|guide|family|home|area/i.test(context)) return "Check point";
  if (/incident|root cause|defect|quality/i.test(context)) return "Cause focus";
  return "Focus point";
}

function visualKickerLabel(intent: SlideIntent): string {
  const context = [intent.title, intent.message, intent.emphasis, ...intent.evidence, ...intent.quietInfo].filter(Boolean).join(" ");
  if (hasJapanese(context)) {
    if (/事例|顧客|現場|旅館|患者|住み替え|地域/u.test(context)) return "実例";
    if (/使い方|Tips|プロンプト|レビュー|開発/u.test(context)) return "実践";
    if (/根拠|効果|成果|KPI|ROI|予算|費用/u.test(context)) return "根拠";
    return "注目";
  }
  if (/case|customer|field|patient|community|hotel|home/i.test(context)) return "EXAMPLE";
  if (/tips|prompt|review|developer|practice/i.test(context)) return "PRACTICE";
  if (/proof|impact|kpi|roi|budget|cost/i.test(context)) return "PROOF";
  return "FOCUS";
}

function closingChecklist(messageMap: DeckMessageMap): { label: string; value: string; icon: IconKey }[] {
  const action = messageMap.desiredAction ?? "次の判断へ進む";
  const audience = messageMap.audience ?? "担当者";
  const isJapanese = hasJapanese([action, audience, messageMap.objective ?? ""].join(" "));
  return isJapanese
    ? [
        { label: "担当", value: audienceChipValue(audience), icon: "clipboard" },
        { label: "期限", value: "次回会議までに確認", icon: "calendar" },
        { label: "確認物", value: actionChipValue(action), icon: "check" }
      ]
    : [
        { label: "Owner", value: compactLabel(audience, 18), icon: "clipboard" },
        { label: "Due", value: "Before next review", icon: "calendar" },
        { label: "Item", value: compactLabel(action, 18), icon: "check" }
      ];
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

function proofNumberForIntent(intent: SlideIntent): string | undefined {
  const sourceText = [intent.emphasis, ...intent.evidence, intent.message, intent.title]
    .filter(Boolean)
    .join(" ")
    .replace(/(?:19|20)\d{2}\s*年?/gu, " ");
  // Require a real unit and a clean digit boundary so product names (Auth0) and bare years never become a hero number.
  const match = sourceText.match(/(?<![A-Za-z0-9])[-+]?\d[\d,.]*(?:\.\d+)?\s*(?:%|倍|億|万|円|pt|ポイント|件|社|人|年|ヶ月|月|日)(?:\s*(?:減|増|改善|短縮|削減))?/u);
  return match ? compactLabel(match[0], 12) : undefined;
}

function statementVisual(theme: Theme, intent: SlideIntent, id: string): SlideElement[] {
  const items = evidenceItems(intent, 3).slice(0, 3);
  const elements: SlideElement[] = [
    shape(`${id}-statement-panel`, "roundRect", 0.82, 2.05, 5.55, 3.98, 10, theme.accentSoft, theme.line, { radius: 0.18 }),
    icon(`${id}-statement-icon`, iconForEvidence(intent.emphasis ?? intent.message, 0), 1.16, 2.48, 0.54, 10, theme, { color: theme.accent, decorative: true }),
    text(`${id}-statement-focus`, "title", calloutLabel(topicLabel(intent.emphasis ?? intent.message)), 1.88, 2.48, 4.13, 0.88, 11, theme, {
      bg: theme.accentSoft,
      color: theme.accent,
      fontSize: 31
    }),
    text(`${id}-statement-body`, "body", visibleSentence(intent.message), 1.16, 3.52, 4.85, 1.28, 12, theme, {
      bg: theme.accentSoft,
      color: theme.text,
      fontSize: 20
    })
  ];
  items.forEach((item, index) => {
    const isPrimarySupport = index === 0;
    const y = isPrimarySupport ? 2.12 : 3.46 + (index - 1) * 0.92;
    const h = isPrimarySupport ? 1.02 : 0.66;
    const fill = isPrimarySupport ? theme.accentSoft : theme.surface;
    const order = 20 + index * 5;
    elements.push(shape(`${id}-statement-support-card-${index}`, "roundRect", 7.05, y, 4.95, h, order, fill, theme.line, { radius: 0.18 }));
    elements.push(icon(`${id}-statement-support-icon-${index}`, iconForEvidence(item, index), 7.28, y + (isPrimarySupport ? 0.28 : 0.18), 0.34, order + 1, theme, { color: theme.accent, decorative: true }));
    elements.push(text(`${id}-statement-support-label-${index}`, isPrimarySupport ? "callout" : "body", item, 7.78, y + (isPrimarySupport ? 0.22 : 0.13), 3.65, isPrimarySupport ? 0.42 : 0.28, order + 2, theme, { bg: fill, color: isPrimarySupport ? theme.accent : theme.text, fontSize: isPrimarySupport ? 19 : 15 }));
    if (isPrimarySupport) {
      elements.push(text(`${id}-statement-support-note-${index}`, "caption", "supporting proof", 7.78, y + 0.64, 2.3, 0.18, order + 3, theme, { bg: fill, color: theme.mutedText, fontSize: 12, bold: true }));
    }
  });
  return elements;
}

function flowVisual(theme: Theme, intent: SlideIntent, id: string): SlideElement[] {
  const items = evidenceItems(intent, 4).slice(0, 4);
  const elements: SlideElement[] = [];
  const startX = 0.78;
  const nodeW = 2.48;
  const gap = 0.6;
  items.forEach((item, index) => {
    const x = startX + index * (nodeW + gap);
    const order = 10 + index * 8;
    const label = pointLabel(item);
    const isFocal = index === 0;
    const nodeY = isFocal ? 2.66 : 2.9;
    const nodeH = isFocal ? 1.86 : 1.42;
    elements.push(shape(`${id}-flow-node-${index}`, "roundRect", x, nodeY, nodeW, nodeH, order, isFocal ? theme.accent : theme.surface, isFocal ? theme.accent : theme.line, { radius: isFocal ? 0.24 : 0.2 }));
    if (isFocal) {
      elements.push(shape(`${id}-flow-focal-glow`, "ellipse", x + 1.52, nodeY + 0.18, 0.58, 0.58, order + 1, theme.inkOnAccent, theme.inkOnAccent, { fillOpacity: 0.18 }));
      elements.push(text(`${id}-flow-focal-label`, "caption", "START", x + 0.22, nodeY + 0.2, nodeW - 0.44, 0.18, order + 2, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 12, bold: true, align: "center" }));
    }
    elements.push(icon(`${id}-flow-icon-${index}`, iconForEvidence(item, index), x + nodeW / 2 - 0.17, nodeY + (isFocal ? 0.58 : 0.15), 0.34, order + 3, theme, {
      color: index === 0 ? theme.inkOnAccent : theme.accent,
      decorative: true
    }));
    elements.push(text(`${id}-flow-label-${index}`, "caption", `STEP ${index + 1}`, x + 0.2, nodeY + (isFocal ? 0.98 : 0.56), nodeW - 0.4, 0.2, order + 4, theme, {
      color: index === 0 ? theme.inkOnAccent : theme.accent,
      bg: index === 0 ? theme.accent : theme.surface,
      fontSize: 12,
      bold: true,
      align: "center"
    }));
    elements.push(text(`${id}-flow-text-${index}`, "body", label, x + 0.18, nodeY + (isFocal ? 1.24 : 0.82), nodeW - 0.36, isFocal ? 0.42 : 0.46, order + 5, theme, {
      color: index === 0 ? theme.inkOnAccent : theme.text,
      bg: index === 0 ? theme.accent : theme.surface,
      fontSize: isFocal ? 18 : 17,
      align: "center"
    }));
    if (index < items.length - 1) {
      elements.push(shape(`${id}-flow-connector-${index}`, "line", x + nodeW + 0.12, 3.62, gap - 0.24, 0, order + 6, "none", theme.accent, { width: 1.4, endArrow: true }));
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
    shape(`${id}-decision-badge`, "roundRect", 5.78, 4.3, 1.68, 0.42, 32, theme.surface, theme.accent, { radius: 0.13 }),
    icon(`${id}-left-icon`, iconForEvidence(left[0] ?? "left", 0), 1.18, 2.14, 0.46, 10, theme, { color: theme.accent, decorative: true }),
    icon(`${id}-right-icon`, iconForEvidence(right[0] ?? "right", 1), 8.1, 2.14, 0.46, 20, theme, { color: theme.accent, decorative: true }),
    text(`${id}-left-title`, "callout", leftTitle, 1.78, 2.42, 3.45, 0.42, 11, theme, { bg: theme.surface, fontSize: 21, color: theme.text }),
    text(`${id}-left-body`, "body", visibleSentence(left[1] ?? intent.message), 1.18, 3.18, 4.05, 1.4, 12, theme, { bg: theme.surface, fontSize: 19, color: theme.mutedText }),
    text(`${id}-bridge-text`, "caption", afterLabel, 6.15, 3.63, 0.9, 0.22, 31, theme, { bg: theme.accent, color: theme.inkOnAccent, align: "center", fontSize: 12 }),
    text(`${id}-decision-badge-text`, "caption", decisionEmphasisLabel(intent), 5.92, 4.43, 1.36, 0.16, 33, theme, { bg: theme.surface, color: theme.accent, align: "center", fontSize: 12, bold: true }),
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
    shape(`${id}-photo-annotation`, "roundRect", 1.18, 2.14, 4.1, 0.78, 12, theme.accent, theme.accent, { radius: 0.2, fillOpacity: 0.96 }),
    shape(`${id}-photo-annotation-pointer`, "rightArrow", 4.78, 2.48, 0.48, 0.38, 13, theme.accent, theme.accent, { radius: 0 }),
    icon(`${id}-photo-annotation-icon`, iconForEvidence(intent.emphasis ?? intent.message, 0), 1.42, 2.36, 0.32, 14, theme, { color: theme.inkOnAccent, decorative: true }),
    text(`${id}-photo-annotation-text`, "caption", annotationLabel(intent), 1.88, 2.34, 3.0, 0.26, 15, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 14, bold: true }),
    shape(`${id}-photo-caption-rail`, "roundRect", 1.18, 5.92, 5.88, 0.58, 16, theme.surface, theme.line, { radius: 0.16, fillOpacity: 0.94 }),
    text(`${id}-photo-caption-rail-text`, "caption", captionRailText(intent), 1.46, 6.08, 5.3, 0.22, 17, theme, { bg: theme.surface, color: theme.text, fontSize: 13, bold: true, align: "center" }),
    shape(`${id}-caption-panel`, "roundRect", 7.55, 2.18, 4.58, 3.95, 20, theme.surface, theme.line, { radius: 0.22 }),
    text(`${id}-caption-kicker`, "caption", visualKickerLabel(intent), 7.95, 2.52, 1.4, 0.22, 21, theme, { bg: theme.surface, color: theme.accent, bold: true, fontSize: 12 }),
    text(`${id}-caption-title`, "title", topicLabel(intent.emphasis ?? intent.title), 7.95, 2.84, 3.72, 0.68, 22, theme, { bg: theme.surface, color: theme.text, fontSize: 31 }),
    text(`${id}-caption-message`, "body", intent.message, 7.95, 3.72, 3.74, 1.04, 23, theme, { bg: theme.surface, color: theme.text, fontSize: 18 }),
    text(`${id}-caption-proof`, "caption", evidenceItems(intent, 1)[0] ?? intent.title, 7.95, 5.18, 3.6, 0.34, 24, theme, { bg: theme.surface, color: theme.mutedText, fontSize: 13 })
  ];
}

function focalProofVisual(theme: Theme, intent: SlideIntent, id: string): SlideElement[] {
  const proof = proofNumberForIntent(intent) ?? evidenceItems(intent, 1).find((item) => /\d|%|倍|億|万|円|pt|ポイント|減|増/u.test(item)) ?? intent.emphasis ?? intent.title;
  return [
    shape(`${id}-proof-band`, "roundRect", 0.82, 1.92, 4.95, 4.9, 10, theme.accent, theme.accent, { radius: 0.22 }),
    text(`${id}-proof-number`, "callout", proof, 1.22, 2.5, 4.18, 1.1, 11, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 31, bold: true, align: "center" }),
    text(`${id}-proof-label`, "caption", "FOCAL PROOF", 1.5, 4.0, 3.65, 0.22, 12, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 12, bold: true, align: "center" }),
    shape(`${id}-message-panel`, "roundRect", 6.2, 2.0, 5.95, 4.7, 20, theme.surface, theme.line, { radius: 0.2 }),
    text(`${id}-message-title`, "callout", topicLabel(intent.title), 6.62, 2.45, 4.95, 0.45, 21, theme, { bg: theme.surface, color: theme.accent, fontSize: 25 }),
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
  const items = evidenceItems(intent, 2).slice(0, 2);
  const positions = [
    [1.18, 4.8],
    [8.68, 4.8]
  ] as const;
  const elements: SlideElement[] = [
    shape(`${id}-concept-stage`, "roundRect", 0.82, 1.88, 11.7, 4.92, 10, theme.surface, theme.line, { radius: 0.18 }),
    shape(`${id}-concept-field`, "ellipse", 4.46, 2.18, 4.42, 4.42, 11, theme.accentSoft, theme.accentSoft, { fillOpacity: 0.82 }),
    shape(`${id}-concept-core-shadow`, "roundRect", 4.36, 2.82, 4.62, 1.86, 12, mix(theme.accent, theme.background, 0.32), mix(theme.accent, theme.background, 0.32), { radius: 0.28 }),
    shape(`${id}-concept-core`, "roundRect", 4.12, 2.56, 4.62, 1.86, 13, theme.accent, theme.accent, { radius: 0.28 }),
    text(`${id}-concept-kicker`, "caption", "CONCEPT MODEL", 4.62, 2.94, 3.6, 0.18, 14, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 12, bold: true, align: "center" }),
    text(`${id}-concept-center-text`, "title", topicLabel(intent.emphasis ?? intent.title), 4.62, 3.34, 3.58, 0.48, 15, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 27, bold: true, align: "center" }),
    shape(`${id}-decision-callout`, "roundRect", 4.72, 4.48, 3.58, 0.42, 16, theme.surface, theme.accent, { radius: 0.14 }),
    text(`${id}-decision-callout-text`, "caption", decisionEmphasisLabel(intent), 5.0, 4.61, 3.02, 0.14, 17, theme, { bg: theme.surface, color: theme.accent, fontSize: 12, bold: true, align: "center" })
  ];
  items.forEach((item, index) => {
    const [x, y] = positions[index];
    const order = 24 + index * 4;
    const fill = index % 2 === 0 ? theme.background : theme.accentSoft;
    const label = compactLabel(item, 12);
    elements.push(shape(`${id}-concept-node-${index}`, "roundRect", x, y, 3.48, 0.88, order, fill, theme.line, { radius: 0.16 }));
    elements.push(shape(`${id}-concept-node-accent-${index}`, "rect", x, y, 0.12, 0.88, order + 1, theme.accent, theme.accent, { radius: 0 }));
    elements.push(text(`${id}-concept-label-${index}`, "body", label, x + 0.42, y + 0.22, 2.66, 0.28, order + 2, theme, { bg: fill, color: theme.text, fontSize: 15, align: "left" }));
  });
  return elements;
}

function editorialBoardVisual(theme: Theme, intent: SlideIntent, id: string): SlideElement[] {
  const items = evidenceItems(intent, 4).slice(0, 4);
  const hero = intent.emphasis ?? intent.title;
  const elements: SlideElement[] = [
    shape(`${id}-editorial-backdrop`, "roundRect", 0.82, 1.88, 11.7, 4.92, 10, theme.surface, theme.line, { radius: 0.18 }),
    shape(`${id}-editorial-hero`, "roundRect", 1.12, 2.12, 5.05, 4.18, 11, theme.accent, theme.accent, { radius: 0.24 }),
    shape(`${id}-editorial-hero-glow`, "ellipse", 4.38, 2.42, 1.1, 1.1, 12, theme.inkOnAccent, theme.inkOnAccent, { fillOpacity: 0.18 }),
    text(`${id}-editorial-kicker`, "caption", "FOCUS", 1.48, 2.52, 2.5, 0.22, 13, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 12, bold: true }),
    text(`${id}-editorial-hero-title`, "title", topicLabel(hero), 1.45, 3.02, 4.28, 0.82, 14, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 34 }),
    text(`${id}-editorial-hero-body`, "body", visibleSentence(intent.message), 1.48, 4.2, 4.05, 0.98, 15, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 18 }),
    shape(`${id}-editorial-rule`, "rect", 1.48, 5.5, 2.05, 0.06, 16, theme.inkOnAccent, theme.inkOnAccent, { radius: 0 }),
    text(`${id}-editorial-hero-note`, "caption", compactLabel(items[0] ?? hero, 22), 1.48, 5.78, 3.9, 0.18, 17, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 12, bold: true })
  ];

  items.slice(1).forEach((item, index) => {
    const x = 6.7;
    const y = 2.22 + index * 1.34;
    const order = 24 + index * 5;
    const fill = index % 2 === 0 ? theme.background : theme.accentSoft;
    elements.push(shape(`${id}-editorial-support-card-${index}`, "roundRect", x, y, 4.85, 0.95, order, fill, theme.line, { radius: 0.14 }));
    elements.push(icon(`${id}-editorial-support-icon-${index}`, iconForEvidence(item, index), x + 0.28, y + 0.27, 0.3, order + 1, theme, { color: theme.accent, decorative: true }));
    elements.push(text(`${id}-editorial-support-number-${index}`, "caption", String(index + 2).padStart(2, "0"), x + 4.12, y + 0.24, 0.38, 0.18, order + 2, theme, { bg: fill, color: theme.accent, fontSize: 12, bold: true, align: "right" }));
    elements.push(text(`${id}-editorial-support-text-${index}`, "body", item, x + 0.82, y + 0.22, 3.05, 0.34, order + 3, theme, { bg: fill, color: theme.text, fontSize: 15 }));
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
    if (index === 0) {
      elements.push(shape(`${id}-table-focal-card`, "roundRect", 1.04, 2.88, 10.95, 1.08, 20, theme.accentSoft, theme.accent, { radius: 0.18 }));
      elements.push(icon(`${id}-table-focal-icon`, iconForEvidence(item, index), 1.34, 3.18, 0.38, 21, theme, { color: theme.accent, decorative: true }));
      elements.push(text(`${id}-table-focal-label`, "caption", "FOCUS", 1.92, 3.06, 1.1, 0.18, 22, theme, { bg: theme.accentSoft, color: theme.accent, fontSize: 12, bold: true }));
      elements.push(text(`${id}-table-focal-text`, "callout", item, 3.1, 3.08, 8.08, 0.36, 23, theme, { bg: theme.accentSoft, color: theme.text, fontSize: 20 }));
      return;
    }
    const y = 4.18 + (index - 1) * 0.58;
    const fill = index % 2 === 0 ? mix(theme.surface, theme.background, 0.35) : theme.surface;
    elements.push(shape(`${id}-row-${index}`, "rect", 0.98, y, 11.3, 0.48, 24 + index * 4, fill, fill, { radius: 0 }));
    elements.push(icon(`${id}-row-icon-${index}`, iconForEvidence(item, index), 1.2, y + 0.1, 0.24, 25 + index * 4, theme, { color: theme.accent, decorative: true }));
    elements.push(text(`${id}-row-index-${index}`, "caption", String(index + 1).padStart(2, "0"), 1.58, y + 0.13, 0.5, 0.18, 26 + index * 4, theme, { bg: fill, color: theme.accent, fontSize: 12, bold: true }));
    elements.push(text(`${id}-row-text-${index}`, "body", item, 2.28, y + 0.06, 9.45, 0.26, 27 + index * 4, theme, { bg: fill, fontSize: 16 }));
  });
  return elements;
}

function matrixVisual(theme: Theme, intent: SlideIntent, id: string): SlideElement[] {
  const items = evidenceItems(intent, 4).slice(0, 4);
  const elements: SlideElement[] = [
    shape(`${id}-matrix-bg`, "roundRect", 1.0, 1.95, 7.2, 4.8, 10, theme.surface, theme.line, { radius: 0.18 }),
    shape(`${id}-decision-zone`, "roundRect", 4.88, 2.88, 2.28, 0.86, 11, theme.accentSoft, theme.accent, { radius: 0.16, fillOpacity: 0.95 }),
    shape(`${id}-axis-x-line`, "line", 1.55, 4.45, 5.95, 0, 12, "none", theme.line, { width: 1.2, endArrow: true }),
    shape(`${id}-axis-y-line`, "line", 4.55, 2.7, 0.001, 3.45, 13, "none", theme.line, { width: 1.2, endArrow: true }),
    text(`${id}-axis-x-label`, "caption", "柔軟性", 6.55, 4.66, 1.0, 0.2, 14, theme, { bg: theme.surface, color: theme.mutedText, fontSize: 12, align: "right" }),
    text(`${id}-axis-y-label`, "caption", "費用負担", 3.85, 2.32, 1.3, 0.2, 15, theme, { bg: theme.surface, color: theme.mutedText, fontSize: 12, align: "center" }),
    text(`${id}-decision-zone-text`, "caption", decisionEmphasisLabel(intent), 5.1, 3.18, 1.84, 0.18, 16, theme, { bg: theme.accentSoft, color: theme.accent, fontSize: 12, bold: true, align: "center" }),
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
    elements.push(text(`${id}-point-label-${index}`, "caption", visibleSentence(pointLabel(item)), x + 0.4, y - 0.1, 2.18, 0.48, 21 + index * 3, theme, { bg: theme.surface, fontSize: 12, color: theme.text }));
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
    shape(`${id}-decision-callout`, "roundRect", 4.78, 4.48, 3.76, 0.48, 52, theme.surface, theme.accent, { radius: 0.16 }),
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
    }),
    text(`${id}-decision-callout-text`, "caption", decisionEmphasisLabel(intent), 5.0, 4.63, 3.32, 0.16, 53, theme, { bg: theme.surface, color: theme.accent, fontSize: 12, bold: true, align: "center" })
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
    const order = 20 + index * 8;
    const isFocal = index === 0;
    if (isFocal) {
      elements.push(shape(`${id}-step-focal-card`, "roundRect", 5.04, y - 0.1, 6.6, 0.78, order, theme.accentSoft, theme.accent, { radius: 0.18 }));
      elements.push(text(`${id}-step-focal-label`, "caption", "FIRST DECISION", 8.92, y + 0.5, 1.92, 0.14, order + 1, theme, { bg: theme.accentSoft, color: theme.accent, fontSize: 11, bold: true, align: "right" }));
    }
    elements.push(shape(`${id}-step-dot-${index}`, "ellipse", 5.35, y + 0.08, 0.34, 0.34, order + 2, theme.accent, theme.accent));
    elements.push(icon(`${id}-step-icon-${index}`, iconForEvidence(item, index), 5.43, y + 0.16, 0.18, order + 3, theme, { color: theme.inkOnAccent, decorative: true }));
    elements.push(shape(`${id}-step-line-${index}`, "line", 5.52, y + 0.45, 0.001, 0.32, order + 4, "none", theme.line, { width: 1 }));
    elements.push(text(`${id}-step-text-${index}`, "body", visibleSentence(item), 5.98, y, 5.75, 0.36, order + 5, theme, { bg: isFocal ? theme.accentSoft : theme.background, fontSize: isFocal ? 18 : 17 }));
  });
  return elements;
}

export function archetypeForIntent(intent: SlideIntent): MessageDeckArchetype {
  const text = [intent.title, intent.message, intent.emphasis, ...intent.evidence, ...intent.quietInfo].join(" ");
  const proofText = [intent.emphasis, ...intent.evidence].filter(Boolean).join(" ");
  const proofNumber = proofNumberForIntent(intent);
  if (proofNumber && ["summary", "table", "contrast", "before-after"].includes(intent.visualType)) {
    return "focal-proof";
  }
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
      return "editorial-board";
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
    case "editorial-board":
      return [archetype, editorialBoardVisual(theme, intent, id)];
    case "steps":
      return [archetype, stepsVisual(theme, intent, id)];
    case "statement":
    default:
      return [archetype, statementVisual(theme, intent, id)];
  }
}

function narrativeSlideShell(theme: Theme, intent: SlideIntent, elements: SlideElement[], expressionPlan: ExpressionPlan, index: number): Slide {
  const id = intent.slideId;
  const title = slideTopicTitle(intent);
  return {
    id,
    title,
    layout: `message-grammar-${expressionPlan.selectedGrammarId}`,
    background: { color: theme.background },
    speakerNotes: [
      `Message: ${intent.message}`,
      intent.evidence.length ? `Evidence: ${intent.evidence.join(" / ")}` : "",
      `Expression: ${expressionPlan.selectedGrammarId}`,
      `Rationale: ${expressionPlan.rationale}`,
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
      text(`${id}-eyebrow`, "caption", `SLIDE ${String(index + 1).padStart(2, "0")}`, 0.7, 0.38, 1.68, 0.25, 1, theme, {
        color: theme.accent,
        bg: theme.background,
        fontSize: 12,
        bold: true
      }),
      text(`${id}-title`, "title", title, 1.22, 0.72, 3.88, 0.62, 2, theme, { fontSize: 26 }),
      text(`${id}-message`, "subtitle", intent.message, 5.22, 0.68, 7.12, 0.92, 3, theme, { color: theme.text, fontSize: 20 }),
      ...elements
    ]
  };
}

function hasCodeToken(value: string): boolean {
  return /[A-Za-z0-9][-_/=.:+][A-Za-z0-9]/.test(value) || /[=]|\bRFC\s?\d|urn:|https?:\/\//i.test(value);
}

function narrativeLabel(value: string, max = 26): string {
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return text;
  if (hasCodeToken(text)) {
    // Technical identifiers (grant_type=..., insufficient_user_authentication, MCP 2025-11-25) lose
    // their meaning when cut mid-token, so keep them nearly whole and let wrapping/auto-fit shrink.
    const chars = Array.from(text);
    const limit = Math.min(max + 40, 72);
    return chars.length <= limit ? text : chars.slice(0, limit).join("").trimEnd();
  }
  return compactLabel(text, max);
}

function narrativeItems(intent: SlideIntent, min = 3, max = 6, labelMax = 26): string[] {
  const values = intent.evidence.map((item) => narrativeLabel(item, labelMax)).filter(Boolean);
  while (values.length < min) values.push(narrativeLabel(intent.emphasis ?? intent.message, labelMax));
  return values.slice(0, max);
}

function conceptMarkSvg(ink: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 150" role="img"><circle cx="42" cy="75" r="17" fill="none" stroke="${ink}" stroke-width="6"/><circle cx="164" cy="42" r="15" fill="${ink}" opacity="0.92"/><circle cx="164" cy="112" r="15" fill="none" stroke="${ink}" stroke-width="6"/><path d="M60 68 L146 46 M60 82 L146 106" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/></svg>`;
}

function conceptMarkElement(theme: Theme, intent: SlideIntent, id: string, x: number, y: number, w: number, h: number, readingOrder: number, ink: string): SvgElement {
  const label = topicLabel(intent.emphasis ?? intent.title);
  return {
    id: `${id}-narrative-mark`,
    type: "svg",
    x,
    y,
    w,
    h,
    readingOrder,
    decorative: false,
    altText: `${label} relationship mark`,
    title: label,
    description: visibleSentence(intent.message),
    svg: conceptMarkSvg(ink)
  };
}

function narrativeEvidenceBoard(theme: Theme, intent: SlideIntent, _expressionPlan: ExpressionPlan): SlideElement[] {
  const id = intent.slideId;
  const items = narrativeItems(intent, 3, 5);
  const elements: SlideElement[] = [
    shape(`${id}-narrative-claim-panel`, "roundRect", 0.86, 1.96, 5.3, 4.84, 10, theme.accent, theme.accent, { radius: 0.22 }),
    text(`${id}-narrative-grammar`, "caption", visualKickerLabel(intent), 1.18, 2.32, 3.7, 0.2, 11, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 12, bold: true }),
    text(`${id}-narrative-claim`, "callout", topicLabel(intent.emphasis ?? intent.title), 1.18, 2.86, 4.35, 0.72, 12, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 28 }),
    text(`${id}-narrative-message`, "body", visibleSentence(intent.message), 1.18, 4.12, 4.28, 1.0, 13, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 18 }),
    conceptMarkElement(theme, intent, id, 4.62, 5.42, 1.32, 1.02, 14, theme.inkOnAccent),
    shape(`${id}-narrative-evidence-field`, "roundRect", 6.72, 2.04, 5.62, 4.66, 20, theme.surface, theme.line, { radius: 0.18 })
  ];
  items.forEach((item, index) => {
    const y = 2.38 + index * 0.78;
    const order = 30 + index * 4;
    const fill = index === 0 ? theme.accentSoft : index % 2 === 0 ? theme.background : theme.surface;
    elements.push(shape(`${id}-narrative-proof-${index}`, "roundRect", 7.08, y, 4.82, 0.55, order, fill, theme.line, { radius: 0.14 }));
    elements.push(icon(`${id}-narrative-proof-icon-${index}`, iconForEvidence(item, index), 7.3, y + 0.14, 0.26, order + 1, theme, { color: theme.accent, decorative: true }));
    elements.push(text(`${id}-narrative-proof-text-${index}`, "body", visibleSentence(item), 7.76, y + 0.1, 3.68, 0.24, order + 2, theme, { bg: fill, color: theme.text, fontSize: 15 }));
  });
  return elements;
}

function narrativeTypographic(theme: Theme, intent: SlideIntent, expressionPlan: ExpressionPlan): SlideElement[] {
  const id = intent.slideId;
  const proof = proofNumberForIntent(intent) ?? topicLabel(intent.emphasis ?? intent.title);
  const items = narrativeItems(intent, 2, 3);
  return [
    shape(`${id}-type-band`, "roundRect", 0.92, 2.02, 6.2, 4.54, 10, theme.accent, theme.accent, { radius: 0.24 }),
    text(`${id}-type-grammar`, "caption", visualKickerLabel(intent), 1.32, 2.42, 3.9, 0.2, 11, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 12, bold: true }),
    text(`${id}-type-proof`, "callout", proof, 1.28, 3.04, 5.08, 1.12, 12, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 38, align: "center" }),
    text(`${id}-type-message`, "body", visibleSentence(intent.message), 1.52, 4.72, 4.58, 0.74, 13, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 18, align: "center" }),
    shape(`${id}-type-context`, "roundRect", 7.58, 2.24, 4.42, 3.92, 20, theme.surface, theme.line, { radius: 0.18 }),
    text(`${id}-type-context-title`, "subtitle", topicLabel(intent.title), 7.98, 2.72, 3.42, 0.38, 21, theme, { bg: theme.surface, color: theme.accent, fontSize: 20 }),
    ...items.flatMap((item, index) => {
      const y = 3.58 + index * 0.72;
      return [
        icon(`${id}-type-item-icon-${index}`, iconForEvidence(item, index), 8.02, y + 0.04, 0.26, 24 + index * 3, theme, { color: theme.accent, decorative: true }),
        text(`${id}-type-item-${index}`, "body", item, 8.44, y, 3.0, 0.3, 25 + index * 3, theme, { bg: theme.surface, color: theme.text, fontSize: 16 })
      ];
    })
  ];
}

function narrativeSequentialPath(theme: Theme, intent: SlideIntent, _expressionPlan: ExpressionPlan): SlideElement[] {
  const id = intent.slideId;
  const items = narrativeItems(intent, 3, 6, 18);
  const count = items.length;
  const stageX = 0.92;
  const stageW = 11.48;
  const elements: SlideElement[] = [
    shape(`${id}-path-stage`, "roundRect", stageX, 2.0, stageW, 4.72, 10, theme.surface, theme.line, { radius: 0.18 }),
    text(`${id}-path-kicker`, "caption", visualKickerLabel(intent), 1.26, 2.3, 3.4, 0.2, 11, theme, { bg: theme.surface, color: theme.accent, fontSize: 12, bold: true })
  ];
  const marginX = 0.5;
  const gap = 0.42;
  const usableW = stageW - marginX * 2;
  const cardW = Math.max(1.5, (usableW - gap * (count - 1)) / count);
  const cardY = 3.55;
  const cardH = 2.5;
  const startX = stageX + marginX;
  const badgeCenterY = cardY + 0.52;
  items.forEach((item, index) => {
    const x = startX + index * (cardW + gap);
    const isFocal = index === 0;
    const cardFill = isFocal ? theme.accent : theme.background;
    const order = 20 + index * 6;
    if (index < count - 1) {
      elements.push(shape(`${id}-path-connector-${index}`, "line", x + cardW, badgeCenterY, gap, 0, order, "none", theme.accent, { width: 1.4, endArrow: true }));
    }
    elements.push(shape(`${id}-path-card-${index}`, "roundRect", x, cardY, cardW, cardH, order + 1, cardFill, isFocal ? theme.accent : theme.line, { radius: 0.16 }));
    elements.push(shape(`${id}-path-badge-${index}`, "ellipse", x + cardW / 2 - 0.28, cardY + 0.24, 0.56, 0.56, order + 2, isFocal ? theme.inkOnAccent : theme.accent, isFocal ? theme.inkOnAccent : theme.accent, { fillOpacity: isFocal ? 0.24 : 1 }));
    elements.push(text(`${id}-path-number-${index}`, "caption", String(index + 1), x + cardW / 2 - 0.28, cardY + 0.4, 0.56, 0.22, order + 3, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 16, bold: true, align: "center" }));
    elements.push(text(`${id}-path-label-${index}`, "body", item, x + 0.16, cardY + 1.08, cardW - 0.32, 1.22, order + 4, theme, { bg: cardFill, color: isFocal ? theme.inkOnAccent : theme.text, fontSize: 14, align: "center", valign: "top" }));
  });
  return elements;
}

function narrativeComparisonField(theme: Theme, intent: SlideIntent, expressionPlan: ExpressionPlan): SlideElement[] {
  const id = intent.slideId;
  const items = narrativeItems(intent, 4, 4);
  const [leftA, leftB, rightA, rightB] = items;
  return [
    shape(`${id}-comparison-left`, "roundRect", 0.92, 2.02, 5.24, 4.54, 10, theme.surface, theme.line, { radius: 0.2 }),
    shape(`${id}-comparison-right`, "roundRect", 7.2, 2.02, 5.24, 4.54, 20, theme.accentSoft, theme.line, { radius: 0.2 }),
    shape(`${id}-comparison-gap`, "rect", 6.52, 2.42, 0.16, 3.7, 30, theme.accent, theme.accent, { radius: 0 }),
    text(`${id}-comparison-grammar`, "caption", visualKickerLabel(intent), 1.24, 2.34, 3.8, 0.18, 11, theme, { bg: theme.surface, color: theme.accent, fontSize: 12, bold: true }),
    text(`${id}-comparison-left-title`, "callout", leftA ?? "Option A", 1.28, 2.88, 4.6, 0.56, 12, theme, { bg: theme.surface, color: theme.text, fontSize: 16, valign: "middle" }),
    text(`${id}-comparison-left-body`, "body", visibleSentence(leftB ?? intent.message), 1.28, 3.78, 4.0, 0.94, 13, theme, { bg: theme.surface, color: theme.mutedText, fontSize: 18 }),
    text(`${id}-comparison-right-title`, "callout", rightA ?? topicLabel(intent.emphasis ?? intent.title), 7.58, 2.88, 4.6, 0.56, 21, theme, { bg: theme.accentSoft, color: theme.accent, fontSize: 16, valign: "middle" }),
    text(`${id}-comparison-right-body`, "body", visibleSentence(rightB ?? intent.message), 7.58, 3.78, 4.0, 0.94, 22, theme, { bg: theme.accentSoft, color: theme.text, fontSize: 18 }),
    shape(`${id}-comparison-decision`, "roundRect", 4.74, 5.52, 3.86, 0.5, 31, theme.accent, theme.accent, { radius: 0.16 }),
    text(`${id}-comparison-decision-text`, "caption", decisionEmphasisLabel(intent), 5.02, 5.68, 3.28, 0.16, 32, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 12, bold: true, align: "center" })
  ];
}

function narrativeDecisionSurface(theme: Theme, intent: SlideIntent, expressionPlan: ExpressionPlan): SlideElement[] {
  const id = intent.slideId;
  const items = narrativeItems(intent, 4, 6);
  const elements: SlideElement[] = [
    shape(`${id}-decision-stage`, "roundRect", 0.92, 1.96, 8.02, 4.86, 10, theme.surface, theme.line, { radius: 0.18 }),
    text(`${id}-decision-grammar`, "caption", visualKickerLabel(intent), 1.24, 2.24, 3.5, 0.18, 11, theme, { bg: theme.surface, color: theme.accent, fontSize: 12, bold: true }),
    shape(`${id}-decision-x-axis`, "line", 1.62, 5.78, 6.52, 0, 12, "none", theme.accent, { width: 1.4, endArrow: true }),
    shape(`${id}-decision-y-axis`, "line", 1.62, 5.78, 0.001, -3.08, 13, "none", theme.accent, { width: 1.4, endArrow: true }),
    shape(`${id}-decision-zone`, "roundRect", 5.62, 2.66, 1.9, 1.06, 14, theme.accentSoft, theme.accent, { radius: 0.18, fillOpacity: 0.88 }),
    text(`${id}-decision-zone-label`, "caption", decisionEmphasisLabel(intent), 5.82, 3.04, 1.5, 0.18, 15, theme, { bg: theme.accentSoft, color: theme.accent, fontSize: 12, bold: true, align: "center" }),
    shape(`${id}-decision-note`, "roundRect", 9.32, 2.32, 2.88, 3.8, 50, theme.accentSoft, theme.line, { radius: 0.18 }),
    text(`${id}-decision-note-title`, "callout", topicLabel(intent.emphasis ?? intent.title), 9.66, 2.74, 2.18, 0.34, 51, theme, { bg: theme.accentSoft, color: theme.accent, fontSize: 21 }),
    text(`${id}-decision-note-body`, "body", visibleSentence(intent.message), 9.66, 3.52, 2.12, 1.34, 52, theme, { bg: theme.accentSoft, color: theme.text, fontSize: 16 })
  ];
  items.slice(0, 4).forEach((item, index) => {
    const positions = [[2.0, 4.95], [2.95, 3.95], [3.95, 4.6], [4.9, 3.6]] as const;
    const [x, y] = positions[index];
    const order = 20 + index * 4;
    elements.push(shape(`${id}-decision-point-${index}`, "ellipse", x, y, 0.3, 0.3, order, theme.accent, theme.accent));
    elements.push(text(`${id}-decision-point-label-${index}`, "caption", narrativeLabel(item, 12), x - 0.5, y + 0.34, 1.3, 0.24, order + 1, theme, { bg: theme.surface, color: theme.text, fontSize: 11, align: "center" }));
  });
  return elements;
}

function narrativeLayeredModel(theme: Theme, intent: SlideIntent, expressionPlan: ExpressionPlan): SlideElement[] {
  const id = intent.slideId;
  const items = narrativeItems(intent, 4, 6);
  const elements: SlideElement[] = [
    shape(`${id}-layer-stage`, "roundRect", 1.06, 2.0, 11.18, 4.72, 10, theme.surface, theme.line, { radius: 0.18 }),
    text(`${id}-layer-grammar`, "caption", visualKickerLabel(intent), 1.42, 2.26, 3.7, 0.18, 11, theme, { bg: theme.surface, color: theme.accent, fontSize: 12, bold: true })
  ];
  items.forEach((item, index) => {
    const y = 5.66 - index * 0.58;
    const x = 2.0 + index * 0.28;
    const w = 8.72 - index * 0.56;
    const order = 20 + index * 4;
    const fill = index === items.length - 1 ? theme.accent : index % 2 === 0 ? theme.accentSoft : theme.background;
    elements.push(shape(`${id}-layer-${index}`, "roundRect", x, y, w, 0.42, order, fill, theme.line, { radius: 0.12 }));
    elements.push(text(`${id}-layer-label-${index}`, "caption", item, x + 0.24, y + 0.12, w - 0.48, 0.12, order + 1, theme, { bg: fill, color: fill === theme.accent ? theme.inkOnAccent : theme.text, fontSize: 12, bold: true, align: "center" }));
  });
  elements.push(text(`${id}-layer-message`, "body", visibleSentence(intent.message), 8.98, 2.86, 2.56, 1.24, 60, theme, { bg: theme.surface, color: theme.text, fontSize: 17 }));
  return elements;
}

function narrativeDetailPage(theme: Theme, intent: SlideIntent, expressionPlan: ExpressionPlan): SlideElement[] {
  const id = intent.slideId;
  const items = narrativeItems(intent, 4, 6);
  const elements: SlideElement[] = [
    shape(`${id}-detail-page`, "roundRect", 0.92, 1.96, 11.48, 4.88, 10, theme.surface, theme.line, { radius: 0.16 }),
    text(`${id}-detail-grammar`, "caption", visualKickerLabel(intent), 1.28, 2.26, 3.4, 0.18, 11, theme, { bg: theme.surface, color: theme.accent, fontSize: 12, bold: true }),
    text(`${id}-detail-lead`, "body", visibleSentence(intent.message), 1.28, 2.72, 10.32, 0.54, 12, theme, { bg: theme.surface, color: theme.text, fontSize: 18 })
  ];
  items.forEach((item, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 1.28 + column * 5.34;
    const y = 3.62 + row * 0.82;
    const order = 20 + index * 4;
    elements.push(shape(`${id}-detail-marker-${index}`, "rect", x, y + 0.04, 0.08, 0.38, order, theme.accent, theme.accent, { radius: 0 }));
    elements.push(text(`${id}-detail-item-${index}`, "body", visibleSentence(item), x + 0.28, y, 4.58, 0.34, order + 1, theme, { bg: theme.surface, color: theme.text, fontSize: 15 }));
  });
  return elements;
}

function narrativePhotoAnchor(theme: Theme, intent: SlideIntent, expressionPlan: ExpressionPlan): SlideElement[] {
  const id = intent.slideId;
  return [
    shape(`${id}-photo-stage`, "roundRect", 0.92, 1.96, 6.1, 4.88, 10, theme.accentSoft, theme.line, { radius: 0.2 }),
    visualAssetElement(intent.visualAsset, theme, intent, `${id}-photo-anchor`, 1.18, 2.24, 5.58, 3.92, 11),
    shape(`${id}-photo-caption`, "roundRect", 1.32, 5.92, 5.28, 0.42, 12, theme.surface, theme.line, { radius: 0.14, fillOpacity: 0.94 }),
    text(`${id}-photo-caption-text`, "caption", visualKickerLabel(intent), 1.58, 6.05, 4.76, 0.14, 13, theme, { bg: theme.surface, color: theme.accent, fontSize: 12, bold: true, align: "center" }),
    shape(`${id}-photo-message-panel`, "roundRect", 7.52, 2.28, 4.42, 3.88, 20, theme.surface, theme.line, { radius: 0.18 }),
    text(`${id}-photo-message-title`, "callout", topicLabel(intent.emphasis ?? intent.title), 7.92, 2.74, 3.54, 0.42, 21, theme, { bg: theme.surface, color: theme.accent, fontSize: 22 }),
    text(`${id}-photo-message-body`, "body", visibleSentence(intent.message), 7.92, 3.52, 3.42, 1.14, 22, theme, { bg: theme.surface, color: theme.text, fontSize: 18 }),
    text(`${id}-photo-message-proof`, "caption", narrativeItems(intent, 1, 1)[0] ?? intent.title, 7.92, 5.08, 3.38, 0.24, 23, theme, { bg: theme.surface, color: theme.mutedText, fontSize: 13 })
  ];
}

function narrativeTableTextSystem(theme: Theme, intent: SlideIntent, expressionPlan: ExpressionPlan): SlideElement[] {
  const id = intent.slideId;
  const items = narrativeItems(intent, 4, 7, 34);
  const elements: SlideElement[] = [
    shape(`${id}-table-stage`, "roundRect", 0.96, 2.02, 11.42, 4.62, 10, theme.surface, theme.line, { radius: 0.16 }),
    shape(`${id}-table-header`, "rect", 0.96, 2.02, 11.42, 0.58, 11, theme.accent, theme.accent, { radius: 0 }),
    text(`${id}-table-header-text`, "caption", visualKickerLabel(intent), 1.28, 2.22, 10.8, 0.14, 12, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 12, bold: true })
  ];
  items.forEach((item, index) => {
    const y = 2.86 + index * 0.48;
    const fill = index % 2 === 0 ? theme.background : theme.surface;
    const order = 20 + index * 4;
    elements.push(shape(`${id}-table-row-${index}`, "rect", 1.18, y, 10.98, 0.38, order, fill, fill, { radius: 0 }));
    elements.push(text(`${id}-table-row-index-${index}`, "caption", String(index + 1).padStart(2, "0"), 1.42, y + 0.11, 0.42, 0.12, order + 1, theme, { bg: fill, color: theme.accent, fontSize: 11, bold: true }));
    elements.push(text(`${id}-table-row-text-${index}`, "body", item, 2.1, y + 0.07, 9.18, 0.18, order + 2, theme, { bg: fill, color: theme.text, fontSize: 14 }));
  });
  return elements;
}

function narrativeSpatialModel(theme: Theme, intent: SlideIntent, expressionPlan: ExpressionPlan): SlideElement[] {
  const id = intent.slideId;
  const items = narrativeItems(intent, 4, 5);
  const elements: SlideElement[] = [
    shape(`${id}-spatial-stage`, "roundRect", 0.94, 1.96, 11.46, 4.9, 10, theme.surface, theme.line, { radius: 0.18 }),
    text(`${id}-spatial-grammar`, "caption", visualKickerLabel(intent), 1.26, 2.24, 3.3, 0.18, 11, theme, { bg: theme.surface, color: theme.accent, fontSize: 12, bold: true }),
    shape(`${id}-spatial-path`, "line", 2.0, 5.72, 8.1, -2.72, 12, "none", theme.accent, { width: 1.2, endArrow: true }),
    shape(`${id}-spatial-focus`, "roundRect", 5.02, 3.16, 2.32, 0.78, 13, theme.accentSoft, theme.accent, { radius: 0.18 }),
    text(`${id}-spatial-focus-text`, "caption", topicLabel(intent.emphasis ?? intent.title), 5.14, 3.4, 2.08, 0.3, 14, theme, { bg: theme.accentSoft, color: theme.accent, fontSize: 12, bold: true, align: "center", valign: "middle" })
  ];
  const positions = [[1.72, 5.42], [3.62, 4.64], [5.52, 3.82], [7.42, 3.06], [9.32, 2.52]] as const;
  items.forEach((item, index) => {
    const [x, y] = positions[index];
    const order = 20 + index * 4;
    elements.push(shape(`${id}-spatial-node-${index}`, "ellipse", x, y, 0.42, 0.42, order, theme.accent, theme.accent));
    elements.push(text(`${id}-spatial-label-${index}`, "caption", narrativeLabel(item, 20), x - 0.78, y + 0.56, 2.16, 0.4, order + 1, theme, { bg: theme.surface, color: theme.text, fontSize: 12, align: "center" }));
  });
  return elements;
}

function renderAuthoredDiagram(theme: Theme, intent: SlideIntent, renderer?: NarrativeDiagramRenderer): SlideElement[] | null {
  if (!intent.diagram || !renderer) return null;
  const summary = (intent.emphasis ?? intent.message).trim() || intent.title;
  const longDescriptionRaw = [intent.message, ...intent.evidence].filter(Boolean).join(" ").trim();
  const longDescription = longDescriptionRaw.length >= 20 ? longDescriptionRaw : `${intent.title}: ${summary} ${longDescriptionRaw}`.trim();
  const rendered = renderer({
    idPrefix: `${intent.slideId}-dg`,
    title: slideTopicTitle(intent),
    summary,
    longDescription,
    frame: { x: 0.92, y: 1.98, w: 11.48, h: 4.82 },
    readingOrderStart: 20,
    accent: theme.accent,
    diagram: intent.diagram
  });
  return rendered && rendered.length > 0 ? rendered : null;
}

function narrativeElementsForIntent(theme: Theme, intent: SlideIntent, expressionPlan: ExpressionPlan, _layoutPlan: LayoutPlan, locale: Locale): SlideElement[] {
  switch (expressionPlan.selectedGrammarId) {
    case "typographic-emphasis":
      return narrativeTypographic(theme, intent, expressionPlan);
    case "spatial-model":
      return narrativeSpatialModel(theme, intent, expressionPlan);
    case "comparison-field":
      return narrativeComparisonField(theme, intent, expressionPlan);
    case "sequential-path":
      return narrativeSequentialPath(theme, intent, expressionPlan);
    case "layered-model":
      return narrativeLayeredModel(theme, intent, expressionPlan);
    case "decision-surface":
      return narrativeDecisionSurface(theme, intent, expressionPlan);
    case "detail-reading-page":
      return narrativeDetailPage(theme, intent, expressionPlan);
    case "photo-product-anchor":
      return narrativePhotoAnchor(theme, intent, expressionPlan);
    case "table-text-system":
      return narrativeTableTextSystem(theme, intent, expressionPlan);
    case "evidence-board":
    default:
      return narrativeEvidenceBoard(theme, intent, expressionPlan);
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
      shape("cover-audience-chip", "roundRect", 0.82, 4.95, 2.68, 0.4, 11, theme.accentSoft, theme.line, { radius: 0.14 }),
      text("cover-audience-chip-text", "caption", audienceChipLabel(messageMap), 1.02, 5.06, 2.28, 0.16, 12, theme, { bg: theme.accentSoft, color: theme.accent, fontSize: 12, bold: true, align: "center" }),
      shape("cover-action-chip", "roundRect", 3.72, 4.95, 2.84, 0.4, 13, theme.surface, theme.line, { radius: 0.14 }),
      text("cover-action-chip-text", "caption", actionChipLabel(messageMap), 3.92, 5.06, 2.44, 0.16, 14, theme, { bg: theme.surface, color: theme.accent, fontSize: 12, bold: true, align: "center" }),
      text("cover-action", "callout", messageMap.desiredAction ?? "次の判断へ進む", 0.8, 5.62, 5.55, 0.54, 15, theme, { color: theme.accent, fontSize: 21 })
    ]
  };
}

function createClosing(theme: Theme, messageMap: DeckMessageMap): Slide {
  const action = messageMap.desiredAction ?? "次に確認する";
  const isJapanese = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(action);
  const title = isJapanese ? "実行確認" : "Action check";
  const checklist = closingChecklist(messageMap);
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
      text("closing-body", "body", "会議後に迷わないよう、担当・期限・確認物をこの場で揃えます。", 0.9, 4.18, 9.5, 0.52, 5, theme, {
        bg: theme.accent,
        color: theme.inkOnAccent,
        fontSize: 20
      }),
      ...checklist.flatMap((item, index) => {
        const x = 0.9 + index * 3.82;
        const order = 10 + index * 5;
        return [
          shape(`closing-check-${index}`, "roundRect", x, 5.18, 3.42, 1.18, order, theme.inkOnAccent, theme.inkOnAccent, { radius: 0.18, fillOpacity: 0.18 }),
          shape(`closing-marker-${index}`, "rect", x, 5.18, 0.12, 1.18, order + 1, theme.inkOnAccent, theme.inkOnAccent, { radius: 0 }),
          icon(`closing-check-icon-${index}`, item.icon, x + 0.36, 5.46, 0.38, order + 2, theme, { color: theme.inkOnAccent, decorative: true }),
          text(`closing-check-label-${index}`, "caption", item.label, x + 0.92, 5.38, 1.8, 0.2, order + 3, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 13, bold: true }),
          text(`closing-check-value-${index}`, "caption", item.value, x + 0.92, 5.72, 2.08, 0.24, order + 4, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 14, bold: true })
        ];
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
  const narrativeArtifacts = options.planningMode === "narrative-v1"
    ? createNarrativePlanArtifacts(messageMap, { title: options.title, locale, contentMode })
    : undefined;
  const slides: Slide[] = [];
  if (options.includeCover !== false) {
    slides.push(createCover(theme, options.title, messageMap));
  }

  messageMap.intents.forEach((intent, index) => {
    if (narrativeArtifacts) {
      const expressionPlan = narrativeArtifacts.expressionPlans[index];
      const layoutPlan = narrativeArtifacts.layoutPlans[index];
      const authoredDiagram = renderAuthoredDiagram(theme, intent, options.diagramRenderer);
      const elements = authoredDiagram ?? narrativeElementsForIntent(theme, intent, expressionPlan, layoutPlan, locale);
      slides.push(narrativeSlideShell(theme, intent, elements, expressionPlan, index));
      return;
    }
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
      keywords: [...(options.keywords ?? []), "message-map", "generated", styleProfile, ...(narrativeArtifacts ? ["narrative-v1"] : [])],
      contentMode,
      messageMap,
      sources: options.sources ?? []
    },
    slides
  };

  return normalizeDeckLayout(deck);
}
