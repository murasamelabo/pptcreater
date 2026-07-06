import type { Locale, SlideRole, SlideVisualType } from "./schema.js";
import type { VisualGrammarId } from "./visualGrammarRegistry.js";

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

export type FigureRenderer = "design-pack" | "schematic" | "native-diagram" | "intent-diagram" | "message-layout";
export type FigureTool = "render_design_component" | "generate_schematic" | "generate_native_diagram" | "generate_intent_diagram" | "create_deck_from_message_map";

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
  "text-explanation",
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
  /** When this figure is the right choice. Returned so MCP/CLI callers can pick intentionally. */
  useWhen: string[];
  /** When to choose a different figure or split the slide. */
  avoidWhen: string[];
  /** Suggested MessageSpec / SlideIntent direction to preserve before rendering. */
  messageSpecDirection: {
    slideRole: SlideRole;
    visualType: SlideVisualType;
    visualGrammarId?: VisualGrammarId;
    guidance: string;
  };
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

type UsageGuidance = {
  useWhen: string[];
  avoidWhen: string[];
  slideRole: SlideRole;
  visualType: SlideVisualType;
  visualGrammarId?: VisualGrammarId;
  guidance: string;
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
    cues: ["マトリクス", "2x2", "2軸", "二軸", "縦軸", "横軸", "四象限", "優先順位", "ポートフォリオ", "matrix", "quadrant", "prioritization", "segmentation"],
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
  "text-explanation": {
    labelJa: "文字主役の詳細解説",
    labelEn: "Text-rich explanation",
    renderer: "message-layout",
    kind: "detail-reading-page",
    schematicKind: "list",
    itemRange: { min: 2, max: 5 },
    cues: ["詳細解説", "詳説", "説明文", "読み物", "文書", "規約", "方針", "policy", "detail", "detailed explanation", "prose", "text-rich", "reading page"],
    alternatives: ["list", "comparison", "enumeration"]
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

const USAGE_GUIDANCE: Record<FigureIntent, UsageGuidance> = {
  "process-horizontal": {
    useWhen: ["左から右へ進む業務フロー、導入手順、処理パイプラインを説明する", "ステップ間の順序や依存関係を短い動詞で見せたい"],
    avoidWhen: ["各工程の詳細説明が長い", "時期や期間が主役ならtimeline/ganttを使う"],
    slideRole: "process",
    visualType: "flow",
    visualGrammarId: "sequential-path",
    guidance: "SlideIntentは slideRole=process, visualType=flow とし、evidenceには3-6個の短い工程名を動詞で入れる。"
  },
  "process-vertical": {
    useWhen: ["上から下へ進む承認、エスカレーション、運用手順を説明する", "縦方向の読み順が自然な業務やチェックを示す"],
    avoidWhen: ["横方向の時間軸や比較が主役", "工程数が多すぎて1枚に収まらない"],
    slideRole: "process",
    visualType: "flow",
    visualGrammarId: "sequential-path",
    guidance: "SlideIntentは slideRole=process, visualType=flow。各工程は短く、条件や注意はdetails/speaker notesへ逃がす。"
  },
  cycle: {
    useWhen: ["改善ループ、PDCA、継続運用、フィードバックサイクルを表す", "終点より反復が重要な話をする"],
    avoidWhen: ["一度きりの手順", "循環関係がない単なる箇条書き"],
    slideRole: "process",
    visualType: "cycle",
    visualGrammarId: "spatial-model",
    guidance: "SlideIntentは slideRole=process, visualType=cycle。messageには何が改善され続けるかを書く。"
  },
  hierarchy: {
    useWhen: ["組織、権限、構成要素、分類、MECE分解を見せる", "親子関係や包含構造が理解の鍵になる"],
    avoidWhen: ["横並び比較や時間順が主役", "関係が多対多でツリーにならない"],
    slideRole: "explanation",
    visualType: "map",
    visualGrammarId: "layered-model",
    guidance: "SlideIntentは slideRole=explanation, visualType=map。親要素、子要素、分類基準をdetailsに残す。"
  },
  comparison: {
    useWhen: ["複数案やプランを同じ評価軸で比べる", "違い・選択理由・推奨案を示す"],
    avoidWhen: ["前後の変化ならbefore-after", "2軸上の位置づけならmatrix"],
    slideRole: "comparison",
    visualType: "contrast",
    visualGrammarId: "comparison-field",
    guidance: "SlideIntentは slideRole=comparison, visualType=contrast。evidenceには共通基準、detailsには各案の根拠を入れる。"
  },
  "before-after": {
    useWhen: ["現状と変更後、導入前後、問題と解決を対比する", "変化の方向を一目で見せたい"],
    avoidWhen: ["3案以上の横比較", "時間順の細かな工程説明"],
    slideRole: "comparison",
    visualType: "before-after",
    visualGrammarId: "comparison-field",
    guidance: "SlideIntentは slideRole=comparison, visualType=before-after。Before/Afterそれぞれの短い状態名と変化理由を入れる。"
  },
  matrix: {
    useWhen: ["2軸で優先度・ポジショニング・判断領域を見せる", "選択肢を面上に置き、推奨ゾーンを示す"],
    avoidWhen: ["軸が定義できない", "単なる項目表や5件以上の詳細比較"],
    slideRole: "decision",
    visualType: "matrix",
    visualGrammarId: "decision-surface",
    guidance: "SlideIntentは slideRole=decision, visualType=matrix。messageに判断軸、evidenceに配置する選択肢を入れる。"
  },
  overlap: {
    useWhen: ["共通部分、重なり、交差領域の価値を説明する", "3つ以内の概念の関係を見せる"],
    avoidWhen: ["包含階層ならhierarchy", "比較基準が複数あるならcomparison"],
    slideRole: "explanation",
    visualType: "ponchi-e",
    visualGrammarId: "spatial-model",
    guidance: "SlideIntentは slideRole=explanation, visualType=ponchi-e。重なる理由と重なりが生む意味をmessageに書く。"
  },
  equation: {
    useWhen: ["複数要素の掛け算・足し算が成果を生むことを示す", "式が何をもたらすかを文章でも説明する"],
    avoidWhen: ["数式だけでは意味が伝わらない", "各要素の説明が長すぎる"],
    slideRole: "explanation",
    visualType: "summary",
    visualGrammarId: "evidence-board",
    guidance: "SlideIntentは slideRole=explanation。messageに式がもたらす成果を一文で書き、detailsに各項の意味を残す。"
  },
  scale: {
    useWhen: ["市場規模、伸び、桁違いの大きさを見せる", "数値の大小差が主張の根拠になる"],
    avoidWhen: ["数値の意味説明が主役ならtext-explanationかtable-text", "順位だけならranking"],
    slideRole: "evidence",
    visualType: "summary",
    visualGrammarId: "typographic-emphasis",
    guidance: "SlideIntentは slideRole=evidence。messageには数値が何を意味するかを書き、evidenceは単位付き数値にする。"
  },
  step: {
    useWhen: ["成熟度、進行段階、ロードマップの段階差を見せる", "段階が上がるほど価値や責任が増える"],
    avoidWhen: ["具体的な日付があるならtimeline", "単なる並列項目ならlist"],
    slideRole: "process",
    visualType: "step",
    visualGrammarId: "sequential-path",
    guidance: "SlideIntentは slideRole=process, visualType=step。各段階の名前と到達条件を短くする。"
  },
  timeline: {
    useWhen: ["期間、マイルストーン、工程表、担当期間を見せる", "いつ何をするかが主張になる"],
    avoidWhen: ["時間情報がない手順", "優先度比較が主役"],
    slideRole: "process",
    visualType: "step",
    visualGrammarId: "sequential-path",
    guidance: "SlideIntentは slideRole=process。evidenceに時期/期間/マイルストーンを入れる。"
  },
  list: {
    useWhen: ["3-6個の論点、特徴、注意点を縦に整理する", "読む順番より抜け漏れ確認が重要"],
    avoidWhen: ["項目間の関係が主張ならflow/tree/matrix", "長文説明ならtext-explanation"],
    slideRole: "explanation",
    visualType: "cards",
    visualGrammarId: "evidence-board",
    guidance: "SlideIntentは slideRole=explanation。evidenceは短い見出し、詳細はdetails/notesへ分ける。"
  },
  "list-horizontal": {
    useWhen: ["3-4個の特徴を同じ重みで横並びに見せる", "営業資料や概要スライドで素早く掴ませる"],
    avoidWhen: ["項目数が多い", "順序や依存がある"],
    slideRole: "overview",
    visualType: "cards",
    visualGrammarId: "evidence-board",
    guidance: "SlideIntentは slideRole=overview。messageに横並び項目の共通意味を書き、項目は短くする。"
  },
  enumeration: {
    useWhen: ["番号付きチェック、導入前確認、手順ではない確認リストを示す", "項目数が多めで、抜け漏れを防ぐ"],
    avoidWhen: ["関係性や因果が重要", "1項目ずつ詳細説明が必要"],
    slideRole: "action",
    visualType: "cards",
    visualGrammarId: "table-text-system",
    guidance: "SlideIntentは slideRole=action。evidenceにチェック項目、detailsに確認理由を入れる。"
  },
  "text-explanation": {
    useWhen: ["文章そのものが主役で、定義・方針・詳細解説を読ませたい", "図解だけでは薄くなるため、見出し付き本文で理解させたい"],
    avoidWhen: ["一言で十分な概要", "関係性が強く図解化できる内容"],
    slideRole: "detail",
    visualType: "detail",
    visualGrammarId: "detail-reading-page",
    guidance: "SlideIntentは slideRole=detail, visualType=detail。messageは結論、evidence/detailsは見出し付き本文にする。"
  },
  correlation: {
    useWhen: ["中心概念と周辺要素の関係を見せる", "ハブとスポーク、影響関係、相関を説明する"],
    avoidWhen: ["親子階層ならhierarchy", "順序があるならflow"],
    slideRole: "explanation",
    visualType: "ponchi-e",
    visualGrammarId: "spatial-model",
    guidance: "SlideIntentは slideRole=explanation, visualType=ponchi-e。中心概念と関係ラベルをdetailsに残す。"
  },
  layers: {
    useWhen: ["プラットフォーム、責任分界、技術スタック、抽象度の層を示す", "上位/下位や基盤/応用の違いが主張になる"],
    avoidWhen: ["時系列や手順", "横比較"],
    slideRole: "explanation",
    visualType: "native-diagram",
    visualGrammarId: "layered-model",
    guidance: "SlideIntentは slideRole=explanation。各層の役割を短いラベル、境界説明をdetailsに入れる。"
  },
  architecture: {
    useWhen: ["システム構成、連携、データ/認可フロー、信頼境界を示す", "ノードとコネクタが主張になる"],
    avoidWhen: ["ノード数が多すぎる", "説明文だけで十分な概念整理"],
    slideRole: "explanation",
    visualType: "native-diagram",
    visualGrammarId: "spatial-model",
    guidance: "SlideIntentは slideRole=explanation, visualType=native-diagram。diagram.nodes/edges/groupsに構造を明示する。"
  },
  pyramid: {
    useWhen: ["土台から頂点へ積み上がる概念、優先順位、抽象度を示す", "下位が上位を支える話をする"],
    avoidWhen: ["循環や横並び比較", "層の数が多すぎる"],
    slideRole: "explanation",
    visualType: "map",
    visualGrammarId: "layered-model",
    guidance: "SlideIntentは slideRole=explanation。下から上への意味をmessageに書く。"
  },
  ranking: {
    useWhen: ["順位、上位候補、重要度順を示す", "何を先に見るべきかが主張になる"],
    avoidWhen: ["比較基準が複数ある", "優先度の2軸判断ならmatrix"],
    slideRole: "decision",
    visualType: "summary",
    visualGrammarId: "typographic-emphasis",
    guidance: "SlideIntentは slideRole=decision。evidenceに順位と理由を入れ、1位の意味をmessageに書く。"
  },
  radar: {
    useWhen: ["4-8軸の特徴プロファイル、施設/製品/候補のバランスを見せる", "各軸の相対的な強弱が重要"],
    avoidWhen: ["軸が3つ以下", "正確な数値比較を読ませたい"],
    slideRole: "comparison",
    visualType: "matrix",
    visualGrammarId: "decision-surface",
    guidance: "SlideIntentは slideRole=comparison。evidenceに軸名とスコア、messageに特徴の読み方を書く。"
  },
  map: {
    useWhen: ["地域、領域、ランドスケープ、拠点配置を示す", "位置や領域が理解の鍵になる"],
    avoidWhen: ["地理や領域が関係ない", "単なる一覧"],
    slideRole: "overview",
    visualType: "map",
    visualGrammarId: "spatial-model",
    guidance: "SlideIntentは slideRole=overview。場所/領域/分類の意味をmessageに書く。"
  },
  mockup: {
    useWhen: ["UI、ダッシュボード、画面イメージ、ポータル導線を説明する", "ユーザーが何を見るかを示したい"],
    avoidWhen: ["実画面が不要", "構造や比較が主役"],
    slideRole: "explanation",
    visualType: "image",
    visualGrammarId: "photo-product-anchor",
    guidance: "SlideIntentは slideRole=explanation。visualAssetまたはmockup内容、見るべき箇所の説明を入れる。"
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
  const usage = USAGE_GUIDANCE[intent];
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
  } else if (renderer === "message-layout") {
    rationale += ` Use a Message Map / SlideIntent with slideRole "${usage.slideRole}" and visualType "${usage.visualType}" so the slide renders as an intentional text-rich explanation instead of a thin figure.`;
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
    useWhen: usage.useWhen,
    avoidWhen: usage.avoidWhen,
    messageSpecDirection: {
      slideRole: usage.slideRole,
      visualType: usage.visualType,
      visualGrammarId: usage.visualGrammarId,
      guidance: usage.guidance
    },
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
    "system-architecture": "architecture",
    detail: "text-explanation",
    prose: "text-explanation",
    "text-rich": "text-explanation",
    "structured-text": "text-explanation",
    "reading-page": "text-explanation"
  };
  return ALIASES[v];
}

function toolForRenderer(renderer: FigureRenderer): FigureTool {
  if (renderer === "design-pack") return "render_design_component";
  if (renderer === "schematic") return "generate_schematic";
  if (renderer === "native-diagram") return "generate_native_diagram";
  if (renderer === "message-layout") return "create_deck_from_message_map";
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
  useWhen: string[];
  avoidWhen: string[];
  messageSpecDirection: FigureRecommendation["messageSpecDirection"];
}> {
  return FIGURE_INTENTS.map((intent) => {
    const spec = INTENTS[intent];
    const usage = USAGE_GUIDANCE[intent];
    const renderer = spec.renderer ?? (spec.designPackKind ? "design-pack" : "schematic");
    return {
      intent,
      labelJa: spec.labelJa,
      labelEn: spec.labelEn,
      renderer,
      kind: spec.designPackKind ?? spec.kind ?? spec.schematicKind,
      tool: toolForRenderer(renderer),
      itemRange: spec.itemRange,
      useWhen: usage.useWhen,
      avoidWhen: usage.avoidWhen,
      messageSpecDirection: {
        slideRole: usage.slideRole,
        visualType: usage.visualType,
        visualGrammarId: usage.visualGrammarId,
        guidance: usage.guidance
      }
    };
  });
}
