import type { Locale } from "./schema.js";

/**
 * Phase 2: figure selection. Bridges the Content Strategist's per-slide intent
 * (`SlidePlan.figureKind` or a free-text hint) to a concrete renderer choice for the Designer.
 *
 * Two renderer families are available:
 *  - **design-pack** components (`render_design_component`) — curated, fully-editable slide
 *    figures (the `zukai`/`tree` packs). Preferred when a matching kind exists.
 *  - **schematic** presets (`generate_schematic`) — generated native shape/text figures covering
 *    25 kinds. Used as the fallback and for kinds without a curated component.
 *
 * The selector is deterministic and keyword-driven so it is testable and reproducible. It does not
 * render anything; it recommends *what* to render and *how many* items the figure expects.
 */

export type FigureRenderer = "design-pack" | "schematic" | "native-diagram" | "intent-diagram";
export type FigureTool = "render_design_component" | "generate_schematic" | "generate_native_diagram" | "generate_intent_diagram";

/** Canonical figure intents the Content Strategist can request. */
export const FIGURE_INTENTS = [
  "process-horizontal",
  "process-vertical",
  "cycle",
  "hierarchy",
  "comparison",
  "before-after",
  "matrix",
  "overlap",
  "equation",
  "scale",
  "step",
  "timeline",
  "list",
  "list-horizontal",
  "enumeration",
  "correlation",
  "layers",
  "architecture",
  "pyramid",
  "ranking",
  "radar",
  "map",
  "mockup"
] as const;

export type FigureIntent = (typeof FIGURE_INTENTS)[number];

export type FigureRecommendation = {
  intent: FigureIntent;
  renderer: FigureRenderer;
  /** design-pack `kind` (when renderer is design-pack) or schematic `kind`. */
  kind: string;
  /** Tool the Designer should call for the selected renderer. */
  tool: FigureTool;
  /** Alternative schematic kind usable even when a design-pack is chosen. */
  schematicKind: string;
  /** Inclusive item-count guidance for the Content Strategist / Copywriter. */
  itemRange: { min: number; max: number };
  labelJa: string;
  labelEn: string;
  rationale: string;
  /** Other viable intents, best-first, for the Designer to consider. */
  alternatives: FigureIntent[];
};

type IntentSpec = {
  labelJa: string;
  labelEn: string;
  /** design-pack kind, when a curated component exists for this intent. */
  designPackKind?: string;
  /** Renderer override for non-schematic generated figures. */
  renderer?: FigureRenderer;
  /** Concrete non-design-pack/non-schematic kind, e.g. a native diagram family. */
  kind?: string;
  /** schematic kind fallback (always present). */
  schematicKind: string;
  itemRange: { min: number; max: number };
  /** Keyword cues (JA + EN), matched case-insensitively against message/role/hint. */
  cues: string[];
  alternatives: FigureIntent[];
};

const INTENTS: Record<FigureIntent, IntentSpec> = {
  "process-horizontal": {
    labelJa: "横フロー",
    labelEn: "Horizontal flow",
    designPackKind: "flow-horizontal",
    schematicKind: "flow",
    itemRange: { min: 3, max: 6 },
    cues: ["フロー", "工程", "手順", "プロセス", "ステップ", "流れ", "process", "flow", "steps", "pipeline", "workflow", "journey"],
    alternatives: ["process-vertical", "step", "timeline"]
  },
  "process-vertical": {
    labelJa: "縦フロー",
    labelEn: "Vertical flow",
    designPackKind: "flow-vertical",
    schematicKind: "vertical-flow",
    itemRange: { min: 3, max: 6 },
    cues: ["縦フロー", "上から下", "エスカレーション", "vertical", "escalation", "top-down", "sequence"],
    alternatives: ["process-horizontal", "list", "step"]
  },
  cycle: {
    labelJa: "サイクル",
    labelEn: "Cycle",
    designPackKind: "cycle",
    schematicKind: "cycle",
    itemRange: { min: 3, max: 6 },
    cues: ["サイクル", "循環", "ループ", "pdca", "回す", "繰り返し", "cycle", "loop", "iterate", "continuous"],
    alternatives: ["process-horizontal", "step"]
  },
  hierarchy: {
    labelJa: "ツリー",
    labelEn: "Hierarchy",
    designPackKind: "tree",
    schematicKind: "tree",
    itemRange: { min: 3, max: 9 },
    cues: ["ツリー", "階層", "組織", "分解", "mece", "ロジック", "構造", "tree", "hierarchy", "org", "breakdown", "decompose", "taxonomy"],
    alternatives: ["correlation", "layers"]
  },
  comparison: {
    labelJa: "項目比較",
    labelEn: "Comparison",
    designPackKind: "comparison",
    schematicKind: "contrast",
    itemRange: { min: 2, max: 4 },
    cues: ["比較", "対比", "vs", "違い", "プラン比較", "compare", "comparison", "versus", "option"],
    alternatives: ["before-after", "matrix", "list-horizontal"]
  },
  "before-after": {
    labelJa: "前後比較",
    labelEn: "Before/after",
    designPackKind: "before-after",
    schematicKind: "before-after",
    itemRange: { min: 2, max: 4 },
    cues: ["before", "after", "改善前", "改善後", "現状", "あるべき", "ビフォー", "アフター", "transform", "current state", "target state"],
    alternatives: ["comparison", "matrix"]
  },
  matrix: {
    labelJa: "マトリクス",
    labelEn: "Matrix",
    designPackKind: "matrix",
    schematicKind: "matrix",
    itemRange: { min: 4, max: 4 },
    cues: ["マトリクス", "2x2", "四象限", "優先順位", "ポートフォリオ", "matrix", "quadrant", "prioritization", "segmentation"],
    alternatives: ["comparison", "correlation"]
  },
  overlap: {
    labelJa: "ベン図",
    labelEn: "Venn",
    designPackKind: "venn",
    schematicKind: "venn",
    itemRange: { min: 2, max: 3 },
    cues: ["ベン図", "重なり", "共通", "交差", "venn", "overlap", "intersection", "common ground"],
    alternatives: ["correlation", "comparison"]
  },
  equation: {
    labelJa: "数式",
    labelEn: "Equation",
    designPackKind: "formula",
    schematicKind: "cross",
    itemRange: { min: 2, max: 3 },
    cues: ["数式", "掛け合わせ", "公式", "イコール", "formula", "equation", "combine", "x =", "plus"],
    alternatives: ["comparison"]
  },
  scale: {
    labelJa: "規模比較",
    labelEn: "Scale comparison",
    designPackKind: "scale",
    schematicKind: "scale-contrast",
    itemRange: { min: 2, max: 4 },
    cues: ["規模", "成長", "倍", "拡大", "市場規模", "growth", "scale", "size", "magnitude"],
    alternatives: ["ranking", "comparison"]
  },
  step: {
    labelJa: "階段/ステップ",
    labelEn: "Stair step",
    designPackKind: "step",
    schematicKind: "step",
    itemRange: { min: 3, max: 5 },
    cues: ["階段", "ステップ", "成熟度", "段階", "ロードマップ", "maturity", "stair", "stage", "progression", "roadmap"],
    alternatives: ["process-horizontal", "timeline"]
  },
  timeline: {
    labelJa: "ガント",
    labelEn: "Gantt",
    designPackKind: "gantt",
    schematicKind: "gantt",
    itemRange: { min: 3, max: 6 },
    cues: ["ガント", "スケジュール", "工程表", "タイムライン", "期間", "gantt", "schedule", "timeline", "milestone", "plan period"],
    alternatives: ["step", "process-horizontal"]
  },
  list: {
    labelJa: "箇条書き縦",
    labelEn: "Vertical list",
    designPackKind: "list-vertical",
    schematicKind: "list",
    itemRange: { min: 3, max: 6 },
    cues: ["箇条書き", "リスト", "ポイント", "特徴", "list", "points", "bullets", "features", "benefits"],
    alternatives: ["enumeration", "list-horizontal"]
  },
  "list-horizontal": {
    labelJa: "箇条書き横",
    labelEn: "Horizontal list",
    designPackKind: "list-horizontal",
    schematicKind: "list-horizontal",
    itemRange: { min: 3, max: 4 },
    cues: ["横並び", "横リスト", "3点", "4点", "horizontal list", "side by side", "key points"],
    alternatives: ["list", "comparison"]
  },
  enumeration: {
    labelJa: "箇条書き羅列",
    labelEn: "Enumeration",
    designPackKind: "list-enumeration",
    schematicKind: "list-enumeration",
    itemRange: { min: 3, max: 6 },
    cues: ["羅列", "番号", "チェックリスト", "一覧", "enumeration", "numbered", "checklist", "ordered"],
    alternatives: ["list"]
  },
  correlation: {
    labelJa: "相関図",
    labelEn: "Correlation",
    schematicKind: "correlation",
    itemRange: { min: 3, max: 7 },
    cues: ["相関", "概念図", "関連", "ハブ", "中心", "correlation", "concept map", "relationship", "hub and spoke"],
    alternatives: ["hierarchy", "matrix"]
  },
  layers: {
    labelJa: "レイヤー",
    labelEn: "Layers",
    schematicKind: "layer",
    itemRange: { min: 3, max: 5 },
    cues: ["レイヤー", "層", "スタック", "アーキテクチャ", "責任分界", "layer", "stack", "architecture", "tier"],
    alternatives: ["hierarchy", "pyramid"]
  },
  architecture: {
    labelJa: "アーキテクチャ図",
    labelEn: "Architecture diagram",
    renderer: "native-diagram",
    kind: "architecture",
    schematicKind: "layer",
    itemRange: { min: 3, max: 8 },
    cues: [
      "アーキテクチャ",
      "構成図",
      "全体構成",
      "システム構成",
      "連携構成",
      "参照アーキテクチャ",
      "architecture",
      "architecture diagram",
      "system architecture",
      "reference architecture",
      "integration diagram",
      "component diagram",
      "network diagram",
      "data flow"
    ],
    alternatives: ["layers", "process-horizontal", "correlation"]
  },
  pyramid: {
    labelJa: "ピラミッド",
    labelEn: "Pyramid",
    schematicKind: "triangle",
    itemRange: { min: 3, max: 4 },
    cues: ["ピラミッド", "三角", "土台", "頂点", "抽象度", "pyramid", "triangle", "foundation", "apex"],
    alternatives: ["layers", "hierarchy"]
  },
  ranking: {
    labelJa: "ランキング",
    labelEn: "Ranking",
    schematicKind: "ranking",
    itemRange: { min: 3, max: 6 },
    cues: ["ランキング", "順位", "上位", "トップ", "ranking", "rank", "top", "leaderboard"],
    alternatives: ["scale", "list"]
  },
  radar: {
    labelJa: "レーダーチャート",
    labelEn: "Radar chart",
    schematicKind: "radar",
    itemRange: { min: 4, max: 8 },
    cues: ["レーダーチャート", "レーダー", "6軸", "六軸", "多軸", "スコアプロファイル", "score profile", "radar", "spider chart", "multi-axis", "6-axis"],
    alternatives: ["matrix", "ranking", "comparison"]
  },
  map: {
    labelJa: "マップ",
    labelEn: "Map",
    schematicKind: "map",
    itemRange: { min: 3, max: 5 },
    cues: ["マップ", "地図", "勢力図", "領域", "拠点", "map", "territory", "landscape", "location"],
    alternatives: ["correlation"]
  },
  mockup: {
    labelJa: "モックアップ",
    labelEn: "Mockup",
    schematicKind: "mockup",
    itemRange: { min: 2, max: 4 },
    cues: ["モックアップ", "画面", "ダッシュボード", "ポータル", "ui", "mockup", "screen", "dashboard", "portal", "wireframe"],
    alternatives: ["list"]
  }
};

function normalize(text: string): string {
  return text.toLowerCase();
}

function scoreIntent(spec: IntentSpec, haystack: string): number {
  let score = 0;
  for (const cue of spec.cues) {
    if (haystack.includes(cue.toLowerCase())) {
      // Longer, more specific cues weigh slightly more.
      score += cue.length >= 4 ? 2 : 1;
    }
  }
  return score;
}

export type SelectFigureInput = {
  /** Explicit intent if the Content Strategist already decided one. */
  figureKind?: string;
  /** The slide's one-sentence message. */
  message?: string;
  /** Optional extra hints: role, evidence, data description, layout hint. */
  hint?: string;
  /** Number of data points the slide carries, used to validate the item range. */
  itemCount?: number;
  locale?: Locale;
};

/** Resolves a free-text or explicit request into a concrete figure recommendation. */
export function selectFigure(input: SelectFigureInput): FigureRecommendation {
  const explicit = input.figureKind ? resolveExplicit(input.figureKind) : undefined;

  let intent: FigureIntent;
  let rationaleBase: string;

  if (explicit) {
    intent = explicit;
    rationaleBase = `Requested figure kind "${input.figureKind}" mapped to intent "${explicit}".`;
  } else {
    const haystack = normalize([input.message ?? "", input.hint ?? ""].join(" \u0001 "));
    let best: FigureIntent = "list";
    let bestScore = 0;
    for (const key of FIGURE_INTENTS) {
      const s = scoreIntent(INTENTS[key], haystack);
      if (s > bestScore) {
        best = key;
        bestScore = s;
      }
    }
    intent = best;
    rationaleBase =
      bestScore > 0
        ? `Matched keyword cues for "${best}" in the slide message/hint.`
        : `No strong figure cue found; defaulting to a readable vertical list.`;
  }

  const spec = INTENTS[intent];
  const renderer: FigureRenderer = spec.renderer ?? (spec.designPackKind ? "design-pack" : "schematic");
  const kind = spec.designPackKind ?? spec.kind ?? spec.schematicKind;
  const tool = toolForRenderer(renderer);

  let rationale = rationaleBase;
  if (renderer === "design-pack") {
    rationale += ` Use a curated, editable ${spec.labelEn} component (design pack kind "${kind}").`;
  } else if (renderer === "schematic") {
    rationale += ` No curated component for this intent; generate a native ${spec.labelEn} schematic ("${spec.schematicKind}").`;
  } else if (renderer === "native-diagram") {
    rationale += ` Use generate_native_diagram for an editable ${spec.labelEn}; use schematic "${spec.schematicKind}" only as a simpler fallback.`;
  } else {
    rationale += ` Use generate_intent_diagram for a fixed, known ${spec.labelEn} composition; use schematic "${spec.schematicKind}" only as a simpler fallback.`;
  }

  if (typeof input.itemCount === "number") {
    if (input.itemCount < spec.itemRange.min) {
      rationale += ` Note: ${input.itemCount} item(s) is below the suggested ${spec.itemRange.min}-${spec.itemRange.max}; consider a simpler treatment.`;
    } else if (input.itemCount > spec.itemRange.max) {
      rationale += ` Note: ${input.itemCount} item(s) exceeds the suggested ${spec.itemRange.min}-${spec.itemRange.max}; split the slide or use an enumeration.`;
    }
  }

  return {
    intent,
    renderer,
    kind,
    tool,
    schematicKind: spec.schematicKind,
    itemRange: spec.itemRange,
    labelJa: spec.labelJa,
    labelEn: spec.labelEn,
    rationale,
    alternatives: spec.alternatives
  };
}

/** Maps an explicit kind string (intent name, design-pack kind, or schematic kind) to an intent. */
function resolveExplicit(value: string): FigureIntent | undefined {
  const v = value.toLowerCase().trim();
  if ((FIGURE_INTENTS as readonly string[]).includes(v)) return v as FigureIntent;
  for (const key of FIGURE_INTENTS) {
    const spec = INTENTS[key];
    if (spec.designPackKind === v || spec.schematicKind === v) return key;
  }
  // Common aliases.
  const ALIASES: Record<string, FigureIntent> = {
    flow: "process-horizontal",
    "flow-horizontal": "process-horizontal",
    "flow-vertical": "process-vertical",
    "vertical-flow": "process-vertical",
    tree: "hierarchy",
    contrast: "comparison",
    formula: "equation",
    cross: "equation",
    "scale-contrast": "scale",
    triangle: "pyramid",
    layer: "layers",
    "list-vertical": "list",
    spider: "radar",
    gantt: "timeline",
    architecture: "architecture",
    "architecture-diagram": "architecture",
    "native-diagram": "architecture",
    "system-architecture": "architecture"
  };
  return ALIASES[v];
}

function toolForRenderer(renderer: FigureRenderer): FigureTool {
  if (renderer === "design-pack") return "render_design_component";
  if (renderer === "schematic") return "generate_schematic";
  if (renderer === "native-diagram") return "generate_native_diagram";
  return "generate_intent_diagram";
}

/** Returns the full intent catalog for discovery (CLI/MCP). */
export function listFigureIntents(): Array<{
  intent: FigureIntent;
  labelJa: string;
  labelEn: string;
  renderer: FigureRenderer;
  kind: string;
  tool: FigureTool;
  itemRange: { min: number; max: number };
}> {
  return FIGURE_INTENTS.map((intent) => {
    const spec = INTENTS[intent];
    const renderer = spec.renderer ?? (spec.designPackKind ? "design-pack" : "schematic");
    return {
      intent,
      labelJa: spec.labelJa,
      labelEn: spec.labelEn,
      renderer,
      kind: spec.designPackKind ?? spec.kind ?? spec.schematicKind,
      tool: toolForRenderer(renderer),
      itemRange: spec.itemRange
    };
  });
}
