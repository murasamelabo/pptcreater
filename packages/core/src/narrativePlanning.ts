import type { ContentMode, DeckMessageMap, Locale, SlideIntent } from "./schema.js";
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

export type ExpressionPlan = {
  slideId: string;
  selectedGrammarId: VisualGrammarId;
  rationale: string;
  rejectedAlternatives: { grammarId: VisualGrammarId; reason: string }[];
  visualRoles: VisualRole[];
  variationKnobs: Record<string, string | number | boolean>;
  riskTags: string[];
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
  slideTextPlans: SlideTextPlan[];
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
  return [intent.title, intent.message, intent.emphasis, ...intent.evidence, ...intent.quietInfo].filter(Boolean).join(" ");
}

function densityForIntent(intent: SlideIntent): SlideBrief["densityTarget"] {
  const visibleTextLength = [intent.title, intent.message, ...intent.evidence].join("").length;
  if (intent.evidence.length >= 5 || visibleTextLength > 180) return "dense";
  if (intent.evidence.length <= 2 && visibleTextLength < 80) return "sparse";
  return "balanced";
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
  const units = [intent.message, intent.emphasis, ...intent.quietInfo].filter((item): item is string => Boolean(item));
  return units.map((item, index) => ({ id: `${intent.slideId}-info-${index + 1}`, text: item, priority: index + 1, sourceTrace: index === 0 ? "message" : "quietInfo/emphasis" }));
}

function evidenceUnitsForIntent(intent: SlideIntent): EvidenceUnit[] {
  return intent.evidence.map((item, index) => ({ id: `${intent.slideId}-evidence-${index + 1}`, text: item, priority: index + 1, sourceTrace: `evidence[${index}]` }));
}

function splitReasonForIntent(intent: SlideIntent): string | undefined {
  if (intent.evidence.length > 6) return "More than six evidence units should be split or summarized before layout.";
  if ([intent.title, intent.message, ...intent.evidence].join("").length > 260) return "Visible text is dense; split or move detail to notes if layout cannot preserve readability.";
  return undefined;
}

function grammarForIntent(intent: SlideIntent, contentMode: ContentMode): VisualGrammarId {
  const text = slideText(intent);
  const lower = text.toLowerCase();
  const evidenceCount = intent.evidence.length;
  if (intent.visualAsset || /写真|画像|スクリーンショット|実例|現場|product|photo|screenshot|case/u.test(lower)) return "photo-product-anchor";
  if (contentMode === "handout" && (intent.visualType === "detail" || evidenceCount >= 6)) return "detail-reading-page";
  if (/[-+]?\d[\d,.]*(?:%|倍|億|万|円|pt|件|人|社|年)?/u.test(text) && evidenceCount <= 4) return "typographic-emphasis";
  if (/比較|候補|option|vs|選択|違い|差分|trade|before|after/u.test(lower)) return "comparison-field";
  if (/判断|優先|risk|return|matrix|費用|効果|投資|承認/u.test(lower)) return "decision-surface";
  if (/手順|工程|順|ロードマップ|timeline|step|flow|移行|導入|運用/u.test(lower)) return "sequential-path";
  if (/階層|layer|stack|構造|architecture|governance|基盤|platform/u.test(lower)) return "layered-model";
  if (/関係|循環|距離|方向|成熟|体験|journey|cycle|map/u.test(lower)) return "spatial-model";
  if (intent.visualType === "table" || evidenceCount >= 5) return "table-text-system";
  return "evidence-board";
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

function expressionPlanForIntent(intent: SlideIntent, contentMode: ContentMode): ExpressionPlan {
  const selectedGrammarId = grammarForIntent(intent, contentMode);
  const grammar = getVisualGrammarSpec(selectedGrammarId);
  return {
    slideId: intent.slideId,
    selectedGrammarId,
    rationale: `Selected ${grammar.label} because the slide needs to express ${grammar.expresses.slice(0, 2).join(" / ")} from message semantics and ${intent.evidence.length} evidence unit(s), rather than directly rendering visualType "${intent.visualType}".`,
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
    role: intent.visualType,
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
  const slideTextPlans = messageMap.intents.map(slideTextPlanForIntent);
  const expressionPlans = messageMap.intents.map((intent) => expressionPlanForIntent(intent, planningInput.deliveryMode));
  const layoutPlans = messageMap.intents.map((intent, index) => layoutPlanForIntent(intent, expressionPlans[index]));

  return {
    planningInput,
    deckBrief,
    chapters,
    slideBriefs,
    slideTextPlans,
    expressionPlans,
    layoutPlans,
    visualGrammars: listVisualGrammarSpecs()
  };
}