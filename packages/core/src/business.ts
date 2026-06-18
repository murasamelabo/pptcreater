import type { DeckSpec, Locale, Slide, TextElement } from "./schema.js";

export const BUSINESS_STYLE_MODES = ["consulting", "internal-friendly"] as const;

export type BusinessStyleMode = (typeof BUSINESS_STYLE_MODES)[number];

export type BusinessDeckBrief = {
  locale?: Locale;
  topic?: string;
  purpose?: string;
  audience?: string;
  usageContext?: string;
  desiredAction?: string;
  slideCount?: number;
  styleMode?: BusinessStyleMode;
  brandDirection?: string;
  sourceSummary?: string;
  customerFacing?: boolean;
  importantMeeting?: boolean;
};

export type BusinessDeckGuidance = {
  locale: Locale;
  styleMode: BusinessStyleMode;
  positioning: string;
  workflow: string[];
  typography: string[];
  sectionRules: string[];
  slideRules: string[];
  emphasisRules: string[];
  sourceRules: string[];
  reviewChecklist: string[];
};

export type BusinessSectionPlan = {
  title: string;
  role: string;
  purpose: string;
  slideCountHint: number;
  visualTreatment: string;
};

export type BusinessSlidePlan = {
  section: string;
  title: string;
  leadSentence: string;
  primaryMessage: string;
  mainEvidence: string;
  recommendedLayout: string;
  visualEntryPoint: string;
  readingPath: string[];
  makeProminent: string;
  makeQuiet: string;
};

export type BusinessDeckPlan = {
  locale: Locale;
  styleMode: BusinessStyleMode;
  objective: string;
  audience: string;
  usageContext: string;
  desiredAction: string;
  brandDirection: string;
  missingInformation: string[];
  humanReviewRequired: boolean;
  sections: BusinessSectionPlan[];
  slides: BusinessSlidePlan[];
  reviewChecklist: string[];
  guidance: BusinessDeckGuidance;
};

export type BusinessDeckReviewIssue = {
  severity: "warning" | "suggestion";
  code: string;
  message: string;
  path: string;
  details?: Record<string, string | number | boolean>;
};

export type BusinessDeckReviewReport = {
  ok: boolean;
  guidance: BusinessDeckGuidance;
  issues: BusinessDeckReviewIssue[];
};

type ResolvedBusinessBrief = Required<Omit<BusinessDeckBrief, "slideCount">> & {
  slideCount: number;
};

const BUSINESS_REVIEW_CODES = {
  agendaMissing: "business.agenda-missing",
  executiveSummaryMissing: "business.executive-summary-missing",
  sectionPacingMissing: "business.section-pacing-missing",
  leadMissing: "business.lead-missing",
  repeatedCardGrid: "business.repeated-card-grid",
  weakFinalLanding: "business.weak-final-landing",
  equalEmphasis: "business.equal-emphasis",
  sourceTraceability: "business.source-traceability"
} as const;

function clampSlideCount(value: number | undefined): number {
  if (!Number.isFinite(value ?? NaN)) {
    return 8;
  }

  return Math.min(Math.max(Math.round(value ?? 8), 3), 40);
}

function resolveBrief(brief: BusinessDeckBrief): ResolvedBusinessBrief {
  const locale = brief.locale ?? "ja-JP";
  const topic = brief.topic?.trim() || (locale === "ja-JP" ? "検討テーマ" : "the topic");
  const purpose = brief.purpose?.trim() || (locale === "ja-JP" ? `${topic}について判断・理解を促す` : `Help the audience understand and decide on ${topic}`);
  const audience = brief.audience?.trim() || (locale === "ja-JP" ? "主要な読み手" : "primary readers");
  const usageContext = brief.usageContext?.trim() || (locale === "ja-JP" ? "ビジネスレビュー" : "business review");
  const desiredAction = brief.desiredAction?.trim() || (locale === "ja-JP" ? "論点を理解し、次のアクションを決める" : "understand the implications and choose the next action");
  const styleMode = brief.styleMode ?? "consulting";
  const brandDirection = brief.brandDirection?.trim() || (locale === "ja-JP" ? "指定なし。青基調のプロフェッショナルな表現を標準にする。" : "Not specified; default to a professional blue-based system.");
  const sourceSummary = brief.sourceSummary?.trim() || "";

  return {
    locale,
    topic,
    purpose,
    audience,
    usageContext,
    desiredAction,
    slideCount: clampSlideCount(brief.slideCount),
    styleMode,
    brandDirection,
    sourceSummary,
    customerFacing: Boolean(brief.customerFacing),
    importantMeeting: Boolean(brief.importantMeeting)
  };
}

function missingInformation(brief: BusinessDeckBrief, locale: Locale): string[] {
  const missing: string[] = [];
  if (!brief.purpose?.trim()) {
    missing.push(locale === "ja-JP" ? "資料の目的" : "deck purpose");
  }
  if (!brief.audience?.trim()) {
    missing.push(locale === "ja-JP" ? "主な聴衆" : "primary audience");
  }
  if (!brief.desiredAction?.trim()) {
    missing.push(locale === "ja-JP" ? "読後に期待する判断・行動" : "desired reader action");
  }
  if (!brief.sourceSummary?.trim()) {
    missing.push(locale === "ja-JP" ? "根拠資料・出典・前提" : "source material and assumptions");
  }
  if (!brief.brandDirection?.trim()) {
    missing.push(locale === "ja-JP" ? "ブランド・テンプレート制約" : "brand or template constraints");
  }

  return missing;
}

export function getBusinessDeckGuidance(locale: Locale = "ja-JP", styleMode: BusinessStyleMode = "consulting"): BusinessDeckGuidance {
  const isJapanese = locale === "ja-JP";
  const isConsulting = styleMode === "consulting";
  return {
    locale,
    styleMode,
    positioning: isJapanese
      ? "pptcreater のレンダリング品質ゲートの前に置く、ビジネス資料の企画・編集ディレクション層。"
      : "A business deck planning and editorial direction layer that sits before pptcreater rendering quality gates.",
    workflow: isJapanese
      ? [
          "目的・聴衆・利用場面・期待行動を短く確認する",
          "事実、仮説、推奨、未確認事項を分ける",
          "スライド単位の前に3-5章のセクション設計を作る",
          "各スライドに主メッセージ、根拠、静かに扱う情報、視線導線を定義する",
          "DeckSpec 作成後に review_content、review_business_deck、lint_deck、polish_deck_layout、render_pptx の順で品質ゲートを通す"
        ]
      : [
          "Clarify purpose, audience, usage context, and desired reader action",
          "Separate confirmed facts, assumptions, recommendations, and open questions",
          "Design 3-5 sections before slide-by-slide production",
          "Define each slide's main message, evidence, quiet information, and reading path",
          "After DeckSpec creation, run review_content, review_business_deck, lint_deck, polish_deck_layout, and render_pptx"
        ],
    typography: isJapanese
      ? [
          "日本語ビジネス資料では Biz UDP Gothic を優先候補にし、使えない環境では近いゴシック体へ代替する",
          "タイトルは30pt以上、リード文は18pt以上、本文は14pt以上、ラベル・注釈は12pt以上を原則にする",
          "収まらない場合は文字を小さくせず、短文化・分割・図式化で対応する"
        ]
      : [
          "Use a readable business sans-serif; prefer the deck/template typography when a brand is specified",
          "Keep titles at 30pt or larger, leads at 18pt or larger, body at 14pt or larger, and labels/notes at 12pt or larger",
          "If content does not fit, shorten, split, or restructure instead of shrinking below the floor"
        ],
    sectionRules: isJapanese
      ? [
          "6枚を超える資料では章立てを必須に近い扱いにし、必要なら Agenda とセクション区切りを入れる",
          "経営・顧客・重要会議向けでは早い段階に Executive Summary と Agenda を置く",
          "セクション区切りは通常コンテンツと見た目を変え、余白のあるナビゲーションページにする",
          "最終章は単なる再掲ではなく、示唆・判断・次アクションへ着地させる"
        ]
      : [
          "For decks longer than six slides, use explicit sections and consider agenda/section divider slides",
          "For executive, customer-facing, or important meetings, include an early Executive Summary and Agenda",
          "Make navigation slides visually distinct from dense content slides",
          "End with implication, decision, or next action rather than a crowded recap"
        ],
    slideRules: isJapanese
      ? [
          isConsulting ? "コンサルティング資料では仮説、根拠、示唆、推奨をピラミッド型に並べる" : "社内向け資料では平易な言葉、具体例、前向きな表現で理解を助ける",
          "各スライドは1つの問いに答え、タイトルとリード文だけで要点が分かるようにする",
          "本文は図表を読ませるための説明として使い、装飾コピーや過度な感情表現を避ける",
          "同じカードグリッドを繰り返さず、設定・対比・証拠・運用・結論などスライドの役割を変える"
        ]
      : [
          isConsulting ? "Use hypothesis-driven structure with evidence, implication, and recommendation" : "Use plain language, practical examples, and friendly but business-appropriate tone",
          "Each slide should answer one clear question and be understandable from title plus lead",
          "Use body text to interpret diagrams/tables rather than as decorative copy",
          "Vary slide roles instead of repeating identical card grids"
        ],
    emphasisRules: isJapanese
      ? [
          "各スライドに1つの視線の入口を作る",
          "主メッセージを最も強く、根拠を中程度、注釈・前提を静かに扱う",
          "サイズ、太さ、色、配置、余白で first-look / second-look / final-read を設計する",
          "すべてのカード・アイコン・文字を同じ強さにしない"
        ]
      : [
          "Create one visual entry point per slide",
          "Make the primary message dominant, evidence secondary, and caveats quiet",
          "Use size, weight, color, position, grouping, and whitespace to design first-look / second-look / final-read",
          "Avoid giving every card, icon, and text block equal emphasis"
        ],
    sourceRules: isJapanese
      ? [
          "事実、仮説、推奨、未確認事項を混同しない",
          "数値、日付、顧客事実、価格、契約条件、約束事項を捏造しない",
          "外部 URL を使う場合は metadata.sources に入れ、最終参考URLスライドへ集約する",
          "顧客向け、経営判断、法務・ブランド確認が必要な資料は人間レビューを必須にする"
        ]
      : [
          "Do not mix confirmed facts, assumptions, recommendations, and open questions",
          "Never invent figures, dates, customer facts, prices, commitments, or contract terms",
          "When external URLs are used, add them to metadata.sources so the final references slide can collect them",
          "Require human review for customer-facing, executive, legal, brand, or compliance-sensitive decks"
        ],
    reviewChecklist: isJapanese
      ? [
          "章立てと Agenda は実際の流れを表しているか",
          "Executive Summary は結論、重要性、求める判断/行動を述べているか",
          "各スライドのタイトルとリード文だけで要点が伝わるか",
          "主メッセージ、根拠、注釈の強弱が明確か",
          "カード内テキストが端に張り付かず、十分な内側余白があるか",
          "最終スライドは示唆・判断・次アクションへ着地しているか"
        ]
      : [
          "Do sections and agenda reflect the actual story flow?",
          "Does the Executive Summary state conclusion, why it matters, and requested decision/action?",
          "Can each slide be understood from title and lead?",
          "Is the hierarchy between message, evidence, and caveats clear?",
          "Does card text have comfortable internal padding?",
          "Does the final slide land on implication, decision, or next action?"
        ]
  };
}

function sectionPlans(brief: ResolvedBusinessBrief): BusinessSectionPlan[] {
  const isJapanese = brief.locale === "ja-JP";
  const important = brief.importantMeeting || brief.customerFacing || brief.slideCount >= 7;
  const navigationTreatment = isJapanese
    ? "通常コンテンツと異なる背景・大きな章タイトル・十分な余白を使う"
    : "Use a distinct navigation treatment with different background tone, large section title, and generous whitespace";

  const sections: BusinessSectionPlan[] = [];
  if (important) {
    sections.push(
      {
        title: "Executive Summary",
        role: isJapanese ? "結論・重要性・求める判断を先に示す" : "State conclusion, why it matters, and requested decision/action",
        purpose: brief.desiredAction,
        slideCountHint: 1,
        visualTreatment: navigationTreatment
      },
      {
        title: isJapanese ? "Agenda" : "Agenda",
        role: isJapanese ? "全体の読み方を示す" : "Show the deck structure and reading path",
        purpose: isJapanese ? "以降の章構成と各章の役割を示す。" : "Preview sections and the role of each chapter.",
        slideCountHint: 1,
        visualTreatment: navigationTreatment
      }
    );
  }

  if (brief.styleMode === "internal-friendly") {
    sections.push(
      {
        title: isJapanese ? "はじめに" : "Opening orientation",
        role: isJapanese ? "目的と読者ゴールを揃える" : "Align on purpose and reader goal",
        purpose: isJapanese ? `${brief.topic}をなぜ今扱うのかを示す。` : `Explain why ${brief.topic} matters now.`,
        slideCountHint: 1,
        visualTreatment: navigationTreatment
      },
      {
        title: isJapanese ? "何が変わるか" : "What changes",
        role: isJapanese ? "変化点を理解しやすくする" : "Make the change easy to understand",
        purpose: isJapanese ? "Before/Afterや日常シナリオで変化を示す。" : "Use before/after or everyday scenarios to show the change.",
        slideCountHint: Math.max(1, Math.floor(brief.slideCount * 0.28)),
        visualTreatment: isJapanese ? "明るいカード、具体例、軽いアイコン" : "Bright cards, concrete examples, light icons"
      },
      {
        title: isJapanese ? "使い方と具体例" : "How it works and examples",
        role: isJapanese ? "読者が自分ごと化できるようにする" : "Help readers map the idea to their work",
        purpose: isJapanese ? "ステップ、活用例、注意点を具体化する。" : "Show steps, examples, and practical tips.",
        slideCountHint: Math.max(1, Math.floor(brief.slideCount * 0.34)),
        visualTreatment: isJapanese ? "フロー、シナリオ図、横並びリスト" : "Flows, scenario diagrams, horizontal lists"
      },
      {
        title: isJapanese ? "次の一歩" : "Next step",
        role: isJapanese ? "行動へつなげる" : "Convert understanding into action",
        purpose: brief.desiredAction,
        slideCountHint: 1,
        visualTreatment: navigationTreatment
      }
    );
    return sections;
  }

  sections.push(
    {
      title: isJapanese ? "現状と論点" : "Situation and issue",
      role: isJapanese ? "背景と判断すべき問いを定義する" : "Define the context and the decision question",
      purpose: isJapanese ? `${brief.topic}に関する現状、制約、論点を整理する。` : `Frame current state, constraints, and the key issue for ${brief.topic}.`,
      slideCountHint: Math.max(1, Math.floor(brief.slideCount * 0.22)),
      visualTreatment: isJapanese ? "課題ツリー、現状/課題カード、比較表" : "Issue tree, current-state cards, comparison table"
    },
    {
      title: isJapanese ? "提案と構成" : "Recommendation and design",
      role: isJapanese ? "推奨方針と実現像を示す" : "Show the recommendation and target design",
      purpose: brief.purpose,
      slideCountHint: Math.max(1, Math.floor(brief.slideCount * 0.28)),
      visualTreatment: isJapanese ? "ロードマップ、構成図、意思決定表" : "Roadmap, architecture, decision table"
    },
    {
      title: isJapanese ? "根拠とリスク" : "Evidence and risk",
      role: isJapanese ? "判断材料を提示する" : "Provide evidence and risk treatment",
      purpose: brief.sourceSummary || (isJapanese ? "根拠、前提、リスク、軽減策を示す。" : "Show evidence, assumptions, risks, and mitigations."),
      slideCountHint: Math.max(1, Math.floor(brief.slideCount * 0.28)),
      visualTreatment: isJapanese ? "根拠表、リスク/対策マトリクス、KPIカード" : "Evidence table, risk/mitigation matrix, KPI cards"
    },
    {
      title: isJapanese ? "まとめと次アクション" : "Implication and next action",
      role: isJapanese ? "示唆・判断・次アクションへ着地する" : "Land the implication, decision, and next action",
      purpose: brief.desiredAction,
      slideCountHint: 1,
      visualTreatment: navigationTreatment
    }
  );

  return sections;
}

function isNavigationSection(section: BusinessSectionPlan): boolean {
  return section.title === "Executive Summary" || section.title === "Agenda";
}

function relevantSectionsForSlideCount(sections: BusinessSectionPlan[], slideCount: number): BusinessSectionPlan[] {
  if (sections.length <= slideCount) {
    return sections;
  }

  const firstSection = sections[0];
  const finalSection = sections[sections.length - 1];
  const middleSections = sections.slice(1, -1);
  const contentSections = middleSections.filter((section) => !isNavigationSection(section));
  const selected: BusinessSectionPlan[] = [firstSection];

  if (slideCount >= 4) {
    const agenda = middleSections.find((section) => section.title === "Agenda");
    if (agenda) {
      selected.push(agenda);
    }
  }

  for (const section of contentSections) {
    if (selected.length >= slideCount - 1) {
      break;
    }
    selected.push(section);
  }

  return [...selected.slice(0, Math.max(1, slideCount - 1)), finalSection];
}

function allocateSectionSlideCounts(sections: BusinessSectionPlan[], slideCount: number): number[] {
  const counts = sections.map(() => 1);
  let remaining = Math.max(0, slideCount - sections.length);
  const expandableIndexes = sections
    .map((section, index) => ({ index, extraHint: Math.max(0, section.slideCountHint - 1) }))
    .filter((item) => item.extraHint > 0);

  for (const item of expandableIndexes) {
    while (item.extraHint > 0 && remaining > 0) {
      counts[item.index] += 1;
      item.extraHint -= 1;
      remaining -= 1;
    }
  }

  const fallbackIndexes = sections
    .map((section, index) => ({ section, index }))
    .filter(({ section, index }) => index !== 0 && index !== sections.length - 1 && !isNavigationSection(section))
    .map(({ index }) => index);
  const distributionIndexes = fallbackIndexes.length > 0 ? fallbackIndexes : sections.map((_, index) => index);
  let cursor = 0;
  while (remaining > 0) {
    counts[distributionIndexes[cursor % distributionIndexes.length]] += 1;
    cursor += 1;
    remaining -= 1;
  }

  return counts;
}

function slideTitle(section: BusinessSectionPlan, sectionSlideIndex: number, sectionSlideCount: number, locale: Locale): string {
  if (sectionSlideCount === 1) {
    return section.title;
  }

  const suffix = locale === "ja-JP" ? ` ${sectionSlideIndex + 1}/${sectionSlideCount}` : ` ${sectionSlideIndex + 1}/${sectionSlideCount}`;
  return `${section.title}${suffix}`;
}

function slideFocus(section: BusinessSectionPlan, sectionSlideIndex: number, sectionSlideCount: number, locale: Locale): string {
  if (sectionSlideCount === 1) {
    return section.role;
  }

  const isJapanese = locale === "ja-JP";
  const focuses = isJapanese
    ? ["要点を提示する", "根拠と構成を示す", "影響・リスク・判断材料を示す", "次に取るべき行動へつなげる"]
    : ["State the key point", "Show evidence and structure", "Explain implications, risks, and decision inputs", "Connect to the next action"];
  return `${section.role} - ${focuses[Math.min(sectionSlideIndex, focuses.length - 1)]}`;
}

function slidePlanForSections(brief: ResolvedBusinessBrief, sections: BusinessSectionPlan[]): BusinessSlidePlan[] {
  const isJapanese = brief.locale === "ja-JP";
  const targetSlideCount = Math.max(3, brief.slideCount);
  const relevantSections = relevantSectionsForSlideCount(sections, targetSlideCount);
  const sectionSlideCounts = allocateSectionSlideCounts(relevantSections, targetSlideCount);
  const slides: BusinessSlidePlan[] = [];

  relevantSections.forEach((section, sectionIndex) => {
    const sectionSlideCount = sectionSlideCounts[sectionIndex];
    Array.from({ length: sectionSlideCount }).forEach((_, sectionSlideIndex) => {
      slides.push({
        section: section.title,
        title: slideTitle(section, sectionSlideIndex, sectionSlideCount, brief.locale),
        leadSentence: section.purpose,
        primaryMessage: slideFocus(section, sectionSlideIndex, sectionSlideCount, brief.locale),
        mainEvidence: brief.sourceSummary || (isJapanese ? "確認済み事実、前提、未確認事項を分けて記載する。" : "Separate confirmed facts, assumptions, and open questions."),
        recommendedLayout: section.visualTreatment,
        visualEntryPoint: isJapanese ? "章タイトルまたは結論ボックス" : "Section title or conclusion box",
        readingPath: isJapanese ? ["タイトル", "リード文", "主要図解", "注釈"] : ["title", "lead", "main visual", "quiet notes"],
        makeProminent: isJapanese ? "この章で理解・判断してほしいこと" : "What the reader should understand or decide in this section",
        makeQuiet: isJapanese ? "前提、補足、細かな定義" : "Assumptions, definitions, and caveats"
      });
    });
  });

  return slides;
}

export function planBusinessDeck(brief: BusinessDeckBrief): BusinessDeckPlan {
  const resolved = resolveBrief(brief);
  const guidance = getBusinessDeckGuidance(resolved.locale, resolved.styleMode);
  const sections = relevantSectionsForSlideCount(sectionPlans(resolved), resolved.slideCount);
  return {
    locale: resolved.locale,
    styleMode: resolved.styleMode,
    objective: resolved.purpose,
    audience: resolved.audience,
    usageContext: resolved.usageContext,
    desiredAction: resolved.desiredAction,
    brandDirection: resolved.brandDirection,
    missingInformation: missingInformation(brief, resolved.locale),
    humanReviewRequired: resolved.customerFacing || resolved.importantMeeting || Boolean(resolved.sourceSummary),
    sections,
    slides: slidePlanForSections(resolved, sections),
    reviewChecklist: guidance.reviewChecklist,
    guidance
  };
}

export function createEditWithCopilotPrompt(brief: BusinessDeckBrief): string {
  const plan = planBusinessDeck(brief);
  const isJapanese = plan.locale === "ja-JP";
  const sectionText = plan.sections.map((section, index) => `${index + 1}. ${section.title}: ${section.purpose}`).join("\n");
  const slideText = plan.slides
    .map(
      (slide, index) =>
        `${index + 1}. [${slide.section}] ${slide.title}\n   Lead: ${slide.leadSentence}\n   Message: ${slide.primaryMessage}\n   Layout: ${slide.recommendedLayout}\n   Reading path: ${slide.readingPath.join(" -> ")}`
    )
    .join("\n");

  return isJapanese
    ? [
        "PowerPoint for the web の Edit with Copilot で、以下の条件に沿って高品質なビジネス PowerPoint 資料を作成してください。",
        "",
        `目的: ${plan.objective}`,
        `聴衆: ${plan.audience}`,
        `利用場面: ${plan.usageContext}`,
        `読後に期待する行動: ${plan.desiredAction}`,
        `ブランド・テンプレート制約: ${plan.brandDirection}`,
        `スタイル: ${plan.styleMode === "consulting" ? "コンサルティング風。結論、根拠、示唆、推奨を明確にする。" : "社内向けで明るく親しみやすいが、ビジネスとして正確にする。"}`,
        "",
        "章構成:",
        sectionText,
        "",
        "スライド計画:",
        slideText,
        "",
        "必須制作ルール:",
        "- 情報の明確さ、ストーリー、章立て、読者の行動を装飾より優先する。",
        "- 各スライドは単独で読めるようにし、タイトルとリード文だけで要点が分かるようにする。",
        "- 章区切りや Agenda は通常コンテンツと異なるナビゲーション用デザインにする。",
        "- すべての要素を同じ強さにせず、主メッセージ、根拠、注釈の強弱を明確にする。",
        "- Biz UDP Gothic を優先し、タイトル30pt以上、リード18pt以上、本文14pt以上、ラベル/注釈12pt以上にする。",
        "- 収まらない場合は文字を小さくせず、短文化、分割、図式化で対応する。",
        "- カードや図形内のテキストは端に張り付けず、十分な内側余白を取る。",
        "- 数値、日付、価格、契約条件、顧客事実、約束事項を捏造しない。事実、仮説、推奨、未確認事項を区別する。",
        "- 最終スライドは単なる再掲ではなく、示唆、判断、次アクションへ着地させる。"
      ].join("\n")
    : [
        "Create a high-quality business PowerPoint deck in PowerPoint for the web using Edit with Copilot.",
        "",
        `Purpose: ${plan.objective}`,
        `Audience: ${plan.audience}`,
        `Usage context: ${plan.usageContext}`,
        `Desired reader action: ${plan.desiredAction}`,
        `Brand/template direction: ${plan.brandDirection}`,
        `Style: ${plan.styleMode === "consulting" ? "Consulting-style: clear conclusion, evidence, implication, and recommendation." : "Internal-friendly: bright, approachable, practical, and business-accurate."}`,
        "",
        "Section architecture:",
        sectionText,
        "",
        "Slide plan:",
        slideText,
        "",
        "Required production rules:",
        "- Prioritize information clarity, storyline, section flow, and reader action over decoration.",
        "- Make each slide readable as a standalone page; title plus lead should communicate the point.",
        "- Make Agenda and section divider slides visually distinct from normal content slides.",
        "- Do not give every element equal emphasis; separate primary message, evidence, and quiet notes.",
        "- Use readable business typography: titles 30pt+, leads 18pt+, body 14pt+, labels/notes 12pt+.",
        "- If content does not fit, shorten, split, or restructure instead of shrinking below the floor.",
        "- Keep comfortable internal padding inside cards and shapes.",
        "- Do not invent numbers, dates, prices, contract terms, customer facts, or commitments.",
        "- End with implication, decision, or next action rather than a crowded recap."
      ].join("\n");
}

function titleText(slide: Slide): string {
  return slide.title || slide.elements.find((element): element is TextElement => element.type === "text" && element.role === "title")?.text || "";
}

function leadTextElements(slide: Slide): TextElement[] {
  return slide.elements.filter((element): element is TextElement => element.type === "text" && (element.role === "subtitle" || element.role === "callout"));
}

function countCardLikeShapes(slide: Slide): number {
  return slide.elements.filter((element) => element.type === "shape" && (element.shape === "roundRect" || element.shape === "roundedRect" || element.shape === "rect") && element.w >= 1 && element.h >= 0.5).length;
}

function hasTitleMatching(deck: DeckSpec, pattern: RegExp): boolean {
  return deck.slides.some((slide) => pattern.test(titleText(slide)));
}

function pushBusinessIssue(issues: BusinessDeckReviewIssue[], issue: BusinessDeckReviewIssue): void {
  issues.push(issue);
}

export function reviewBusinessDeck(deck: DeckSpec, brief: BusinessDeckBrief = {}): BusinessDeckReviewReport {
  const locale = brief.locale ?? deck.locale;
  const styleMode = brief.styleMode ?? "consulting";
  const guidance = getBusinessDeckGuidance(locale, styleMode);
  const issues: BusinessDeckReviewIssue[] = [];
  const importantMeeting = Boolean(brief.importantMeeting || brief.customerFacing || deck.slides.length >= 7);

  if (importantMeeting && !hasTitleMatching(deck, /executive summary|エグゼクティブ|サマリー|要旨|要約/i)) {
    pushBusinessIssue(issues, {
      severity: "warning",
      code: BUSINESS_REVIEW_CODES.executiveSummaryMissing,
      message: "Important business decks should include an early Executive Summary that states conclusion, why it matters, and requested action.",
      path: "slides",
      details: { slideCount: deck.slides.length }
    });
  }

  if (deck.slides.length >= 7 && !hasTitleMatching(deck, /agenda|アジェンダ|目次|全体像|本日の流れ/i)) {
    pushBusinessIssue(issues, {
      severity: "suggestion",
      code: BUSINESS_REVIEW_CODES.agendaMissing,
      message: "Decks longer than six slides should include an Agenda or navigation slide showing the section flow.",
      path: "slides",
      details: { slideCount: deck.slides.length }
    });
  }

  if (deck.slides.length >= 7 && !hasTitleMatching(deck, /はじめに|まとめ|next action|next step|section|章|機能紹介/i)) {
    pushBusinessIssue(issues, {
      severity: "suggestion",
      code: BUSINESS_REVIEW_CODES.sectionPacingMissing,
      message: "Long business decks need visible section pacing; add section divider/navigation slides when the story feels flat.",
      path: "slides",
      details: { slideCount: deck.slides.length }
    });
  }

  deck.slides.forEach((slide, slideIndex) => {
    if (leadTextElements(slide).length === 0 && slide.elements.some((element) => element.type === "diagram" || element.type === "svg" || element.type === "image")) {
      pushBusinessIssue(issues, {
        severity: "suggestion",
        code: BUSINESS_REVIEW_CODES.leadMissing,
        message: "Slides with visuals should include a lead sentence/callout that explains how to read the visual.",
        path: `slides.${slideIndex}`,
        details: { title: titleText(slide) }
      });
    }

    const bodyTextSizes = slide.elements
      .filter((element): element is TextElement => element.type === "text" && element.role === "body")
      .map((element) => element.fontSize ?? 0)
      .filter((fontSize) => fontSize > 0);
    const repeatedSizeCount = new Map<number, number>();
    bodyTextSizes.forEach((fontSize) => repeatedSizeCount.set(fontSize, (repeatedSizeCount.get(fontSize) ?? 0) + 1));
    if ([...repeatedSizeCount.values()].some((count) => count >= 5)) {
      pushBusinessIssue(issues, {
        severity: "suggestion",
        code: BUSINESS_REVIEW_CODES.equalEmphasis,
        message: "Many body text blocks use the same size; check whether every element is being given equal emphasis.",
        path: `slides.${slideIndex}`,
        details: { title: titleText(slide) }
      });
    }

    if (countCardLikeShapes(slide) >= 6) {
      pushBusinessIssue(issues, {
        severity: "suggestion",
        code: BUSINESS_REVIEW_CODES.repeatedCardGrid,
        message: "This slide may read like an AI-generated card grid; ensure the comparison itself is the point and one card/message is visually dominant.",
        path: `slides.${slideIndex}`,
        details: { title: titleText(slide), cards: countCardLikeShapes(slide) }
      });
    }
  });

  const lastSlide = deck.slides[deck.slides.length - 1];
  const lastTitle = lastSlide ? titleText(lastSlide).trim() : "";
  if (/^(まとめ|summary|conclusion)$/i.test(lastTitle)) {
    pushBusinessIssue(issues, {
      severity: "suggestion",
      code: BUSINESS_REVIEW_CODES.weakFinalLanding,
      message: "Final slides should land an implication, decision, or next action; avoid ending with a generic recap.",
      path: `slides.${Math.max(0, deck.slides.length - 1)}.title`,
      details: { title: lastTitle }
    });
  }

  if ((brief.customerFacing || brief.importantMeeting) && (deck.metadata.sources ?? []).length === 0) {
    pushBusinessIssue(issues, {
      severity: "suggestion",
      code: BUSINESS_REVIEW_CODES.sourceTraceability,
      message: "Customer-facing or executive decks should preserve source traceability for claims, assumptions, and external references.",
      path: "metadata.sources"
    });
  }

  return {
    ok: !issues.some((issue) => issue.severity === "warning"),
    guidance,
    issues
  };
}
