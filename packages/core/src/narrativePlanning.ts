import type { ContentMode, DeckMessageMap, Locale, SlideIntent, SlideRole } from "./schema.js";
import { getVisualGrammarSpec, listVisualGrammarSpecs, type VisualGrammarId, type VisualGrammarSpec } from "./visualGrammarRegistry.js";

export type PlanningMode = "legacy" | "narrative-v1";

export type SourceFragment = {
  id: string;
  title?: string;
  text: string;
  sourceId?: string;
};

export type DeckConstraint = {
  id: string;
  description: string;
  required?: boolean;
};

export type DeckPlanningInput = {
  request?: string;
  audience?: string;
  purpose?: string;
  desiredAction?: string;
  deliveryMode: ContentMode;
  locale: Locale;
  sourceFragments: SourceFragment[];
  constraints: DeckConstraint[];
};

export type DeckBrief = {
  thesis: string;
  audienceAssumptions: string[];
  desiredAction: string;
  narrativeArc: string[];
  successCriteria: string[];
  openQuestions: string[];
};

export type ChapterPlan = {
  id: string;
  title: string;
  role: "setup" | "context" | "proof" | "options" | "decision" | "action";
  keyQuestion: string;
  slideIds: string[];
};

export type InformationUnit = {
  id: string;
  text: string;
  priority: number;
  sourceTrace?: string;
};

export type EvidenceUnit = {
  id: string;
  text: string;
  priority: number;
  sourceTrace?: string;
};

export type SlideBrief = {
  id: string;
  chapterId: string;
  role: string;
  primaryMessage: string;
  readerTakeaway: string;
  informationUnits: InformationUnit[];
  evidenceUnits: EvidenceUnit[];
  densityTarget: "sparse" | "balanced" | "dense";
  expectedReaderAction?: string;
  splitReason?: string;
};

export type TextRolePlan = {
  role: "title" | "message" | "label" | "body" | "caption" | "detail" | "notes";
  text: string;
  priority: number;
  maxLines: number;
  sourceTrace?: string;
};

export type SlideTextPlan = {
  slideId: string;
  title: TextRolePlan;
  message: TextRolePlan;
  labels: TextRolePlan[];
  bodyItems: TextRolePlan[];
  captions: TextRolePlan[];
  details: TextRolePlan[];
  speakerNotes: string[];
};

export type VisualRole = {
  id: string;
  purpose: string;
  priority: number;
};

export type CommunicationRelation =
  | "sequence"
  | "comparison"
  | "tradeoff"
  | "causality"
  | "hierarchy"
  | "responsibility"
  | "classification"
  | "evidence"
  | "detail";

export type SemanticRelation = {
  from: string;
  to: string;
  label: string;
};

export type SlideCommunicationContract = {
  id: string;
  slideId: string;
  audienceQuestion: string;
  takeaway: string;
  relation: CommunicationRelation;
  entities: string[];
  relations: SemanticRelation[];
  comparisonAxes?: string[];
  readerTest: string;
  forbiddenLosses: string[];
};

export type ExpressionPlan = {
  slideId: string;
  communicationContractId: string;
  selectedCandidateId: string;
  selectedGrammarId: VisualGrammarId;
  rationale: string;
  rejectedAlternatives: { grammarId: VisualGrammarId; reason: string }[];
  visualRoles: VisualRole[];
  variationKnobs: Record<string, string | number | boolean>;
  riskTags: string[];
};

export type ExpressionCandidateScore = {
  accuracy: number;
  clarity: number;
  beauty: number;
  total: number;
};

export type ExpressionCandidate = {
  id: string;
  grammarId: VisualGrammarId;
  scoreRank: number;
  scores: ExpressionCandidateScore;
  accuracyGate: {
    passed: boolean;
    minimum: number;
    reasons: string[];
  };
  selectionReasons: string[];
};

export type ExpressionCandidateSet = {
  slideId: string;
  communicationContractId: string;
  selectionPolicy: "primary-grammar-until-rendered";
  selectedCandidateId: string;
  candidates: ExpressionCandidate[];
};

export type LayoutRegion = {
  id: string;
  purpose: string;
  priority: number;
};

export type TypographyPlan = {
  titleSize: number;
  messageSize: number;
  bodySize: number;
  labelSize: number;
};

export type ColorPlan = {
  backgroundRole: "quiet" | "atmosphere" | "chapter";
  accentRole: "focal" | "guide" | "status";
  maxAccentCount: number;
};

export type SpacingPlan = {
  density: "open" | "standard" | "compact";
  groupGap: "large" | "medium" | "small";
  edgeMargin: "generous" | "standard";
};

export type LayoutPlan = {
  slideId: string;
  regions: LayoutRegion[];
  readingPath: string[];
  typography: TypographyPlan;
  color: ColorPlan;
  spacing: SpacingPlan;
  overflowPolicy: "shorten" | "split" | "move-to-notes";
};

export type NarrativePlanArtifacts = {
  planningInput: DeckPlanningInput;
  deckBrief: DeckBrief;
  chapters: ChapterPlan[];
  slideBriefs: SlideBrief[];
  communicationContracts: SlideCommunicationContract[];
  slideTextPlans: SlideTextPlan[];
  expressionCandidateSets: ExpressionCandidateSet[];
  expressionPlans: ExpressionPlan[];
  layoutPlans: LayoutPlan[];
  visualGrammars: VisualGrammarSpec[];
};

export type NarrativePlanOptions = {
  title?: string;
  request?: string;
  locale?: Locale;
  contentMode?: ContentMode;
  constraints?: DeckConstraint[];
  sourceFragments?: SourceFragment[];
};

const FIXED_VISUAL_TYPE_NAMES = new Set([
  "section",
  "summary",
  "table",
  "contrast",
  "matrix",
  "flow",
  "before-after",
  "step",
  "cycle",
  "map",
  "ponchi-e",
  "native-diagram",
  "detail",
  "visual-scaffold",
  "image",
  "cards"
]);

function hasJapanese(value: string): boolean {
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(value);
}

function compact(value: string, maxLength = 44): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  const clipped = Array.from(text).slice(0, maxLength).join("").replace(/[、,，・／/\s]+$/u, "").replace(/[をにへでとがはの]$/u, "").trimEnd();
  return clipped || text.slice(0, maxLength);
}

function makeId(prefix: string, index: number): string {
  return `${prefix}-${String(index + 1).padStart(2, "0")}`;
}

function slideText(intent: SlideIntent): string {
  return [intent.title, intent.message, intent.emphasis, ...intent.evidence, ...(intent.details ?? []), ...intent.quietInfo, ...(intent.sourceTrace ?? [])].filter(Boolean).join(" ");
}

function densityForIntent(intent: SlideIntent): SlideBrief["densityTarget"] {
  const visibleTextLength = [intent.title, intent.message, ...intent.evidence, ...(intent.details ?? [])].join("").length;
  const supportUnits = intent.evidence.length + (intent.details?.length ?? 0);
  if (supportUnits >= 5 || visibleTextLength > 180) return "dense";
  if (supportUnits <= 2 && visibleTextLength < 80) return "sparse";
  return "balanced";
}

function slideRoleForIntent(intent: SlideIntent): SlideRole {
  if (intent.slideRole) return intent.slideRole;
  const text = slideText(intent).toLowerCase();
  if (intent.visualType === "detail" || /詳細|詳説|説明文|policy|detail|text-rich|structured/u.test(text)) return "detail";
  if (intent.visualType === "contrast" || intent.visualType === "before-after" || /比較|対比|vs|違い|compare|option/u.test(text)) return "comparison";
  if (intent.visualType === "flow" || intent.visualType === "step" || intent.visualType === "cycle" || /手順|工程|プロセス|timeline|roadmap|process/u.test(text)) return "process";
  if (intent.visualType === "matrix" || /判断|意思決定|優先|decision|trade-off/u.test(text)) return "decision";
  if (/根拠|証拠|kpi|roi|数値|実績|proof|evidence/u.test(text)) return "evidence";
  if (/次|action|実行|確認|承認/u.test(text)) return "action";
  if (intent.visualType === "summary" || /overview|全体像|要約|まとめ/u.test(text)) return "overview";
  return "explanation";
}

function chapterRoleForIntent(intent: SlideIntent, index: number, total: number): ChapterPlan["role"] {
  const text = slideText(intent).toLowerCase();
  if (index === 0 || /背景|why|context|overview|summary|要約/u.test(text)) return "setup";
  if (index >= total - 1 || /次|action|closing|実行|確認|承認/u.test(text)) return "action";
  if (/証拠|根拠|kpi|roi|数字|実績|proof|evidence/u.test(text)) return "proof";
  if (/比較|候補|option|選択|matrix|trade|risk|費用/u.test(text)) return "options";
  if (/判断|decision|承認|推奨/u.test(text)) return "decision";
  return "context";
}

function chapterTitle(role: ChapterPlan["role"], locale: Locale): string {
  const labels: Record<ChapterPlan["role"], { ja: string; en: string }> = {
    setup: { ja: "前提", en: "Setup" },
    context: { ja: "整理", en: "Context" },
    proof: { ja: "根拠", en: "Proof" },
    options: { ja: "選択肢", en: "Options" },
    decision: { ja: "判断", en: "Decision" },
    action: { ja: "実行", en: "Action" }
  };
  return locale === "ja-JP" ? labels[role].ja : labels[role].en;
}

function keyQuestion(role: ChapterPlan["role"], locale: Locale): string {
  const questions: Record<ChapterPlan["role"], { ja: string; en: string }> = {
    setup: { ja: "何を理解すべきか。", en: "What should the reader understand first?" },
    context: { ja: "どの情報を同じ面で見るべきか。", en: "What context belongs together?" },
    proof: { ja: "何が根拠になるか。", en: "What proves the claim?" },
    options: { ja: "何を比べて選ぶか。", en: "What should be compared?" },
    decision: { ja: "どの判断を促すか。", en: "What decision is required?" },
    action: { ja: "次に何をするか。", en: "What happens next?" }
  };
  return locale === "ja-JP" ? questions[role].ja : questions[role].en;
}

function createChapters(intents: SlideIntent[], locale: Locale): ChapterPlan[] {
  const chapters: ChapterPlan[] = [];
  intents.forEach((intent, index) => {
    const role = chapterRoleForIntent(intent, index, intents.length);
    const previous = chapters[chapters.length - 1];
    if (!previous || previous.role !== role) {
      chapters.push({
        id: makeId("chapter", chapters.length),
        title: chapterTitle(role, locale),
        role,
        keyQuestion: keyQuestion(role, locale),
        slideIds: []
      });
    }
    chapters[chapters.length - 1].slideIds.push(intent.slideId);
  });
  return chapters;
}

function chapterIdForSlide(chapters: ChapterPlan[], slideId: string): string {
  return chapters.find((chapter) => chapter.slideIds.includes(slideId))?.id ?? chapters[0]?.id ?? "chapter-01";
}

function informationUnitsForIntent(intent: SlideIntent): InformationUnit[] {
  const units = [intent.message, intent.emphasis, ...(intent.details ?? []), ...intent.quietInfo, ...(intent.sourceTrace ?? [])].filter((item): item is string => Boolean(item));
  return units.map((item, index) => ({ id: `${intent.slideId}-info-${index + 1}`, text: item, priority: index + 1, sourceTrace: index === 0 ? "message" : "quietInfo/emphasis" }));
}

function evidenceUnitsForIntent(intent: SlideIntent): EvidenceUnit[] {
  return intent.evidence.map((item, index) => ({ id: `${intent.slideId}-evidence-${index + 1}`, text: item, priority: index + 1, sourceTrace: `evidence[${index}]` }));
}

function splitReasonForIntent(intent: SlideIntent): string | undefined {
  const supportUnits = intent.evidence.length + (intent.details?.length ?? 0);
  if (supportUnits >= 5) return "Five or more support units should be split, summarized, or moved into notes before layout.";
  if ([intent.title, intent.message, ...intent.evidence, ...(intent.details ?? [])].join("").length > 360) return "Visible/source text is dense; preserve detail in notes and split if layout cannot preserve readability.";
  return undefined;
}

function hasStrongMetric(text: string): boolean {
  // Calendar years / timeframes (e.g. 2026年, 2026) are context, not hero metrics.
  const cleaned = text.replace(/(?:19|20)\d{2}\s*年?/gu, " ");
  return (
    /(?<![A-Za-z0-9])\d[\d,]*(?:\.\d+)?\s*(?:%|倍|億|万|円|件|人|社|pt|ポイント|ヶ月|分|時間|日|年)/u.test(cleaned) ||
    /(?<![A-Za-z0-9])\d[\d,]*(?:\.\d+)?\s*(?:減|増|削減|短縮|改善|向上|低減)/u.test(cleaned)
  );
}

function impliesTradeoff(text: string): boolean {
  return /トレードオフ|trade[- ]?off|優先度|優先順位|リスクとリターン|risk\s*(?:vs|and)?\s*return|費用対効果|意思決定/iu.test(text);
}

function impliesTwoAxisSurface(text: string): boolean {
  return (
    impliesTradeoff(text) ||
    /(?:2軸|二軸|縦軸|横軸|x軸|y軸|quadrant|象限|matrix|マトリクス|散布|ポジショニング|positioning)/iu.test(text) ||
    /(?:低|高).*(?:低|高).*(?:軸|象限|マトリクス)/u.test(text)
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function comparisonRows(intent: SlideIntent): Array<{ axis: string; values: string[] }> {
  return intent.evidence.flatMap((item) => {
    const separator = item.indexOf(":");
    if (separator <= 0) return [];
    const axis = item.slice(0, separator).trim();
    const values = item
      .slice(separator + 1)
      .split(/\s*[／/]\s*/u)
      .map((value) => value.trim())
      .filter(Boolean);
    return axis && values.length >= 2 ? [{ axis, values }] : [];
  });
}

function entityFromComparisonValue(value: string): string {
  return value
    .replace(/^(?:担当|主体|owner)\s*[:：]?\s*/iu, "")
    .split(/(?:は|が|を|で|による|として|\s+-\s+)/u, 1)[0]
    .replace(/(?:側|担当)$/u, "")
    .trim();
}

function twoAxisLabels(text: string): string[] {
  const match = text.match(/([^\s、。:：]+)と([^\s、。:：]+)の(?:二軸|2軸)/u);
  return match ? [match[1], match[2]] : [];
}

function communicationRelationForIntent(intent: SlideIntent): CommunicationRelation {
  const text = slideText(intent);
  const role = slideRoleForIntent(intent);
  const rows = comparisonRows(intent);
  if (/責任|責務|分界|担当|担う|owner|ownership/iu.test(text) && rows.length > 0) return "responsibility";
  if (impliesTwoAxisSurface(text)) return "tradeoff";
  if (role === "process") return "sequence";
  if (role === "comparison") return "comparison";
  if (role === "detail") return "detail";
  if (role === "evidence" || hasStrongMetric(text)) return "evidence";
  if (intent.diagram && /階層|レイヤ|layer|stack|基盤|platform|構成/iu.test(text)) return "hierarchy";
  if (/原因|結果|因果|ため|によって|cause|effect|because|therefore/iu.test(text)) return "causality";
  return "classification";
}

function readerTestFor(relation: CommunicationRelation, intent: SlideIntent): string {
  const japanese = hasJapanese(slideText(intent));
  const tests: Record<CommunicationRelation, { ja: string; en: string }> = {
    sequence: { ja: "処理の順序と次の段階を説明できる。", en: "The reader can explain the order and next stage." },
    comparison: { ja: "比較対象ごとの差を説明できる。", en: "The reader can explain the differences between options." },
    tradeoff: { ja: "二つの軸で対象の位置と判断理由を説明できる。", en: "The reader can explain each position and decision across two axes." },
    causality: { ja: "原因から結果までのつながりを説明できる。", en: "The reader can explain how the cause leads to the outcome." },
    hierarchy: { ja: "上位概念と下位要素の関係を説明できる。", en: "The reader can explain parent and child relationships." },
    responsibility: { ja: "誰が何を担うかを説明できる。", en: "The reader can explain who owns each responsibility." },
    classification: { ja: "情報をどの分類で読むかを説明できる。", en: "The reader can explain how the information is classified." },
    evidence: { ja: "主張を支える根拠を説明できる。", en: "The reader can explain the evidence supporting the claim." },
    detail: { ja: "主要条件と例外を説明できる。", en: "The reader can explain the main conditions and exceptions." }
  };
  return japanese ? tests[relation].ja : tests[relation].en;
}

function communicationContractForIntent(intent: SlideIntent): SlideCommunicationContract {
  const relation = communicationRelationForIntent(intent);
  const rows = comparisonRows(intent);
  const axisLabels = relation === "tradeoff" ? twoAxisLabels(slideText(intent)) : rows.map((row) => row.axis);
  const entities = unique([
    ...rows.flatMap((row) => row.values.map(entityFromComparisonValue)),
    ...(intent.diagram?.nodes.map((node) => node.label) ?? [])
  ]);
  const semanticRelations = rows.flatMap((row) =>
    row.values.map((value) => ({
      from: entityFromComparisonValue(value),
      to: row.axis,
      label: value
    }))
  );
  return {
    id: `${intent.slideId}-communication-contract`,
    slideId: intent.slideId,
    audienceQuestion: intent.title,
    takeaway: intent.emphasis ?? intent.message,
    relation,
    entities,
    relations: semanticRelations,
    comparisonAxes: axisLabels.length > 0 ? unique(axisLabels) : undefined,
    readerTest: readerTestFor(relation, intent),
    forbiddenLosses: unique([...(intent.quietInfo ?? []), ...(intent.sourceTrace ?? [])])
  };
}

function grammarForIntent(intent: SlideIntent, contentMode: ContentMode, contract: SlideCommunicationContract): VisualGrammarId {
  const text = slideText(intent);
  const lower = text.toLowerCase();
  const evidenceCount = intent.evidence.length;
  const slideRole = slideRoleForIntent(intent);

  if (intent.diagram) {
    return /階層|レイヤ|layer|stack|基盤|platform|構成|architecture/u.test(lower) ? "layered-model" : "spatial-model";
  }

  if (intent.contentStructure === "prose" || intent.contentStructure === "mixed") return "detail-reading-page";
  if (intent.contentStructure === "table" || intent.contentStructure === "key-value") return "table-text-system";

  if (contract.relation === "responsibility") return "comparison-field";
  if (contract.relation === "tradeoff") return "decision-surface";
  if (contract.relation === "sequence") return intent.visualType === "cycle" ? "spatial-model" : "sequential-path";
  if (contract.relation === "detail") return "detail-reading-page";

  if (intent.slideRole) {
    if (slideRole === "detail") return "detail-reading-page";
    if (slideRole === "comparison") return intent.visualType === "matrix" || impliesTwoAxisSurface(lower) ? "decision-surface" : "comparison-field";
    if (slideRole === "process") return intent.visualType === "cycle" ? "spatial-model" : "sequential-path";
    if (slideRole === "decision") return impliesTwoAxisSurface(lower) ? "decision-surface" : "evidence-board";
    if (slideRole === "data") return "table-text-system";
    if (slideRole === "evidence" && hasStrongMetric(text) && evidenceCount <= 4) return "typographic-emphasis";
  }

  // 1. Real asset anchor only when a concrete image/screenshot/photo is implied.
  if (intent.visualAsset || /写真|スクリーンショット|現場写真|product shot|photo|screenshot/u.test(lower)) return "photo-product-anchor";

  // 2. A large hero metric only when there is a real measured number with a unit or change verb.
  if (hasStrongMetric(text) && evidenceCount <= 4) return "typographic-emphasis";

  // 3. Honor the authoring visualType as a grammar prior instead of a fixed legacy archetype.
  switch (intent.visualType) {
    case "summary":
      return "evidence-board";
    case "section":
      return "typographic-emphasis";
    case "image":
      return "photo-product-anchor";
    case "flow":
    case "step":
      return "sequential-path";
    case "contrast":
    case "before-after":
      // Two-sided contrast reads as a comparison; three or more distinct options read as a board.
      return intent.evidence.length >= 3 ? "evidence-board" : "comparison-field";
    case "matrix":
      return impliesTwoAxisSurface(lower) ? "decision-surface" : (evidenceCount >= 5 ? "table-text-system" : "evidence-board");
    case "table":
      return "table-text-system";
    case "map":
    case "ponchi-e":
    case "native-diagram":
      if (!intent.diagram) return evidenceCount >= 5 ? "table-text-system" : "evidence-board";
      return /階層|レイヤ|layer|stack|基盤|platform|構成/u.test(lower) ? "layered-model" : "spatial-model";
    case "cycle":
      return "spatial-model";
    default:
      break;
  }

  // 4. Keyword refinements when the visualType is generic (summary/cards/detail/visual-scaffold).
  if (contentMode === "handout" && (intent.visualType === "detail" || evidenceCount >= 6)) return "detail-reading-page";
  if (intent.diagram && /役割|ロール|三者|登場|関係者|信頼|actor|role|relationship|trust/u.test(lower)) return "spatial-model";
  if (/比較|候補|option|vs|選択|違い|差分|before|after/u.test(lower)) return "comparison-field";
  if (/手順|工程|順序|ステップ|ロードマップ|timeline|flow|移行手順|導入手順/u.test(lower)) return "sequential-path";
  if (/階層|layer|stack|architecture|基盤|platform/u.test(lower)) return "layered-model";
  if (impliesTwoAxisSurface(lower)) return "decision-surface";
  if (intent.diagram && /関係|循環|距離|方向|成熟|journey/u.test(lower)) return "spatial-model";
  const structuredEvidenceCount = intent.evidence.filter((item) => /^.{1,32}?[:：]\s*.+$/u.test(item)).length;
  if (evidenceCount >= 5 && structuredEvidenceCount === evidenceCount && intent.contentStructure !== "list") return "table-text-system";
  return "evidence-board";
}

const RELATION_GRAMMAR_CANDIDATES: Record<CommunicationRelation, VisualGrammarId[]> = {
  sequence: ["sequential-path", "spatial-model", "detail-reading-page"],
  comparison: ["comparison-field", "table-text-system", "evidence-board"],
  tradeoff: ["decision-surface", "comparison-field", "evidence-board"],
  causality: ["spatial-model", "sequential-path", "evidence-board"],
  hierarchy: ["layered-model", "spatial-model", "table-text-system"],
  responsibility: ["comparison-field", "table-text-system", "evidence-board"],
  classification: ["evidence-board", "table-text-system", "detail-reading-page"],
  evidence: ["evidence-board", "typographic-emphasis", "table-text-system"],
  detail: ["detail-reading-page", "table-text-system", "evidence-board"]
};

const RELATION_GRAMMAR_ACCURACY: Record<CommunicationRelation, Partial<Record<VisualGrammarId, number>>> = {
  sequence: { "sequential-path": 100, "spatial-model": 84, "detail-reading-page": 72 },
  comparison: { "comparison-field": 100, "table-text-system": 90, "evidence-board": 70 },
  tradeoff: { "decision-surface": 100, "comparison-field": 74, "evidence-board": 58 },
  causality: { "spatial-model": 100, "sequential-path": 88, "evidence-board": 68 },
  hierarchy: { "layered-model": 100, "spatial-model": 90, "table-text-system": 66 },
  responsibility: { "comparison-field": 100, "table-text-system": 92, "evidence-board": 64 },
  classification: { "evidence-board": 96, "table-text-system": 90, "detail-reading-page": 84 },
  evidence: { "evidence-board": 100, "typographic-emphasis": 90, "table-text-system": 84 },
  detail: { "detail-reading-page": 100, "table-text-system": 88, "evidence-board": 74 }
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function candidateGrammarIds(primary: VisualGrammarId, contract: SlideCommunicationContract): VisualGrammarId[] {
  return unique([primary, ...RELATION_GRAMMAR_CANDIDATES[contract.relation]]).slice(0, 3) as VisualGrammarId[];
}

function accuracyScore(grammarId: VisualGrammarId, primary: VisualGrammarId, contract: SlideCommunicationContract): number {
  if (grammarId === primary) return 100;
  return Math.min(96, RELATION_GRAMMAR_ACCURACY[contract.relation][grammarId] ?? 50);
}

function clarityScore(grammar: VisualGrammarSpec, intent: SlideIntent): number {
  const itemCount = intent.evidence.length + (intent.details?.length ?? 0);
  let result = 92;
  if (itemCount < grammar.minItems) result -= (grammar.minItems - itemCount) * 12;
  if (itemCount > grammar.maxItems) result -= (itemCount - grammar.maxItems) * 10;
  const density = densityForIntent(intent);
  if (density === "dense" && grammar.densityTolerance === "low") result -= 24;
  if (density === "dense" && grammar.densityTolerance === "medium") result -= 8;
  return clampScore(result);
}

function beautyScore(grammar: VisualGrammarSpec, intent: SlideIntent): number {
  const variationValue = Math.min(18, grammar.variationKnobs.length * 3);
  const focalValue = grammar.layoutConstraints.some((constraint) => /dominant|focal|highlight|distinct|clear/iu.test(constraint)) ? 8 : 3;
  const repetitionPenalty = intent.evidence.length > grammar.maxItems ? 10 : 0;
  return clampScore(68 + variationValue + focalValue - repetitionPenalty);
}

function expressionCandidateFor(
  intent: SlideIntent,
  contract: SlideCommunicationContract,
  primary: VisualGrammarId,
  grammarId: VisualGrammarId
): ExpressionCandidate {
  const grammar = getVisualGrammarSpec(grammarId);
  const accuracy = accuracyScore(grammarId, primary, contract);
  const clarity = clarityScore(grammar, intent);
  const beauty = beautyScore(grammar, intent);
  const minimum = 80;
  const passed = accuracy >= minimum;
  return {
    id: `${intent.slideId}-${grammarId}-candidate`,
    grammarId,
    scoreRank: 0,
    scores: {
      accuracy,
      clarity,
      beauty,
      total: clampScore(accuracy * 0.5 + clarity * 0.3 + beauty * 0.2)
    },
    accuracyGate: {
      passed,
      minimum,
      reasons: passed
        ? [`${grammarId} preserves the ${contract.relation} communication relation.`]
        : [`${grammarId} does not preserve the ${contract.relation} relation strongly enough.`]
    },
    selectionReasons: [
      `Communication relation: ${contract.relation}.`,
      `Grammar supports ${grammar.expresses.slice(0, 2).join(" / ")}.`,
      `Item count ${intent.evidence.length + (intent.details?.length ?? 0)} is evaluated against ${grammar.minItems}-${grammar.maxItems}.`
    ]
  };
}

function expressionCandidateSetForIntent(intent: SlideIntent, contentMode: ContentMode, contract: SlideCommunicationContract): ExpressionCandidateSet {
  const primary = grammarForIntent(intent, contentMode, contract);
  const rankedCandidates = candidateGrammarIds(primary, contract)
    .map((grammarId) => expressionCandidateFor(intent, contract, primary, grammarId))
    .sort((left, right) => {
      if (left.accuracyGate.passed !== right.accuracyGate.passed) return left.accuracyGate.passed ? -1 : 1;
      return right.scores.total - left.scores.total || right.scores.accuracy - left.scores.accuracy || left.id.localeCompare(right.id);
    })
    .map((candidate, index) => ({ ...candidate, scoreRank: index + 1 }));
  const selected = rankedCandidates.find((candidate) => candidate.grammarId === primary && candidate.accuracyGate.passed);
  if (!selected) {
    throw new Error(`No expression candidate passed the accuracy gate for slide ${intent.slideId}.`);
  }
  const candidates = [selected, ...rankedCandidates.filter((candidate) => candidate.id !== selected.id)];
  return {
    slideId: intent.slideId,
    communicationContractId: contract.id,
    selectionPolicy: "primary-grammar-until-rendered",
    selectedCandidateId: selected.id,
    candidates
  };
}

function rejectedAlternativesFor(selected: VisualGrammarId, intent: SlideIntent): ExpressionPlan["rejectedAlternatives"] {
  const candidates: VisualGrammarId[] = ["evidence-board", "comparison-field", "sequential-path", "decision-surface", "detail-reading-page", "table-text-system"].filter((id) => id !== selected) as VisualGrammarId[];
  return candidates.slice(0, 2).map((grammarId) => ({
    grammarId,
    reason: `${grammarId} is less direct for the slide relationship implied by "${compact(intent.message, 36)}".`
  }));
}

function visualRolesForGrammar(grammarId: VisualGrammarId): VisualRole[] {
  const grammar = getVisualGrammarSpec(grammarId);
  return [
    { id: "focal", purpose: grammar.expresses[0] ?? "primary relationship", priority: 1 },
    { id: "support", purpose: grammar.copyRequirements[0] ?? "supporting text", priority: 2 },
    { id: "quiet-context", purpose: grammar.reviewChecks[0] ?? "reviewable context", priority: 3 }
  ];
}

function riskTagsForIntent(intent: SlideIntent, grammarId: VisualGrammarId): string[] {
  const risks: string[] = [];
  if (FIXED_VISUAL_TYPE_NAMES.has(grammarId)) risks.push("fixed-pattern-name");
  if (intent.evidence.length > getVisualGrammarSpec(grammarId).maxItems) risks.push("too-many-items-for-grammar");
  if (densityForIntent(intent) === "dense" && getVisualGrammarSpec(grammarId).densityTolerance === "low") risks.push("density-mismatch");
  return risks;
}

function expressionPlanForIntent(intent: SlideIntent, contract: SlideCommunicationContract, candidateSet: ExpressionCandidateSet): ExpressionPlan {
  const selectedCandidate = candidateSet.candidates.find((candidate) => candidate.id === candidateSet.selectedCandidateId);
  if (!selectedCandidate) {
    throw new Error(`Selected expression candidate is missing for slide ${intent.slideId}.`);
  }
  const selectedGrammarId = selectedCandidate.grammarId;
  const grammar = getVisualGrammarSpec(selectedGrammarId);
  return {
    slideId: intent.slideId,
    communicationContractId: contract.id,
    selectedCandidateId: selectedCandidate.id,
    selectedGrammarId,
    rationale: `Selected ${grammar.label} after accuracy-first candidate ranking because communication relation "${contract.relation}" needs to express ${grammar.expresses.slice(0, 2).join(" / ")} from message semantics and ${intent.evidence.length} evidence unit(s), rather than directly rendering visualType "${intent.visualType}".`,
    rejectedAlternatives: rejectedAlternativesFor(selectedGrammarId, intent),
    visualRoles: visualRolesForGrammar(selectedGrammarId),
    variationKnobs: {
      itemCount: intent.evidence.length,
      density: densityForIntent(intent),
      allowLegacyFallback: false
    },
    riskTags: riskTagsForIntent(intent, selectedGrammarId)
  };
}

function slideTextPlanForIntent(intent: SlideIntent): SlideTextPlan {
  return {
    slideId: intent.slideId,
    title: { role: "title", text: intent.title, priority: 1, maxLines: 2, sourceTrace: "title" },
    message: { role: "message", text: intent.message, priority: 1, maxLines: 2, sourceTrace: "message" },
    labels: [intent.emphasis].filter((item): item is string => Boolean(item)).map((item) => ({ role: "label", text: item, priority: 1, maxLines: 1, sourceTrace: "emphasis" })),
    bodyItems: intent.evidence.map((item, index) => ({ role: "body", text: item, priority: index + 1, maxLines: 2, sourceTrace: `evidence[${index}]` })),
    captions: [],
    details: intent.quietInfo.map((item, index) => ({ role: "detail", text: item, priority: index + 1, maxLines: 2, sourceTrace: `quietInfo[${index}]` })),
    speakerNotes: [intent.message, ...intent.evidence, ...intent.quietInfo]
  };
}

function slideBriefForIntent(intent: SlideIntent, chapterId: string): SlideBrief {
  return {
    id: intent.slideId,
    chapterId,
    role: slideRoleForIntent(intent),
    primaryMessage: intent.message,
    readerTakeaway: intent.emphasis ?? compact(intent.message, 36),
    informationUnits: informationUnitsForIntent(intent),
    evidenceUnits: evidenceUnitsForIntent(intent),
    densityTarget: densityForIntent(intent),
    expectedReaderAction: intent.emphasis,
    splitReason: splitReasonForIntent(intent)
  };
}

function layoutPlanForIntent(intent: SlideIntent, expressionPlan: ExpressionPlan): LayoutPlan {
  const density = densityForIntent(intent);
  const compactLayout = density === "dense";
  return {
    slideId: intent.slideId,
    regions: [
      { id: "title-band", purpose: "topic and slide number", priority: 1 },
      { id: "message-band", purpose: "single visible claim", priority: 1 },
      { id: "expression-region", purpose: `compose ${expressionPlan.selectedGrammarId}`, priority: 2 },
      { id: "quiet-context", purpose: "source notes and supporting detail", priority: 3 }
    ],
    readingPath: ["title-band", "message-band", "expression-region", "quiet-context"],
    typography: {
      titleSize: compactLayout ? 28 : 32,
      messageSize: compactLayout ? 18 : 20,
      bodySize: compactLayout ? 14 : 16,
      labelSize: 12
    },
    color: {
      backgroundRole: intent.visualType === "section" ? "chapter" : "quiet",
      accentRole: "focal",
      maxAccentCount: 1
    },
    spacing: {
      density: compactLayout ? "compact" : density === "sparse" ? "open" : "standard",
      groupGap: compactLayout ? "small" : "medium",
      edgeMargin: compactLayout ? "standard" : "generous"
    },
    overflowPolicy: compactLayout ? "split" : "shorten"
  };
}

function planningInputFromMessageMap(messageMap: DeckMessageMap, options: NarrativePlanOptions): DeckPlanningInput {
  return {
    request: options.request ?? options.title,
    audience: messageMap.audience,
    purpose: messageMap.objective,
    desiredAction: messageMap.desiredAction,
    deliveryMode: options.contentMode ?? "report",
    locale: options.locale ?? (hasJapanese([messageMap.objective, messageMap.audience, messageMap.desiredAction, ...messageMap.intents.map((intent) => intent.message)].filter(Boolean).join(" ")) ? "ja-JP" : "en-US"),
    sourceFragments: options.sourceFragments ?? [],
    constraints: options.constraints ?? []
  };
}

function deckBriefFromMessageMap(messageMap: DeckMessageMap, planningInput: DeckPlanningInput): DeckBrief {
  const thesis = messageMap.objective ?? planningInput.request ?? "Create a message-first deck.";
  const isJapanese = planningInput.locale === "ja-JP";
  return {
    thesis,
    audienceAssumptions: messageMap.audience ? [messageMap.audience] : [isJapanese ? "主な読者は未指定。" : "Primary audience is unspecified."],
    desiredAction: messageMap.desiredAction ?? (isJapanese ? "次の判断へ進む。" : "Move to the next decision."),
    narrativeArc: [
      isJapanese ? "全体メッセージを先に言語化する。" : "State the deck thesis first.",
      isJapanese ? "情報群を章とスライドに分ける。" : "Split information into chapters and slides.",
      isJapanese ? "各スライドの文書を決めてから表現を選ぶ。" : "Finalize slide copy before choosing expression.",
      isJapanese ? "原則レビューで順序と見え方を確認する。" : "Review order and visual principles."
    ],
    successCriteria: [
      isJapanese ? "各スライドが1つの主メッセージを持つ。" : "Each slide has one primary message.",
      isJapanese ? "表現選定に理由と代替案が残る。" : "Expression selection keeps rationale and alternatives.",
      isJapanese ? "固定図解パターン名を直接の選定単位にしない。" : "Fixed diagram pattern names are not the selection primitive."
    ],
    openQuestions: planningInput.constraints.filter((constraint) => constraint.required).map((constraint) => constraint.description)
  };
}

export function createNarrativePlanArtifacts(messageMap: DeckMessageMap, options: NarrativePlanOptions = {}): NarrativePlanArtifacts {
  const planningInput = planningInputFromMessageMap(messageMap, options);
  const deckBrief = deckBriefFromMessageMap(messageMap, planningInput);
  const chapters = createChapters(messageMap.intents, planningInput.locale);
  const slideBriefs = messageMap.intents.map((intent) => slideBriefForIntent(intent, chapterIdForSlide(chapters, intent.slideId)));
  const communicationContracts = messageMap.intents.map(communicationContractForIntent);
  const slideTextPlans = messageMap.intents.map(slideTextPlanForIntent);
  const expressionCandidateSets = messageMap.intents.map((intent, index) => expressionCandidateSetForIntent(intent, planningInput.deliveryMode, communicationContracts[index]));
  const expressionPlans = messageMap.intents.map((intent, index) => expressionPlanForIntent(intent, communicationContracts[index], expressionCandidateSets[index]));
  const layoutPlans = messageMap.intents.map((intent, index) => layoutPlanForIntent(intent, expressionPlans[index]));

  return {
    planningInput,
    deckBrief,
    chapters,
    slideBriefs,
    communicationContracts,
    slideTextPlans,
    expressionCandidateSets,
    expressionPlans,
    layoutPlans,
    visualGrammars: listVisualGrammarSpecs()
  };
}