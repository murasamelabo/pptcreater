import { defaultTokens } from "./color.js";
import { estimateTextOverflow, normalizeDeckLayout } from "./layout.js";
import { reviewDeck } from "./director.js";
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
  PptxSlideTextReplacement,
  PptxSlideNodeGroup,
  PptxSlideNodeOperation,
  PptxSlideColorReplacement,
  TextElement
} from "./schema.js";
import { reviewSlideQuality } from "./slideQualityReview.js";
import { reviewVisualQuality } from "./visualQuality.js";
import {
  createNarrativePlanArtifacts,
  type ExpressionCandidate,
  type ExpressionCandidateSet,
  type ExpressionPlan,
  type LayoutPlan,
  type PlanningMode
} from "./narrativePlanning.js";
import { getTemplate, recommendTemplateForContentMode, styleProfileTokens, templateForStyleProfile, type StyleProfile } from "./templates.js";
import type { VisualGrammarId } from "./visualGrammarRegistry.js";

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

export type NarrativeDesignComponentRequest = {
  idPrefix: string;
  title: string;
  slideIndex: number;
  accent: string;
  intent: SlideIntent;
  expressionPlan: ExpressionPlan;
  layoutPlan: LayoutPlan;
  locale: Locale;
  readingOrderStart: number;
};

export type NarrativeDesignComponentResponse = {
  componentId: string;
  componentName: string;
  templatePath: string;
  sourceSlideIndex: number;
  textReplacements?: PptxSlideTextReplacement[];
  nodeGroups?: PptxSlideNodeGroup[];
  nodeOperations?: PptxSlideNodeOperation[];
  recolor?: PptxSlideColorReplacement[];
  summary: string;
  longDescription: string;
};

export type NarrativeDesignComponentRenderer = (request: NarrativeDesignComponentRequest) => NarrativeDesignComponentResponse | null;

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
  expressionGrammarOverrides?: Record<string, { candidateId: string; grammarId: VisualGrammarId }>;
  diagramRenderer?: NarrativeDiagramRenderer;
  designComponentRenderer?: NarrativeDesignComponentRenderer;
};

export type MaterializedExpressionCandidateDeck = {
  slideId: string;
  candidateId: string;
  grammarId: VisualGrammarId;
  deck: DeckSpec;
  evaluation: {
    accuracy: number;
    clarity: number;
    beauty: number;
    total: number;
    accuracyGatePassed: boolean;
    reviewEvidence: {
      blockingCount: number;
      polishFixableCount: number;
      visualErrorCount: number;
      visualWarningCount: number;
      qualityOverall: number;
    };
  };
};

export type MaterializedExpressionCandidateResult = {
  slideId: string;
  selectionPolicy: ExpressionCandidateSet["selectionPolicy"];
  selectedCandidateId: string;
  planningCandidateSet: ExpressionCandidateSet;
  candidateDecks: MaterializedExpressionCandidateDeck[];
};

export type MaterializeExpressionCandidateOptions = Omit<
  CreateDeckFromMessageMapOptions,
  "includeCover" | "includeClosing" | "expressionGrammarOverrides"
> & {
  slideId?: string;
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
  options: { width?: number; radius?: number; fillOpacity?: number; beginArrow?: boolean; endArrow?: boolean } = {}
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
      beginArrowType: options.beginArrow ? "triangle" : undefined,
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

  if (/\b(?:OBO|ID-JAG|XAA|JWT|API|MCP|IdP)\b/u.test(normalized) && /(?:と|vs|VS|比較|対比)/u.test(normalized)) {
    return compactLabel(normalized, 22);
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

function matrixPointLabel(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (/アプリ間連携|集中ビュー/u.test(text)) return "集中ビュー";
  if (/このClient|Client.*Resource App|クライアント.*リソース/u.test(text)) return "Client確認";
  if (/セキュリティチーム|許可\/拒否|許可|拒否/u.test(text)) return "許可/拒否";
  if (/短命|自動失効|クレデンシャル/u.test(text)) return "短命認証";
  if (/監査|誰がいつ/u.test(text)) return "監査証跡";
  if (/キルスイッチ|即時失効/u.test(text)) return "即時失効";
  if (/confidential client|コンフィデンシャルクライアント/iu.test(text)) return "機密Client";
  if (/insufficient_user_authentication|認証文脈不足/u.test(text)) return "認証不足";
  if (/audience-bound|aud.*token endpoint|aud固定/u.test(text)) return "aud固定";
  if (/自分のID-JAG|redeem/u.test(text)) return "自己redeem禁止";
  if (/JWKS|署名検証/u.test(text)) return "JWKS検証";
  if (/接続可否|接続してよい/u.test(text)) return "接続可否";
  if (/scope|スコープ|最小権限/u.test(text)) return "最小scope";
  if (/MFA|step-up|ステップアップ/u.test(text)) return "MFA条件";
  if (/グループ/u.test(text)) return "許可グループ";
  const cleaned = narrativeLabel(text, 14).replace(/…$/u, "");
  return cleaned || text;
}

function matrixPointScore(value: string, index: number): { x: number; y: number } {
  const text = value.replace(/\s+/g, " ").trim();
  const fallback = [
    { x: 0.22, y: 0.18 },
    { x: 0.42, y: 0.72 },
    { x: 0.68, y: 0.34 },
    { x: 0.82, y: 0.82 },
    { x: 0.58, y: 0.58 },
    { x: 0.32, y: 0.46 }
  ];
  const score = { ...(fallback[index] ?? fallback[fallback.length - 1]) };

  if (/低負荷|低コスト|低費用|低リスク|リスク\s*低|分散リスク\s*低/u.test(text)) score.x = 0.82;
  if (/高負荷|高コスト|高費用|高リスク|リスク\s*高/u.test(text)) score.x = 0.22;
  if (/短命|aud固定|集中|最小|監査|失効|許可|MFA|step-up|JWKS|検証|機密|confidential/iu.test(text)) score.x = Math.max(score.x, 0.72);
  if (/長命|分散|過剰|認証不足|insufficient_user_authentication/u.test(text)) score.x = Math.min(score.x, 0.35);

  if (/高統制|高保護|統制\s*高|保護\s*高/u.test(text)) score.y = 0.84;
  if (/低統制|低保護|統制\s*低|保護\s*低/u.test(text)) score.y = 0.22;
  if (/集中|許可|監査|失効|短命|MFA|step-up|JWKS|検証|機密|confidential|aud固定|最小/u.test(text)) score.y = Math.max(score.y, 0.72);
  if (/長命|分散|過剰|不足|弱い/u.test(text)) score.y = Math.min(score.y, 0.35);

  return score;
}

function matrixPointPosition(value: string, index: number, frame: { x: number; y: number; w: number; h: number }): [number, number] {
  const score = matrixPointScore(value, index);
  return [frame.x + score.x * frame.w, frame.y + (1 - score.y) * frame.h];
}

function technicalTermLabel(value: string): string | undefined {
  const text = value.replace(/\s+/g, " ").trim();
  if (/ID Token.*ID-JAG.*(?:アクセストークン|Access Token)/iu.test(text)) return "ID Token→ID-JAG→Access Token";
  if (/OAuth Token Exchange/i.test(text)) return "Token ExchangeでID-JAGを要求";
  if (/JWT Bearer/i.test(text)) return "JWT Bearerで受け渡す";
  if (/ID-JAG/i.test(text) && /XAA/i.test(text)) return "ID-JAG/XAAを軸に整理";
  if (/MCP/i.test(text) && /AI/i.test(text)) return "AI/MCP委任に適合";
  return undefined;
}

function polishJapaneseFragment(value: string): string {
  return value.replace(/拡張し$/u, "拡張").replace(/担い$/u, "担う").replace(/適合し$/u, "適合").replace(/交換し$/u, "交換する");
}

function visibleSentence(value: string): string {
  const text = polishJapaneseFragment(technicalTermLabel(value) ?? value.trim());
  if (!text) return text;
  if (/^(対象|観点|表現|口調|材料|読み手|行動|トーン)\s*[:：]/u.test(text) || /[:：]/.test(text) || /[、/／]/.test(text) || text.length <= 18) {
    return text;
  }
  if (!hasJapanese(text) && hasCodeToken(text)) {
    return text;
  }
  if (/[。.!?！？]$/u.test(text) || /(する|した|できる|ある|いる|なる|進める|示す|伝える|確認する|選ぶ)$/u.test(text)) {
    return text;
  }
  return hasJapanese(text) ? `${text}。` : text;
}

function leadSentence(value: string, maxLength = 54): string {
  const text = polishJapaneseFragment(technicalTermLabel(value) ?? value.replace(/\s+/g, " ").trim());
  if (text.length <= maxLength) return visibleSentence(text);
  const first = text.split(/[。；;\n]/u)[0]?.trim() || text;
  if (first.length <= maxLength) return visibleSentence(first);
  return visibleSentence(Array.from(first).slice(0, maxLength).join(""));
}

function isGenericSlideTitle(value: string): boolean {
  return /^(?:要約|まとめ|結論|概要|サマリー|summary|recap|conclusion)$/iu.test(value.trim());
}

function isThinTopicTitle(value: string): boolean {
  return /^(?:全体像|全体フロー|登場ロール|用語整理|基本概念|必要な統制|導入評価|セキュリティ要点|Resource側検証|Token Exchange|ID-JAG JWT)$/iu.test(value.trim());
}

function contextualTopicTitle(intent: SlideIntent): string | undefined {
  const title = intent.title.trim();
  const context = [intent.title, intent.message, intent.emphasis, ...intent.evidence, ...(intent.details ?? [])].filter(Boolean).join(" ");
  if (!/XAA|ID-JAG|OBO|Token Exchange|JWT|MCP|IdP/u.test(context)) return undefined;
  if (/^全体像$/u.test(title)) return "XAA/ID-JAGの全体像";
  if (/^全体フロー$/u.test(title)) return "ID-JAG交換フロー";
  if (/^登場ロール$/u.test(title)) return "XAA登場ロール";
  if (/^用語整理$/u.test(title)) return "XAA/ID-JAG用語整理";
  if (/^基本概念$/u.test(title)) return "XAA基本概念";
  if (/^必要な統制$/u.test(title)) return "XAA統制要件";
  if (/^導入評価$/u.test(title)) return "XAA導入評価";
  return undefined;
}

function slideMessageText(intent: SlideIntent): string {
  const source = isGenericSlideTitle(intent.title) || isThinTopicTitle(intent.title) ? intent.message : intent.emphasis ?? intent.message;
  const first = source.replace(/\s+/g, " ").replace(/。$/u, "").split(/[。；;\n]/u)[0]?.trim() || source.trim();
  if (first.length <= 44) return first;
  return leadSentence(first, hasJapanese(first) ? 38 : 44).replace(/。$/u, "");
}

function intentBadgeText(intent: SlideIntent): string {
  const context = [intent.slideId, intent.title, intent.message, intent.emphasis, ...intent.evidence].filter(Boolean).join(" ");
  if (/AI|MCP/u.test(context)) return "AI";
  if (/ID-JAG/u.test(context)) return "ID";
  if (/XAA/u.test(context)) return "XAA";
  if (/IdP|ポリシー/u.test(context)) return "ID";
  if (/JWT/u.test(context)) return "JWT";
  if (/API/u.test(context)) return "API";
  if (/OBO/u.test(context)) return "OBO";
  if (intent.visualType === "summary") return "要約";
  if (intent.visualType === "step" || intent.visualType === "flow") return "STEP";
  if (intent.visualType === "matrix") return "評価";
  if (intent.visualType === "contrast") return "比較";
  return "KEY";
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
      intent.details?.length ? `Details: ${intent.details.join(" / ")}` : "",
      intent.quietInfo.length ? `Quiet info: ${intent.quietInfo.join(" / ")}` : ""
      , intent.sourceTrace?.length ? `Source trace: ${intent.sourceTrace.join(" / ")}` : ""
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
  if (isGenericSlideTitle(normalized)) {
    return compactLabel(intent.emphasis ?? intent.message, hasJapanese(intent.emphasis ?? intent.message) ? 14 : 22);
  }
  const contextual = contextualTopicTitle(intent);
  if (contextual) return contextual;
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
  const axisLabels = matrixAxisLabels(intent);
  const elements: SlideElement[] = [
    shape(`${id}-matrix-bg`, "roundRect", 1.0, 1.95, 7.2, 4.8, 10, theme.surface, theme.line, { radius: 0.18 }),
    shape(`${id}-decision-zone`, "roundRect", 4.88, 2.88, 2.28, 0.86, 11, theme.accentSoft, theme.accent, { radius: 0.16, fillOpacity: 0.95 }),
    shape(`${id}-axis-x-line`, "line", 1.55, 4.45, 5.95, 0, 12, "none", theme.line, { width: 1.2, endArrow: true }),
    shape(`${id}-axis-y-line`, "line", 4.55, 2.7, 0.001, 3.45, 13, "none", theme.line, { width: 1.2, beginArrow: true }),
    text(`${id}-axis-x-label`, "caption", axisLabels.x, 6.88, 4.78, 1.55, 0.2, 14, theme, { bg: theme.background, color: theme.mutedText, fontSize: 12, align: "right" }),
    text(`${id}-axis-y-label`, "caption", axisLabels.y, 3.65, 2.32, 1.75, 0.2, 15, theme, { bg: theme.surface, color: theme.mutedText, fontSize: 12, align: "center" }),
    text(`${id}-decision-zone-text`, "caption", decisionEmphasisLabel(intent), 5.1, 3.18, 1.84, 0.18, 16, theme, { bg: theme.accentSoft, color: theme.accent, fontSize: 12, bold: true, align: "center" }),
    shape(`${id}-insight`, "roundRect", 8.42, 2.18, 3.82, 3.95, 50, theme.accentSoft, theme.line, { radius: 0.18 }),
    icon(`${id}-insight-icon`, "scale", 8.92, 2.42, 0.42, 50, theme, { color: theme.accent, decorative: true }),
    text(`${id}-insight-title`, "callout", calloutLabel(topicLabel(intent.emphasis ?? "判断軸")), 9.48, 2.5, 2.42, 0.32, 51, theme, { bg: theme.accentSoft, color: theme.accent, fontSize: 21 }),
    text(`${id}-insight-body`, "body", visibleSentence(intent.message), 8.78, 3.24, 3.14, 2.0, 52, theme, { bg: theme.accentSoft, color: theme.text, fontSize: 16 })
  ];
  items.forEach((item, index) => {
    const [x, y] = matrixPointPosition(item, index, { x: 1.82, y: 3.0, w: 4.95, h: 2.18 });
    elements.push(shape(`${id}-point-${index}`, "ellipse", x, y, 0.32, 0.32, 20 + index * 3, theme.accent, theme.accent));
    elements.push(text(`${id}-point-label-${index}`, "caption", matrixPointLabel(item), x + 0.4, y - 0.1, 2.18, 0.48, 21 + index * 3, theme, { bg: theme.surface, fontSize: 12, color: theme.text }));
  });
  return elements;
}

function matrixAxisLabels(intent: SlideIntent): { x: string; y: string } {
  const context = [intent.title, intent.message, intent.emphasis, ...intent.evidence, ...(intent.details ?? [])].join(" ");
  if (/統制|ポリシー|監査|失効|集中/u.test(context)) return { x: "分散リスク 低", y: "統制強度 高" };
  if (/セキュリティ|短命|aud|JWT|confidential|認証|検証|JWKS/u.test(context)) return { x: "リスク 低", y: "保護強度 高" };
  return { x: "実装負荷 低", y: "適合度 高" };
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

function ownsFullSlideCanvas(elements: SlideElement[]): boolean {
  const first = elements[0];
  return Boolean(
    (elements.length === 1 && first?.type === "pptxSlide" && first.x === 0 && first.y === 0 && first.w >= W && first.h >= H) ||
      (first?.type === "shape" && first.shape === "rect" && first.x === 0 && first.y === 0 && first.w >= W && first.h >= H && /-report-bg$/u.test(first.id))
  );
}

function narrativeSlideShell(theme: Theme, intent: SlideIntent, elements: SlideElement[], expressionPlan: ExpressionPlan, index: number): Slide {
  const id = intent.slideId;
  const title = slideTopicTitle(intent);
  const fullSlideComponent = ownsFullSlideCanvas(elements);
  const slideNumber = `SLIDE ${String(index + 1).padStart(2, "0")}`;
  const showHeaderMessage = expressionPlan.selectedGrammarId !== "detail-reading-page";
  return {
    id,
    title,
    layout: `message-grammar-${expressionPlan.selectedGrammarId}`,
    background: { color: theme.background },
    speakerNotes: [
      `Message: ${intent.message}`,
      intent.evidence.length ? `Evidence: ${intent.evidence.join(" / ")}` : "",
      intent.details?.length ? `Details: ${intent.details.join(" / ")}` : "",
      `Expression: ${expressionPlan.selectedGrammarId}`,
      `Rationale: ${expressionPlan.rationale}`,
      intent.quietInfo.length ? `Quiet info: ${intent.quietInfo.join(" / ")}` : "",
      intent.sourceTrace?.length ? `Source trace: ${intent.sourceTrace.join(" / ")}` : ""
    ]
      .filter(Boolean)
      .join("\n"),
    elements: fullSlideComponent
      ? elements
      : [
          shape(`${id}-canvas`, "rect", 0, 0, W, H, 0, theme.background, theme.background, { radius: 0 }),
          text(`${id}-eyebrow`, "caption", slideNumber, 0.7, 0.38, 1.68, 0.25, 1, theme, {
            color: theme.accent,
            bg: theme.background,
            fontSize: 12,
            bold: true
          }),
          shape(`${id}-header-badge`, "roundRect", 0.72, 0.82, 0.76, 0.46, 2, theme.accent, theme.accent, { radius: 0.12 }),
          text(`${id}-header-badge-text`, "caption", intentBadgeText(intent), 0.8, 0.94, 0.6, 0.18, 3, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 12, bold: true, align: "center", valign: "middle" }),
          text(`${id}-title`, "title", title, 1.66, 0.72, 3.46, 0.62, 4, theme, { fontSize: 26 }),
          ...(showHeaderMessage ? [text(`${id}-message`, "subtitle", slideMessageText(intent), 5.22, 0.72, 7.12, 0.68, 5, theme, { color: theme.text, fontSize: 21 })] : []),
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

function isContextEvidenceRow(value: string): boolean {
  return /^(?:確認対象|理解対象|入力値|処理値|入力契約|返却項目|判定先|設定ファイル|運用キー|運用対象|制約確認|通信前提|移行前提|方式判定|連携設計|移行判断|返却と権限|提供範囲|接続先|照会先)\s*[:：]/u.test(value);
}

function narrativeItems(intent: SlideIntent, min = 3, max = 6, labelMax = 26): string[] {
  const values = intent.evidence.map((item) => (isContextEvidenceRow(item) ? compactLabel(item, 58) : narrativeLabel(item, labelMax))).filter(Boolean);
  while (values.length < min) values.push(narrativeLabel(intent.emphasis ?? intent.message, labelMax));
  return values.slice(0, max);
}

function splitKeyValue(value: string): { key: string; value: string } | null {
  const match = /^\s*([^:=：]+?)\s*(?:=|:|：)\s*(.+?)\s*$/u.exec(value);
  if (!match) return null;
  return { key: match[1].trim(), value: match[2].trim() };
}

function tableBodyText(value: string): string {
  const text = value.trim();
  if (!text || hasJapanese(text) || hasCodeToken(text)) return visibleSentence(text);
  return /[.!?]$/u.test(text) ? text : `${text}.`;
}

function splitTableEvidence(value: string, index: number): { label: string; body: string } {
  const text = value.replace(/\s+/g, " ").trim();
  const patterns = [
    /^(.{2,26}?)(?:では、?|には、?)(.+)$/u,
    /^(.{2,24}?)(?:は|が|を)(.+)$/u,
    /^(.{2,24}?)(?:と|から(?!の))(.+)$/u,
    /^(.{2,36}?)(?:\s+(?:is|are|has|have|requires|enables|causes|creates|uses)\s+)(.+)$/iu
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const label = match[1]?.replace(/[、,，・／/\s]+$/u, "").trim();
    const body = match[2]?.replace(/^[、,，・／/\s]+/u, "").trim();
    if (label && body && label !== body) {
      return { label: narrativeLabel(label, 22), body: tableBodyText(body) };
    }
  }
  return { label: `${hasJapanese(text) ? "観点" : "Point"} ${String(index + 1).padStart(2, "0")}`, body: tableBodyText(text) };
}

function tableRowsForIntent(intent: SlideIntent): Array<{ label: string; body: string }> {
  const detailByKey = new Map<string, string>();
  const parsedDetails: Array<{ key: string; value: string }> = [];
  for (const detail of intent.details ?? []) {
    const parsed = splitKeyValue(detail);
    if (parsed) {
      detailByKey.set(parsed.key.toLowerCase(), parsed.value);
      parsedDetails.push(parsed);
    }
  }
  const source = intent.evidence.length ? intent.evidence : intent.details ?? [];
  const rows = source.slice(0, 6).map((item, index) => {
    const parsed = splitKeyValue(item);
    if (parsed) {
      const body = detailByKey.get(parsed.key.toLowerCase()) ?? parsed.value;
      return {
        label: narrativeLabel(parsed.key, 22),
        body: body.trim() === parsed.key.trim() ? visibleSentence(intent.message) : visibleSentence(body)
      };
    }
    const matchingParsedDetail = parsedDetails.find((detail) => item.includes(detail.key));
    if (matchingParsedDetail) {
      return { label: narrativeLabel(matchingParsedDetail.key, 22), body: tableBodyText(matchingParsedDetail.value) };
    }
    const positionalDetail = intent.details?.[index]?.trim();
    const positionalDetailLength = Array.from(positionalDetail ?? "").length;
    const itemLength = Array.from(item).length;
    if (positionalDetail && !splitKeyValue(positionalDetail) && positionalDetail !== item && positionalDetailLength <= 32 && positionalDetailLength <= itemLength + 8) {
      return { label: narrativeLabel(positionalDetail, 24), body: tableBodyText(item) };
    }
    const matchingDetail = (intent.details ?? []).find((detail) => detail.includes(item.split(/[、・\s]/u)[0] ?? item));
    if (matchingDetail && matchingDetail !== item) {
      return { label: narrativeLabel(item, 24), body: tableBodyText(matchingDetail) };
    }
    return splitTableEvidence(item, index);
  });
  return rows.length ? rows : [{ label: narrativeLabel(intent.emphasis ?? intent.title, 24), body: visibleSentence(intent.message) }];
}

function tableHeaderText(intent: SlideIntent): string {
  const text = [intent.title, intent.message, intent.emphasis ?? ""].join(" ");
  if (/外部インターフェース|入力|パラメータ/u.test(text)) return "入力項目 / 内容";
  if (/返却形式|返却項目/u.test(text)) return "返却形式 / 内容";
  if (/認証結果コード|結果コード/u.test(text)) return "コード / 意味";
  if (/内部実装|設定ファイル|config/u.test(text)) return "設定ファイル / 役割";
  return hasJapanese(text) ? "項目 / 内容" : "Item / Detail";
}

function diagramLeadText(intent: SlideIntent): string {
  const message = slideMessageText(intent).replace(/。$/u, "");
  const lead = leadSentence(intent.message, 58).replace(/。$/u, "");
  if (lead === message) return "";
  return lead;
}

function shortStableId(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/gu, "-");
  const safe = /^[a-zA-Z0-9]/u.test(cleaned) ? cleaned : `d-${cleaned}`;
  const suffix = hash.toString(36).slice(0, 6);
  return safe.length > 47 ? `${safe.slice(0, 47)}-${suffix}` : safe;
}

function diagramIdPrefix(slideId: string): string {
  return `${shortStableId(slideId)}-dg`;
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
    const isRequiredTermRow = isContextEvidenceRow(item);
    elements.push(shape(`${id}-narrative-proof-${index}`, "roundRect", 7.08, y, 4.82, 0.55, order, fill, theme.line, { radius: 0.14 }));
    elements.push(icon(`${id}-narrative-proof-icon-${index}`, iconForEvidence(item, index), 7.3, y + 0.14, 0.26, order + 1, theme, { color: theme.accent, decorative: true }));
    elements.push(text(`${id}-narrative-proof-text-${index}`, "body", visibleSentence(item), 7.76, y + 0.09, 3.68, isRequiredTermRow ? 0.32 : 0.24, order + 2, theme, { bg: fill, color: theme.text, fontSize: isRequiredTermRow ? 12 : 15 }));
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
  const rowMode = Math.max(intent.evidence.length, 3) >= 5;
  const items = narrativeItems(intent, 3, 6, rowMode ? 52 : 18);
  const count = items.length;
  const stageX = 0.92;
  const stageW = 11.48;
  const elements: SlideElement[] = [
    shape(`${id}-path-stage`, "roundRect", stageX, 1.96, stageW, 4.98, 10, theme.surface, theme.line, { radius: 0.18 }),
    text(`${id}-path-kicker`, "caption", visualKickerLabel(intent), 1.26, 2.3, 3.4, 0.2, 11, theme, { bg: theme.surface, color: theme.accent, fontSize: 12, bold: true })
  ];
  if (rowMode) {
    const rowX = stageX + 0.5;
    const rowW = stageW - 1.0;
    const rowH = 0.62;
    const gapY = 0.08;
    const startY = 2.7;
    items.forEach((item, index) => {
      const y = startY + index * (rowH + gapY);
      const order = 20 + index * 5;
      const fill = index % 2 === 0 ? mix(theme.accent, theme.background, 0.95) : theme.surface;
      elements.push(shape(`${id}-path-row-${index}`, "roundRect", rowX, y, rowW, rowH, order, fill, theme.line, { radius: 0.13 }));
      elements.push(shape(`${id}-path-row-badge-${index}`, "ellipse", rowX + 0.22, y + 0.13, 0.32, 0.32, order + 1, theme.accent, theme.accent));
      elements.push(text(`${id}-path-row-number-${index}`, "caption", String(index + 1), rowX + 0.22, y + 0.22, 0.32, 0.14, order + 2, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 12, bold: true, align: "center", valign: "middle" }));
      elements.push(text(`${id}-path-row-label-${index}`, "body", item, rowX + 0.76, y + 0.12, rowW - 1.04, 0.34, order + 3, theme, { bg: fill, color: theme.text, fontSize: 18, bold: false }));
    });
    return elements;
  }
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
  const axisLabels = matrixAxisLabels(intent);
  const elements: SlideElement[] = [
    shape(`${id}-decision-stage`, "roundRect", 0.92, 1.96, 8.02, 4.86, 10, theme.surface, theme.line, { radius: 0.18 }),
    shape(`${id}-decision-x-axis`, "line", 1.62, 5.78, 6.52, 0, 12, "none", theme.accent, { width: 1.4, endArrow: true }),
    shape(`${id}-decision-y-axis`, "line", 1.62, 2.7, 0.001, 3.08, 13, "none", theme.accent, { width: 1.4, beginArrow: true }),
    shape(`${id}-decision-zone`, "roundRect", 5.62, 2.66, 1.9, 1.06, 14, theme.accentSoft, theme.accent, { radius: 0.18, fillOpacity: 0.88 }),
    text(`${id}-decision-zone-label`, "caption", decisionEmphasisLabel(intent), 5.82, 3.04, 1.5, 0.18, 15, theme, { bg: theme.accentSoft, color: theme.accent, fontSize: 12, bold: true, align: "center" }),
    text(`${id}-decision-x-axis-label`, "caption", axisLabels.x, 6.68, 5.98, 1.86, 0.18, 16, theme, { bg: theme.surface, color: theme.accent, fontSize: 12, bold: true, align: "right" }),
    text(`${id}-decision-y-axis-label`, "caption", axisLabels.y, 1.0, 2.34, 1.54, 0.18, 17, theme, { bg: theme.surface, color: theme.accent, fontSize: 12, bold: true, align: "center" }),
    shape(`${id}-decision-note`, "roundRect", 9.16, 2.14, 3.1, 4.12, 50, theme.accentSoft, theme.line, { radius: 0.18 }),
    text(`${id}-decision-note-title`, "callout", topicLabel(intent.emphasis ?? intent.title), 9.46, 2.54, 2.48, 0.34, 51, theme, { bg: theme.accentSoft, color: theme.accent, fontSize: 20 }),
    text(`${id}-decision-note-body`, "body", visibleSentence(intent.message), 9.46, 3.24, 2.42, 1.68, 52, theme, { bg: theme.accentSoft, color: theme.text, fontSize: 15 })
  ];
  items.slice(0, 4).forEach((item, index) => {
    const [x, y] = matrixPointPosition(item, index, { x: 1.95, y: 2.98, w: 4.95, h: 2.28 });
    const order = 20 + index * 4;
    elements.push(shape(`${id}-decision-point-${index}`, "ellipse", x, y, 0.3, 0.3, order, theme.accent, theme.accent));
    elements.push(text(`${id}-decision-point-label-${index}`, "caption", matrixPointLabel(item), x - 0.58, y + 0.34, 1.58, 0.34, order + 1, theme, { bg: theme.surface, color: theme.text, fontSize: 11, align: "center" }));
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

type DetailPageVariant = "reading-board" | "checklist" | "brief";

function detailPageVariant(intent: SlideIntent): DetailPageVariant {
  const text = [intent.slideId, intent.title, intent.message, intent.emphasis ?? "", ...intent.evidence, ...(intent.details ?? [])].join(" ");
  if (/キャッシュ|MemoryCache|Expiration/iu.test(text)) return "brief";
  if (/リスク|制約|確認事項|チェック|MFA|PCIDSS|ROPC|禁止|漏洩|risk|constraint|checklist/iu.test(text)) return "checklist";
  if (/仕様|契約|形式|項目|設定|キャッシュ|MemoryCache|Expiration|parameter|contract|spec|config/iu.test(text)) return "brief";
  return "reading-board";
}

function detailItemsForIntent(intent: SlideIntent, max = 4): string[] {
  return [
    ...(intent.details ?? []).map((item) => visibleSentence(item)),
    ...intent.evidence.map((item) => visibleSentence(item))
  ].slice(0, max);
}

function parsedDetailItem(item: string, index: number): { label: string; body: string } {
  const parsed = splitKeyValue(item);
  if (!parsed) return { label: `項目 ${index + 1}`, body: item };
  return { label: parsed.key.replace(/^補足\s+/u, ""), body: parsed.value };
}

function narrativeDetailPage(theme: Theme, intent: SlideIntent, expressionPlan: ExpressionPlan): SlideElement[] {
  const variant = detailPageVariant(intent);
  if (variant === "checklist") return narrativeDetailChecklist(theme, intent, expressionPlan);
  if (variant === "brief") return narrativeDetailBrief(theme, intent, expressionPlan);
  return narrativeDetailReadingBoard(theme, intent, expressionPlan);
}

function narrativeDetailReadingBoard(theme: Theme, intent: SlideIntent, expressionPlan: ExpressionPlan): SlideElement[] {
  const id = intent.slideId;
  const isJapanese = hasJapanese([intent.title, intent.message, intent.emphasis ?? "", ...intent.evidence, ...(intent.details ?? [])].join(" "));
  const details = intent.details ?? [];
  const recommendationDetail = details.find((item) => /^Recommendations?\s*[:：]/iu.test(item));
  const recommendations = (recommendationDetail ? recommendationDetail.replace(/^Recommendations?\s*[:：]\s*/iu, "") : intent.quietInfo.join(" / "))
    .split(/\s+[／/]\s+|\s*\/\s*|、|;|；/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
  const bodyItems = [
    ...details.filter((item) => item !== recommendationDetail).map((item) => visibleSentence(item)),
    ...intent.evidence.map((item) => visibleSentence(item))
  ].slice(0, 4);
  const quote = visibleSentence(intent.message).replace(/。$/u, "").replace(/優先的な対策が必要である/u, "優先対策が必要");
  const continuedLabel = isJapanese ? "説明メモ" : "Briefing notes";
  const recommendationsLabel = isJapanese ? "確認事項" : "Recommendations";
  const recText = (item: string): string => item.replace(/パッチを早く適用する/u, "パッチを早く適用").replace(/管理インターフェースを隔離する/u, "管理面を隔離").replace(/悪用後の振る舞いを検知する/u, "悪用後を検知");
  const elements: SlideElement[] = [
    shape(`${id}-report-frame`, "roundRect", 0.92, 1.9, 6.42, 4.92, 10, theme.surface, theme.line, { radius: 0.16 }),
    text(`${id}-report-kicker`, "caption", continuedLabel, 1.22, 2.16, 2.64, 0.18, 12, theme, { bg: theme.surface, color: theme.accent, fontSize: 12, bold: true }),
    text(`${id}-report-heading`, "callout", slideTopicTitle(intent), 1.22, 2.52, 4.9, 0.38, 13, theme, { bg: theme.surface, color: theme.accent, fontSize: 20 }),
    shape(`${id}-report-rule`, "rect", 1.22, 3.02, 5.58, 0.02, 14, theme.accent, theme.accent, { radius: 0 }),
    shape(`${id}-report-quote-panel`, "roundRect", 7.64, 1.9, 2.12, 4.92, 40, theme.accentSoft, theme.accent, { radius: 0.14, width: 0.9 }),
    text(`${id}-report-quote-mark`, "callout", "“", 7.76, 2.1, 0.42, 0.32, 41, theme, { bg: theme.accentSoft, color: theme.accent, fontSize: 24, bold: true }),
    text(`${id}-report-quote`, "callout", quote, 7.74, 2.62, 1.72, 2.2, 42, theme, { bg: theme.accentSoft, color: theme.text, fontSize: 17 }),
    shape(`${id}-report-rec-panel`, "roundRect", 9.92, 1.9, 2.98, 4.92, 50, mix(theme.accent, theme.background, 0.9), theme.accent, { radius: 0.14, width: 0.9 }),
    text(`${id}-report-rec-title`, "caption", recommendationsLabel, 10.1, 2.14, 2.38, 0.32, 51, theme, { bg: mix(theme.accent, theme.background, 0.9), color: theme.text, fontSize: 16, bold: true }),
    shape(`${id}-report-rec-rule`, "rect", 10.1, 2.58, 2.46, 0.02, 52, theme.text, theme.text, { radius: 0 })
  ];
  bodyItems.forEach((item, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 1.22 + column * 3.0;
    const y = 3.24 + row * 1.28;
    const order = 20 + index * 3;
    const parsed = splitKeyValue(item);
    const body = (parsed ? parsed.value : item).replace(/成功した悪用は管理者権限や横展開につながる/u, "成功した悪用は権限昇格・横展開を招く").replace(/管理者権限や横展開につながる/u, "権限昇格・横展開を招く").replace(/狙われやすい。/u, "狙われる。");
    elements.push(text(`${id}-report-body-${index}`, "body", body, x, y + (parsed ? 0.32 : 0), 2.58, parsed ? 0.72 : 0.96, order, theme, { bg: theme.surface, color: theme.mutedText, fontSize: 14 }));
    if (parsed) {
      const heading = parsed.key.replace(/^補足\s+/u, "");
      elements.push(text(`${id}-report-body-heading-${index}`, "caption", heading, x, y, 2.5, 0.18, order + 1, theme, { bg: theme.surface, color: theme.accent, fontSize: 12, bold: true }));
    }
  });
  recommendations.forEach((item, index) => {
    const y = 2.82 + index * 1.08;
    const order = 60 + index * 3;
    elements.push(text(`${id}-report-rec-heading-${index}`, "caption", recText(item), 10.1, y, 2.42, 0.22, order, theme, { bg: mix(theme.accent, theme.background, 0.9), color: theme.text, fontSize: 12, bold: true }));
    if (index < recommendations.length - 1) {
      elements.push(shape(`${id}-report-rec-sep-${index}`, "rect", 10.1, y + 0.74, 2.46, 0.01, order + 1, theme.line, theme.line, { radius: 0 }));
    }
  });
  return elements;
}

function narrativeDetailChecklist(theme: Theme, intent: SlideIntent, _expressionPlan: ExpressionPlan): SlideElement[] {
  const id = intent.slideId;
  const items = detailItemsForIntent(intent, 5).map(parsedDetailItem);
  const elements: SlideElement[] = [
    shape(`${id}-check-frame`, "roundRect", 0.92, 1.9, 8.28, 4.92, 10, theme.surface, theme.line, { radius: 0.16 }),
    text(`${id}-check-kicker`, "caption", "確認項目", 1.24, 2.16, 2.64, 0.18, 11, theme, { bg: theme.surface, color: theme.accent, fontSize: 12, bold: true }),
    text(`${id}-check-heading`, "callout", slideTopicTitle(intent), 1.24, 2.5, 5.84, 0.38, 12, theme, { bg: theme.surface, color: theme.accent, fontSize: 20 }),
    shape(`${id}-check-rule`, "rect", 1.24, 3.0, 7.34, 0.02, 13, theme.accent, theme.accent, { radius: 0 }),
    shape(`${id}-check-insight-panel`, "roundRect", 9.52, 1.9, 2.82, 4.92, 50, theme.accentSoft, theme.accent, { radius: 0.14, width: 0.9 }),
    text(`${id}-check-insight-title`, "caption", "判断ポイント", 9.84, 2.18, 2.1, 0.2, 51, theme, { bg: theme.accentSoft, color: theme.accent, fontSize: 13, bold: true }),
    text(`${id}-check-insight-body`, "body", visibleSentence(intent.message), 9.84, 2.68, 2.02, 1.28, 52, theme, { bg: theme.accentSoft, color: theme.text, fontSize: 16 }),
    text(`${id}-check-insight-note`, "caption", intent.emphasis ?? intent.title, 9.84, 5.36, 2.02, 0.42, 53, theme, { bg: theme.accentSoft, color: theme.mutedText, fontSize: 12 })
  ];
  items.forEach((item, index) => {
    const y = 3.3 + index * 0.62;
    const fill = index % 2 === 0 ? mix(theme.accent, theme.background, 0.95) : theme.surface;
    const order = 20 + index * 5;
    elements.push(shape(`${id}-check-row-${index}`, "roundRect", 1.22, y, 7.36, 0.46, order, fill, theme.line, { radius: 0.12 }));
    elements.push(shape(`${id}-check-badge-${index}`, "ellipse", 1.46, y + 0.1, 0.26, 0.26, order + 1, theme.accent, theme.accent));
    elements.push(text(`${id}-check-mark-${index}`, "caption", "✓", 1.46, y + 0.15, 0.26, 0.1, order + 2, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 9, bold: true, align: "center", valign: "middle" }));
    elements.push(text(`${id}-check-label-${index}`, "caption", item.label, 1.88, y + 0.13, 1.74, 0.16, order + 3, theme, { bg: fill, color: theme.accent, fontSize: 12, bold: true }));
    elements.push(text(`${id}-check-body-${index}`, "body", item.body, 3.72, y + 0.1, 4.46, 0.2, order + 4, theme, { bg: fill, color: theme.text, fontSize: 14 }));
  });
  return elements;
}

function narrativeDetailBrief(theme: Theme, intent: SlideIntent, _expressionPlan: ExpressionPlan): SlideElement[] {
  const id = intent.slideId;
  const items = detailItemsForIntent(intent, 4).map(parsedDetailItem);
  const elements: SlideElement[] = [
    shape(`${id}-brief-frame`, "roundRect", 0.92, 1.9, 11.44, 4.92, 10, theme.surface, theme.line, { radius: 0.16 }),
    text(`${id}-brief-kicker`, "caption", "仕様メモ", 1.24, 2.16, 2.64, 0.18, 11, theme, { bg: theme.surface, color: theme.accent, fontSize: 12, bold: true }),
    text(`${id}-brief-heading`, "callout", slideTopicTitle(intent), 1.24, 2.5, 4.84, 0.38, 12, theme, { bg: theme.surface, color: theme.accent, fontSize: 20 }),
    text(`${id}-brief-message`, "body", visibleSentence(intent.message), 6.72, 2.36, 4.92, 0.48, 13, theme, { bg: theme.surface, color: theme.text, fontSize: 16 }),
    shape(`${id}-brief-rule`, "rect", 1.24, 3.0, 10.72, 0.02, 14, theme.accent, theme.accent, { radius: 0 })
  ];
  items.forEach((item, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 1.24 + col * 5.38;
    const y = 3.34 + row * 1.38;
    const order = 20 + index * 5;
    const fill = index === 0 ? theme.accentSoft : index % 2 === 0 ? mix(theme.accent, theme.background, 0.95) : theme.background;
    elements.push(shape(`${id}-brief-card-${index}`, "roundRect", x, y, 4.86, 1.02, order, fill, theme.line, { radius: 0.14 }));
    elements.push(text(`${id}-brief-card-label-${index}`, "caption", item.label, x + 0.24, y + 0.18, 4.2, 0.16, order + 1, theme, { bg: fill, color: theme.accent, fontSize: 12, bold: true }));
    elements.push(text(`${id}-brief-card-body-${index}`, "body", item.body, x + 0.24, y + 0.5, 4.22, 0.24, order + 2, theme, { bg: fill, color: theme.text, fontSize: 15 }));
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
  const rows = tableRowsForIntent(intent);
  const elements: SlideElement[] = [
    shape(`${id}-table-stage`, "roundRect", 0.96, 2.02, 11.42, 4.62, 10, theme.surface, theme.line, { radius: 0.16 }),
    shape(`${id}-table-header`, "rect", 0.96, 2.02, 11.42, 0.58, 11, theme.accent, theme.accent, { radius: 0 }),
    text(`${id}-table-header-text`, "caption", tableHeaderText(intent), 1.28, 2.18, 10.8, 0.2, 12, theme, { bg: theme.accent, color: theme.inkOnAccent, fontSize: 13, bold: true })
  ];
  rows.forEach((row, index) => {
    const y = 2.82 + index * 0.64;
    const fill = index % 2 === 0 ? theme.background : theme.surface;
    const order = 20 + index * 4;
    elements.push(shape(`${id}-table-row-${index}`, "rect", 1.18, y, 10.98, 0.52, order, fill, fill, { radius: 0 }));
    elements.push(text(`${id}-table-row-index-${index}`, "caption", String(index + 1).padStart(2, "0"), 1.42, y + 0.17, 0.42, 0.12, order + 1, theme, { bg: fill, color: theme.accent, fontSize: 11, bold: true }));
    elements.push(text(`${id}-table-row-label-${index}`, "body", row.label, 2.08, y + 0.1, 2.4, 0.2, order + 2, theme, { bg: fill, color: theme.text, fontSize: 14, bold: true }));
    elements.push(text(`${id}-table-row-body-${index}`, "caption", row.body, 4.7, y + 0.12, 6.9, 0.18, order + 3, theme, { bg: fill, color: theme.mutedText, fontSize: 12 }));
  });
  return elements;
}

function narrativeSpatialModel(theme: Theme, intent: SlideIntent, expressionPlan: ExpressionPlan): SlideElement[] {
  const id = intent.slideId;
  const items = narrativeItems(intent, 4, 5);
  const elements: SlideElement[] = [
    shape(`${id}-spatial-stage`, "roundRect", 0.94, 1.96, 11.46, 4.9, 10, theme.surface, theme.line, { radius: 0.18 }),
    text(`${id}-spatial-grammar`, "caption", visualKickerLabel(intent), 1.26, 2.24, 3.3, 0.18, 11, theme, { bg: theme.surface, color: theme.accent, fontSize: 12, bold: true }),
    text(`${id}-spatial-lead`, "body", visibleSentence(intent.message), 1.26, 2.55, 10.6, 0.34, 12, theme, { bg: theme.surface, color: theme.text, fontSize: 15 }),
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
  const hasRail = [...intent.evidence, ...(intent.details ?? [])].length > 0;
  const diagramFrame = hasRail ? { x: 0.92, y: 1.98, w: 7.72, h: 4.82 } : { x: 0.92, y: 1.98, w: 11.48, h: 4.82 };
  const rendered = renderer({
    idPrefix: diagramIdPrefix(intent.slideId),
    title: slideTopicTitle(intent),
    summary,
    longDescription,
    frame: diagramFrame,
    readingOrderStart: 20,
    accent: theme.accent,
    diagram: intent.diagram
  });
  if (!rendered || rendered.length === 0) return null;

  const leadText = diagramLeadText(intent);
  const lastReadingOrder = Math.max(...rendered.map((element) => element.readingOrder ?? 0));
  const rail = hasRail ? diagramTextRail(theme, intent, 8.86, 2.02, 3.5, 4.74, lastReadingOrder + 1) : [];
  const messageOrder = lastReadingOrder + rail.length + 1;
  return [
    ...rendered,
    ...rail,
    ...(leadText
      ? [
          shape(`${intent.slideId}-diagram-message-box`, "roundRect", 1.08, 6.86, 11.16, 0.42, messageOrder, theme.accentSoft, theme.line, { radius: 0.14, fillOpacity: 0.96 }),
          text(`${intent.slideId}-diagram-message`, "caption", leadText, 1.38, 6.99, 10.56, 0.16, messageOrder + 1, theme, { bg: theme.accentSoft, color: theme.accent, fontSize: 12, bold: true, align: "center" })
        ]
      : [])
  ];
}

function diagramRailRows(intent: SlideIntent): Array<{ label: string; body: string }> {
  const railBody = (value: string): string => {
    const text = value.replace(/\s+/gu, " ").replace(/。$/u, "").trim();
    return text.length <= 42 ? text : text.slice(0, 42).replace(/[、,，・／/\s]+$/u, "");
  };
  const rows = [...intent.evidence, ...(intent.details ?? [])]
    .map((item, index) => {
      const parsed = splitKeyValue(item);
      if (parsed) return { label: narrativeLabel(parsed.key, 12), body: railBody(parsed.value) };
      return { label: `要点 ${index + 1}`, body: railBody(item) };
    })
    .filter((row, index, array) => array.findIndex((candidate) => candidate.label === row.label && candidate.body === row.body) === index);
  return rows.slice(0, 4);
}

function diagramTextRail(theme: Theme, intent: SlideIntent, x: number, y: number, w: number, h: number, readingOrderStart: number): SlideElement[] {
  const rows = diagramRailRows(intent);
  if (rows.length === 0) return [];
  const elements: SlideElement[] = [
    shape(`${intent.slideId}-diagram-rail`, "roundRect", x, y, w, h, readingOrderStart, theme.surface, theme.line, { radius: 0.16, fillOpacity: 0.96 }),
    text(`${intent.slideId}-diagram-rail-title`, "caption", "読み解き", x + 0.24, y + 0.24, w - 0.48, 0.18, readingOrderStart + 1, theme, { bg: theme.surface, color: theme.accent, fontSize: 12, bold: true })
  ];
  rows.forEach((row, index) => {
    const rowY = y + 0.7 + index * 0.92;
    const order = readingOrderStart + 2 + index * 4;
    const fill = index === 0 ? theme.accentSoft : index % 2 === 0 ? theme.background : theme.surface;
    elements.push(shape(`${intent.slideId}-diagram-rail-row-${index}`, "roundRect", x + 0.18, rowY, w - 0.36, 0.72, order, fill, theme.line, { radius: 0.12 }));
    elements.push(text(`${intent.slideId}-diagram-rail-label-${index}`, "caption", row.label, x + 0.38, rowY + 0.12, 1.02, 0.16, order + 1, theme, { bg: fill, color: theme.accent, fontSize: 12, bold: true }));
    elements.push(text(`${intent.slideId}-diagram-rail-body-${index}`, "caption", visibleSentence(row.body), x + 1.42, rowY + 0.12, w - 1.82, 0.36, order + 2, theme, { bg: fill, color: theme.text, fontSize: 12 }));
  });
  return elements;
}

// ---------------------------------------------------------------------------
// Comparison table (general figure)
// ---------------------------------------------------------------------------
// A `contrast`/`matrix` intent whose evidence is *entirely* terse tabular data of the form
// "行ラベル: セルA / セルB (/ セルC ...)" renders as a clean editable comparison grid instead of an
// evidence board. The first evidence line supplies the header (row-header label + column headers);
// remaining lines are body rows. Cells that are exactly a judgement mark (◎ ○ △ ✕) render as
// colour-coded glyphs so technical readers can scan trade-offs at a glance. This keeps the strongest
// artifact for "OBO vs ID-JAG" style slides while staying data-driven from the message map.

type ComparisonMark = "best" | "good" | "partial" | "no";

const COMPARISON_MARK_COLOR: Record<ComparisonMark, string> = {
  // Darkened so the glyphs clear WCAG 4.5:1 both on white cells and on the emphasized column's
  // accentSoft tint (the lighter green/amber failed at ~3.9:1 against the tint).
  best: "#166534",
  good: "#166534",
  partial: "#92400E",
  no: "#B91C1C"
};

function comparisonMarkFor(cell: string): ComparisonMark | null {
  const c = cell.trim();
  if (c === "◎") return "best";
  if (c === "○" || c === "◯" || c === "●") return "good";
  if (c === "△" || c === "▲") return "partial";
  if (c === "✕" || c === "×" || c === "✖" || c === "✗") return "no";
  return null;
}

function parseComparisonRows(evidence: string[]): Array<{ label: string; cells: string[] }> | null {
  const rows: Array<{ label: string; cells: string[] }> = [];
  let columns = -1;
  for (const line of evidence) {
    const match = /^\s*(.+?)\s*[:：]\s*(.+?)\s*$/u.exec(line);
    if (!match) return null;
    const label = match[1].trim();
    const cells = match[2].split(/\s+[／/]\s+/u).map((cell) => cell.trim()).filter(Boolean);
    if (cells.length < 2) return null;
    if (columns === -1) columns = cells.length;
    else if (cells.length !== columns) return null;
    if (label.length > 16 || cells.some((cell) => cell.length > 16)) return null;
    rows.push({ label, cells });
  }
  // Need a header row plus at least two body rows to justify a table over a comparison panel.
  return rows.length >= 3 ? rows : null;
}

function renderComparisonTable(theme: Theme, intent: SlideIntent): SlideElement[] | null {
  if (intent.visualType !== "contrast" && intent.visualType !== "matrix") return null;
  const parsed = parseComparisonRows(intent.evidence);
  if (!parsed) return null;

  const id = `${intent.slideId}-ctable`;
  const header = parsed[0];
  const bodyRows = parsed.slice(1);
  const columns = header.cells.length;
  const emphasizedCol = columns - 1; // land the eye on the last column (the recommended option)

  const frame = { x: 0.92, y: 1.98, w: 11.48, h: 4.82 };
  const labelW = Math.min(3.0, Math.max(2.1, frame.w * 0.22));
  const dataW = (frame.w - labelW) / columns;
  const headerH = 0.62;
  const rowH = Math.min(0.92, (frame.h - headerH) / bodyRows.length);
  const tableH = headerH + rowH * bodyRows.length;
  const hasMarks = bodyRows.some((row) => row.cells.some((cell) => comparisonMarkFor(cell)));
  const legendH = hasMarks ? 0.32 : 0;
  const top = frame.y + Math.max(0, (frame.h - tableH - legendH) / 2);
  const colX = (columnIndex: number) => frame.x + labelW + columnIndex * dataW;

  const elements: SlideElement[] = [];
  let ro = 20;

  // Header row.
  elements.push(
    shape(`${id}-h-label`, "rect", frame.x, top, labelW, headerH, ro++, theme.accent, theme.accent, { radius: 0, width: 0.75 }),
    text(`${id}-h-label-t`, "caption", header.label, frame.x + 0.16, top, labelW - 0.32, headerH, ro++, theme, {
      bg: theme.accent,
      color: theme.inkOnAccent,
      fontSize: 14,
      bold: true,
      align: "left",
      valign: "middle"
    })
  );
  for (let ci = 0; ci < columns; ci += 1) {
    const x = colX(ci);
    const isEmphasis = ci === emphasizedCol;
    elements.push(
      shape(`${id}-h-${ci}`, "rect", x, top, dataW, headerH, ro++, theme.accent, theme.accent, { radius: 0, width: 0.75 }),
      text(`${id}-h-${ci}-t`, "callout", header.cells[ci], x + 0.12, top, dataW - 0.24, headerH, ro++, theme, {
        bg: theme.accent,
        color: theme.inkOnAccent,
        fontSize: isEmphasis ? 17 : 15,
        bold: true,
        align: "center",
        valign: "middle"
      })
    );
  }

  // Body rows.
  bodyRows.forEach((row, ri) => {
    const y = top + headerH + ri * rowH;
    elements.push(
      shape(`${id}-r${ri}-label`, "rect", frame.x, y, labelW, rowH, ro++, theme.surface, theme.line, { radius: 0, width: 0.75 }),
      text(`${id}-r${ri}-label-t`, "body", row.label, frame.x + 0.16, y, labelW - 0.32, rowH, ro++, theme, {
        bg: theme.surface,
        color: theme.text,
        fontSize: 14,
        bold: true,
        align: "left",
        valign: "middle"
      })
    );
    for (let ci = 0; ci < columns; ci += 1) {
      const x = colX(ci);
      const isEmphasis = ci === emphasizedCol;
      const cellBg = isEmphasis ? theme.accentSoft : "#FFFFFF";
      const cell = row.cells[ci];
      const mark = comparisonMarkFor(cell);
      elements.push(shape(`${id}-r${ri}-c${ci}`, "rect", x, y, dataW, rowH, ro++, cellBg, theme.line, { radius: 0, width: 0.75 }));
      elements.push(
        mark
          ? text(`${id}-r${ri}-c${ci}-t`, "callout", cell, x + 0.12, y, dataW - 0.24, rowH, ro++, theme, {
              bg: cellBg,
              color: COMPARISON_MARK_COLOR[mark],
              fontSize: 22,
              bold: true,
              align: "center",
              valign: "middle"
            })
          : text(`${id}-r${ri}-c${ci}-t`, "body", cell, x + 0.12, y, dataW - 0.24, rowH, ro++, theme, {
              bg: cellBg,
              color: theme.text,
              fontSize: 14,
              bold: isEmphasis,
              align: "center",
              valign: "middle"
            })
      );
    }
  });

  // Legend for the judgement marks.
  if (hasMarks) {
    const legendY = top + tableH + 0.06;
    elements.push(
      text(`${id}-legend`, "caption", "◎ 最適　○ 対応　△ 限定　✕ 非対応", frame.x + 0.04, legendY, frame.w - 0.08, 0.26, ro++, theme, {
        bg: theme.background,
        color: theme.mutedText,
        fontSize: 12,
        align: "left",
        valign: "middle"
      })
    );
  }

  return elements;
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

function renderDesignComponentSlide(response: NarrativeDesignComponentResponse, id: string, readingOrder: number): SlideElement[] {
  return [
    {
      id: `${id}-design-component`,
      type: "pptxSlide",
      templatePath: response.templatePath,
      sourceSlideIndex: response.sourceSlideIndex,
      ...(response.textReplacements?.length ? { textReplacements: response.textReplacements } : {}),
      ...(response.nodeGroups?.length ? { nodeGroups: response.nodeGroups } : {}),
      ...(response.nodeOperations?.length ? { nodeOperations: response.nodeOperations } : {}),
      ...(response.recolor?.length ? { recolor: response.recolor } : {}),
      x: 0,
      y: 0,
      w: W,
      h: H,
      decorative: false,
      altText: response.componentName,
      summary: response.summary,
      longDescription: response.longDescription,
      readingOrder
    }
  ];
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

function shouldUseDenseExecutiveHandout(messageMap: DeckMessageMap, contentMode: ContentMode, options: CreateDeckFromMessageMapOptions): boolean {
  return options.planningMode === "narrative-v1" && (contentMode === "handout" || contentMode === "report") && messageMap.intents.length >= 18;
}

function denseHandoutTargetIntentCount(intentCount: number): number {
  if (intentCount >= 22) return 14;
  return 16;
}

function mergeableDenseGroup(group: SlideIntent[]): boolean {
  return group.length < 3 && !group.some((intent) => intent.diagram || intent.visualAsset || intent.visualType === "flow" || intent.visualType === "step" || intent.slideRole === "process");
}

function denseGroupTitle(group: SlideIntent[]): string {
  if (group.length === 1) return group[0].title;
  const titles = group.map((intent) => titleLabel(intent.title));
  if (titles.every((title) => /認証結果コード/u.test(title))) return "認証結果コード";
  if (titles.some((title) => /上り|送信/u.test(title)) && titles.some((title) => /返却|レスポンス/u.test(title))) return "外部インターフェース";
  if (titles.some((title) => /AD必須|属性/u.test(title)) && titles.some((title) => /アプリ/u.test(title))) return "属性と責務";
  if (titles.some((title) => /内部|設定/u.test(title)) && titles.some((title) => /キャッシュ/u.test(title))) return "内部実装とキャッシュ";
  if (titles.some((title) => /運用/u.test(title)) && titles.some((title) => /セキュリティ|リスク/u.test(title))) return "運用とリスク";
  if (titles.some((title) => /移行方針/u.test(title)) && titles.some((title) => /棚卸し|現行/u.test(title))) return "移行方針と棚卸し";
  if (titles.some((title) => /Entra/u.test(title)) && titles.some((title) => /移行後|認証方式/u.test(title))) return "Entra設計と方式";
  if (titles.some((title) => /移行後/u.test(title)) && titles.some((title) => /認可|属性/u.test(title))) return "移行後の方式と認可";
  if (titles.some((title) => /認可|属性/u.test(title)) && titles.some((title) => /統制|監査/u.test(title))) return "認可と統制";
  return titleLabel(`${titles[0]} / ${titles[titles.length - 1]}`);
}

function denseGroupMessage(group: SlideIntent[]): string {
  if (group.length === 1) return group[0].message;
  const title = denseGroupTitle(group);
  if (/インターフェース/u.test(title)) return "送信値と返却値を同じ契約として確認する。";
  if (/認証結果コード/u.test(title)) return "正常系と異常系をコードで判定する。";
  if (/内部実装/u.test(title)) return "設定とキャッシュが運用挙動を決める。";
  if (/移行後/u.test(title)) return "接続方式と認可モデルを合わせて設計する。";
  return `${title}を同じ面で確認する。`;
}

function denseGroupEvidenceLines(group: SlideIntent[]): string[] {
  if (group.length === 1) return group[0].evidence;
  const perIntent = group.length >= 3 ? 2 : 3;
  const lines = group.flatMap((intent) => {
    const label = titleLabel(intent.title);
    return intent.evidence.slice(0, perIntent).map((item, index) => {
      const detail = intent.details?.[index];
      const body = detail && detail !== item ? `${item} / ${detail}` : item;
      return `${label}: ${body}`;
    });
  });
  return lines.slice(0, 6);
}

function denseGroupDiagram(group: SlideIntent[]): SlideIntentDiagram | undefined {
  const title = denseGroupTitle(group);
  const context = [title, ...group.flatMap((intent) => [intent.title, intent.message, intent.emphasis ?? "", ...intent.evidence, ...(intent.details ?? [])])].join(" ");
  const hasArchitectureIntent = group.some((intent) => intent.slideId === "architecture" || /全体構成|アーキテクチャ|architecture/u.test(intent.title));
  const hasEntraDesignIntent = group.some((intent) => /^(entra-design|future-auth-method|authorization-design|security-compliance)$/u.test(intent.slideId));
  const hasRoadmapIntent = group.some((intent) => /^(roadmap-operations|deliverables-next-actions)$/u.test(intent.slideId));
  if (hasArchitectureIntent && /認証Web|CRANE|Active Directory|\bAD\b|ゲストシステム|アプリ/u.test(context)) {
    return {
      direction: "LR",
      nodes: [
        { id: "user", label: "ユーザー", sublabel: "ID/PW入力", kind: "actor" },
        { id: "app", label: "アプリ", sublabel: "appName送信", kind: "system" },
        { id: "auth", label: "認証Web", sublabel: "認証代行", kind: "process", emphasis: true },
        { id: "ad", label: "CRANE AD", sublabel: "LDAPS照会", kind: "system" },
        { id: "decision", label: "権限判断", sublabel: "属性・グループ", kind: "note" }
      ],
      edges: [
        { from: "user", to: "app", label: "入力" },
        { from: "app", to: "auth", label: "HTTPS POST" },
        { from: "auth", to: "ad" },
        { from: "auth", to: "decision", label: "返却" },
        { from: "decision", to: "app" }
      ],
      groups: [{ id: "auth-boundary", label: "認証基盤", nodeIds: ["auth", "ad"] }]
    };
  }
  if (hasEntraDesignIntent && /Entra|OIDC|OAuth|SAML|Managed Identity|Graph API|アプリロール|条件付きアクセス|MFA|認可/u.test(context)) {
    return {
      direction: "LR",
      nodes: [
        { id: "current", label: "現行AD", sublabel: "属性・グループ", kind: "system" },
        { id: "entra", label: "Entra ID", sublabel: "認証・統制", kind: "cloud", emphasis: true },
        { id: "appreg", label: "アプリ登録", sublabel: "OIDC/SAML", kind: "process" },
        { id: "authz", label: "認可モデル", sublabel: "ロール/属性", kind: "data" },
        { id: "audit", label: "監査・運用", sublabel: "ログ/MFA", kind: "note" }
      ],
      edges: [
        { from: "current", to: "entra", label: "同期/再設計" },
        { from: "entra", to: "appreg", label: "接続方式" },
        { from: "appreg", to: "authz", label: "クレーム" },
        { from: "entra", to: "audit", label: "条件付きアクセス" }
      ],
      groups: [{ id: "target", label: "移行後ID基盤", nodeIds: ["entra", "appreg", "authz", "audit"] }]
    };
  }
  if (hasRoadmapIntent && /移行方針|棚卸し|ロードマップ|PoC|切り戻し|体制/u.test(context)) {
    return {
      direction: "LR",
      nodes: [
        { id: "inventory", label: "棚卸し", sublabel: "利用/責任者", kind: "data" },
        { id: "classify", label: "方式判定", sublabel: "難易度/重要度", kind: "process", emphasis: true },
        { id: "poc", label: "PoC", sublabel: "先行対象", kind: "process" },
        { id: "roadmap", label: "ロードマップ", sublabel: "段階移行", kind: "note" }
      ],
      edges: [
        { from: "inventory", to: "classify", label: "現行把握" },
        { from: "classify", to: "poc", label: "先行検証" },
        { from: "poc", to: "roadmap", label: "移行計画" }
      ],
      groups: []
    };
  }
  return undefined;
}

function denseGroupVisualType(group: SlideIntent[]): SlideIntent["visualType"] {
  if (denseGroupDiagram(group)) return "native-diagram";
  if (group.some((intent) => intent.visualType === "contrast" || intent.visualType === "before-after" || intent.slideRole === "comparison")) return "contrast";
  if (group.some((intent) => intent.visualType === "matrix" || intent.slideRole === "decision")) return "table";
  return "table";
}

function denseGroupSlideRole(group: SlideIntent[]): SlideIntent["slideRole"] {
  if (group.some((intent) => intent.slideRole === "comparison")) return "comparison";
  if (group.some((intent) => intent.slideRole === "decision")) return "decision";
  if (group.some((intent) => intent.slideRole === "action")) return "action";
  return "data";
}

function mergeDenseIntentGroup(group: SlideIntent[]): SlideIntent {
  if (group.length === 1) return group[0];
  const diagram = denseGroupDiagram(group);
  return {
    slideId: group.map((intent) => intent.slideId).join("-plus-"),
    title: denseGroupTitle(group),
    message: denseGroupMessage(group),
    slideRole: diagram ? "process" : denseGroupSlideRole(group),
    visualType: diagram ? "native-diagram" : denseGroupVisualType(group),
    emphasis: group.map((intent) => intent.emphasis ?? titleLabel(intent.title)).filter(Boolean).slice(0, 2).join(" / "),
    evidence: denseGroupEvidenceLines(group),
    details: group.flatMap((intent) => [intent.message, ...intent.evidence, ...(intent.details ?? [])]),
    quietInfo: group.flatMap((intent) => intent.quietInfo),
    sourceTrace: group.flatMap((intent) => intent.sourceTrace ?? []),
    ...(diagram ? { diagram } : {})
  };
}

function denseExecutiveHandoutIntents(intents: SlideIntent[], targetCount: number): SlideIntent[] {
  const groups: SlideIntent[][] = intents.map((intent) => [intent]);
  let index = 2;
  while (groups.length > targetCount && index < groups.length - 1) {
    const combined = [...groups[index], ...groups[index + 1]];
    if (combined.length <= 3 && denseGroupDiagram(combined)) {
      groups[index] = combined;
      groups.splice(index + 1, 1);
      continue;
    }
    index += 1;
  }
  index = 2;
  while (groups.length > targetCount && index < groups.length - 1) {
    if (mergeableDenseGroup(groups[index]) && mergeableDenseGroup(groups[index + 1])) {
      groups[index] = [...groups[index], ...groups[index + 1]];
      groups.splice(index + 1, 1);
      index += 1;
      continue;
    }
    index += 1;
  }
  index = 2;
  while (groups.length > targetCount && index < groups.length - 1) {
    const left = groups[index];
    const right = groups[index + 1];
    if (left.length + right.length <= 3 && !left.some((intent) => intent.diagram || intent.visualAsset) && !right.some((intent) => intent.diagram || intent.visualAsset)) {
      groups[index] = [...left, ...right];
      groups.splice(index + 1, 1);
      continue;
    }
    index += 1;
  }
  return groups.map(mergeDenseIntentGroup);
}

export function createDeckFromMessageMap(messageMap: DeckMessageMap, options: CreateDeckFromMessageMapOptions): DeckSpec {
  if (messageMap.intents.length === 0) {
    throw new Error("messageMap.intents must contain at least one SlideIntent.");
  }

  const locale = options.locale ?? "ja-JP";
  const contentMode = options.contentMode ?? "report";
  const { templateId, tokens, styleProfile } = chooseTokens(locale, contentMode, options);
  const theme = buildTheme(tokens);
  const authoringMessageMap = shouldUseDenseExecutiveHandout(messageMap, contentMode, options)
    ? { ...messageMap, intents: denseExecutiveHandoutIntents(messageMap.intents, denseHandoutTargetIntentCount(messageMap.intents.length)) }
    : messageMap;
  const narrativeArtifacts = options.planningMode === "narrative-v1"
    ? createNarrativePlanArtifacts(authoringMessageMap, { title: options.title, locale, contentMode })
    : undefined;
  const slides: Slide[] = [];
  if (options.includeCover !== false) {
    slides.push(createCover(theme, options.title, messageMap));
  }
  authoringMessageMap.intents.forEach((intent, index) => {
    if (narrativeArtifacts) {
      const baseExpressionPlan = narrativeArtifacts.expressionPlans[index];
      const expressionOverride = options.expressionGrammarOverrides?.[intent.slideId];
      const expressionPlan: ExpressionPlan = expressionOverride
        ? {
            ...baseExpressionPlan,
            selectedCandidateId: expressionOverride.candidateId,
            selectedGrammarId: expressionOverride.grammarId,
            rationale: `${baseExpressionPlan.rationale} Materialized candidate ${expressionOverride.candidateId} with grammar ${expressionOverride.grammarId}.`
          }
        : baseExpressionPlan;
      const layoutPlan = narrativeArtifacts.layoutPlans[index];
      const isPrimaryCandidate =
        !expressionOverride ||
        (expressionOverride.candidateId === baseExpressionPlan.selectedCandidateId && expressionOverride.grammarId === baseExpressionPlan.selectedGrammarId);
      const authoredComparison = isPrimaryCandidate ? renderComparisonTable(theme, intent) : null;
      const authoredDiagram = isPrimaryCandidate ? authoredComparison ?? renderAuthoredDiagram(theme, intent, options.diagramRenderer) : null;
      const designComponent = authoredDiagram || !isPrimaryCandidate
        ? null
        : options.designComponentRenderer?.({
            idPrefix: `${intent.slideId}-dc`,
            title: slideTopicTitle(intent),
            slideIndex: index,
            accent: theme.accent,
            intent,
            expressionPlan,
            layoutPlan,
            locale,
            readingOrderStart: 20
          });
      const elements = authoredDiagram ?? (designComponent ? renderDesignComponentSlide(designComponent, intent.slideId, 20) : narrativeElementsForIntent(theme, intent, expressionPlan, layoutPlan, locale));
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

function materializedScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function evaluateMaterializedCandidate(candidate: ExpressionCandidate, deck: DeckSpec): MaterializedExpressionCandidateDeck["evaluation"] {
  const deckReview = reviewDeck(deck, { includeBusinessReview: false });
  const visualReview = reviewVisualQuality(deck);
  const qualityReview = reviewSlideQuality(deck);
  const visualErrorCount = visualReview.issues.filter((issue) => issue.severity === "error").length;
  const visualWarningCount = visualReview.issues.filter((issue) => issue.severity === "warning").length;
  const clarity = materializedScore(
    candidate.scores.clarity - deckReview.blocking.length * 20 - deckReview.polishFixable.length * 5 - visualErrorCount * 15 - visualWarningCount * 2
  );
  const beauty = materializedScore(qualityReview.overallScore);
  return {
    accuracy: candidate.scores.accuracy,
    clarity,
    beauty,
    total: materializedScore(candidate.scores.accuracy * 0.5 + clarity * 0.3 + beauty * 0.2),
    accuracyGatePassed: candidate.accuracyGate.passed,
    reviewEvidence: {
      blockingCount: deckReview.blocking.length,
      polishFixableCount: deckReview.polishFixable.length,
      visualErrorCount,
      visualWarningCount,
      qualityOverall: qualityReview.overallScore
    }
  };
}

export function materializeExpressionCandidateDecks(
  messageMap: DeckMessageMap,
  options: MaterializeExpressionCandidateOptions
): MaterializedExpressionCandidateResult {
  if (messageMap.intents.length === 0) {
    throw new Error("messageMap.intents must contain at least one SlideIntent.");
  }
  if (messageMap.intents.length > 1 && !options.slideId) {
    throw new Error("slideId is required when materializing candidates from a Message Map with multiple intents.");
  }
  const targetIntent = options.slideId
    ? messageMap.intents.find((intent) => intent.slideId === options.slideId)
    : messageMap.intents[0];
  if (!targetIntent) {
    throw new Error(`SlideIntent not found for candidate materialization: ${options.slideId}.`);
  }

  const locale = options.locale ?? "ja-JP";
  const contentMode = options.contentMode ?? "report";
  const targetMessageMap: DeckMessageMap = { ...messageMap, intents: [targetIntent] };
  const planningArtifacts = createNarrativePlanArtifacts(targetMessageMap, { title: options.title, locale, contentMode });
  const planningCandidateSet = planningArtifacts.expressionCandidateSets[0];
  const candidateDecks = planningCandidateSet.candidates.map((candidate): MaterializedExpressionCandidateDeck => {
    const deck = createDeckFromMessageMap(targetMessageMap, {
      ...options,
      planningMode: "narrative-v1",
      includeCover: false,
      includeClosing: false,
      expressionGrammarOverrides: {
        [targetIntent.slideId]: { candidateId: candidate.id, grammarId: candidate.grammarId }
      }
    });
    return {
      slideId: targetIntent.slideId,
      candidateId: candidate.id,
      grammarId: candidate.grammarId,
      deck,
      evaluation: evaluateMaterializedCandidate(candidate, deck)
    };
  });

  return {
    slideId: targetIntent.slideId,
    selectionPolicy: planningCandidateSet.selectionPolicy,
    selectedCandidateId: planningCandidateSet.selectedCandidateId,
    planningCandidateSet,
    candidateDecks
  };
}
