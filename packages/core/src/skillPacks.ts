import { z } from "zod";

export const SkillPackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  locale: z.enum(["ja-JP", "en-US"]),
  description: z.string().min(1),
  designDirection: z.string().min(1),
  density: z.enum(["low", "medium", "high"]),
  rules: z.array(z.string().min(1)),
  forbidden: z.array(z.string().min(1)).default([]),
  intakeQuestions: z
    .array(
      z.object({
        id: z.string().min(1),
        question: z.string().min(1),
        why: z.string().min(1),
        examples: z.array(z.string().min(1)).default([])
      })
    )
    .optional()
});

export type SkillPack = z.infer<typeof SkillPackSchema>;

export const BUILTIN_SKILL_PACKS: SkillPack[] = [
  {
    id: "business-ppt-director-ja",
    name: "Business PPT Director Japanese",
    locale: "ja-JP",
    description: "コンサルティング風・社内向けのビジネスPowerPointを、章立て、読み手行動、ページごとの強弱、レビュー観点から設計するディレクション方針。",
    designDirection: "business-director",
    density: "high",
    rules: [
      "DeckSpecを書く前に、目的、聴衆、利用場面、期待行動、避けるべき表現、根拠資料を確認する",
      "6枚を超える資料や重要会議向け資料では、3-5章のSection Architectureを先に作り、Agendaと区切りスライドを検討する",
      "経営・顧客・意思決定向けでは早い段階にExecutive Summaryを置き、結論、重要性、求める判断を示す",
      "各スライドに主メッセージ、根拠、静かに扱う情報、視線の入口、読み順を定義する",
      "すべてのカードやテキストを同じ強さにせず、first-look / second-look / final-readを設計する",
      "Biz UDP Gothicを優先候補にし、タイトル30pt、リード18pt、本文14pt、ラベル/注釈12ptを下回らない方針にする",
      "生成後はreview_business_deck、review_content、lint_deck、polish_deck_layoutを通してからrender_pptxする"
    ],
    forbidden: ["BCG等の固有テンプレート・ロゴ・ブランド模倣", "同じカードグリッドの機械的反復", "根拠のない数値・日付・顧客事実・契約条件の作成", "最終スライドを単なる再掲で終える"]
  },
  {
    id: "business-ppt-director-en",
    name: "Business PPT Director English",
    locale: "en-US",
    description: "Business deck direction for consulting-style or internal-friendly PowerPoint: story, sections, reader action, emphasis, and review gates before rendering.",
    designDirection: "business-director",
    density: "high",
    rules: [
      "Before DeckSpec creation, clarify purpose, audience, usage context, desired reader action, avoided topics, and source material",
      "For decks longer than six slides or important meetings, design 3-5 sections first and consider Agenda plus section divider slides",
      "For executive, customer-facing, or decision decks, include an early Executive Summary with conclusion, why it matters, and requested action",
      "For each slide define primary message, evidence, quiet information, visual entry point, and reading path",
      "Avoid equal emphasis across all cards and text; design first-look / second-look / final-read intentionally",
      "Use readable business typography with title 30pt+, lead 18pt+, body 14pt+, and labels/notes 12pt+",
      "After generation, run review_business_deck, review_content, lint_deck, polish_deck_layout, and then render_pptx"
    ],
    forbidden: ["imitating proprietary consulting templates or brands", "mechanically repeated card grids", "invented figures, dates, customer facts, or commitments", "ending with a generic recap instead of implication/action"]
  },
  {
    id: "modern-slide-design",
    name: "Modern Slide Design",
    locale: "en-US",
    description: "Modern editorial slide style: strong assertion titles, modular cards, generous whitespace, asymmetric composition, and editable native PowerPoint objects.",
    designDirection: "modern-editorial",
    density: "medium",
    rules: [
      "Use one bold assertion title per slide",
      "Before writing slide copy, choose the content mode and run review_content: Japanese report/technical decks split topic title + slide message, while English executive decks use action titles",
      "Prefer modular cards, timelines, flows, schematic presets, and dashboard-like blocks over paragraphs",
      "Use generous whitespace and one restrained accent color",
      "Use editable native PowerPoint shapes/text for simple cards and dividers; choose a built-in schematic preset for structured comparison/hierarchy/process/analysis slides, and for any freeform diagram with arrows or connected nodes use generate_diagram (ponchi-e, omit node x/y for automatic layout) — never hand-place line/rightArrow shapes as connectors",
      "Use source visuals as inspiration or recreate them as editable objects unless exact quotation is required and rights are clear",
      "Run polish_deck_layout and lint_deck before render_pptx"
    ],
    forbidden: ["flattened screenshots for editable content", "dense paragraphs as the primary visual", "copying third-party slide designs verbatim"]
  },
  {
    id: "slide-briefing-ja",
    name: "Slide Briefing Japanese",
    locale: "ja-JP",
    description: "作成前に目的、聴衆、ボリューム、利用場面をヒアリングし、図解中心のDeckSpecへ落とすための方針。",
    designDirection: "visual-briefing",
    density: "medium",
    rules: [
      "最初に目的、聴衆、利用場面、期待する行動を確認する",
      "contentMode に応じて見出しを変える: report/technical/handout は「短い話題タイトル + 50字以内のスライドメッセージ」、presentation/decision は3秒で要点が伝わる短い主張タイトル",
      "各スライドに図、アイコン、データ表現、比較カード、または schematic プリセットのいずれかを入れる",
      "比較・階層・工程・分析・集合などの構造化図解は schematic プリセットを使い、矢印やノードのつながりがある自由図解は generate_diagram（ポンチ絵、ノードの x/y を省略すれば自動レイアウト）を使う。line/rightArrow を手で並べて接続線を作らない",
      "発表用と配布用で情報密度を変える",
      "生成後はlint_deckで読み順、alt text、コントラスト、文字量を確認する"
    ],
    forbidden: ["質問せずに長い本文だけのスライドを作る", "1枚に複数の主張を詰め込む", "意味のない装飾アイコンを置く"],
    intakeQuestions: [
      {
        id: "purpose",
        question: "この資料で聴衆に理解・判断・行動してほしいことは何ですか？",
        why: "1スライド1メッセージと結論タイトルを決めるため。",
        examples: ["意思決定", "提案", "技術共有", "研修", "ピッチ"]
      },
      {
        id: "audience",
        question: "主な聴衆は誰で、前提知識はどの程度ですか？",
        why: "用語、情報密度、図解の粒度を調整するため。",
        examples: ["経営層", "営業担当", "エンジニア", "新入社員", "投資家"]
      },
      {
        id: "delivery",
        question: "発表用、配布用、Web公開用のどれに近いですか？",
        why: "文字量、speaker notes、補足説明の量を決めるため。",
        examples: ["発表補助", "配布資料", "非同期レビュー", "公開スライド"]
      },
      {
        id: "volume",
        question: "希望する枚数、時間、章立てはありますか？",
        why: "1枚あたりの情報量と分割方針を決めるため。",
        examples: ["5枚", "10分", "3章構成", "エグゼクティブサマリのみ"]
      },
      {
        id: "assets",
        question: "使いたいテンプレート、ブランド色、アイコン、ロゴ、図表データはありますか？",
        why: "既存資産をMCPのsearch/register機能で再利用するため。",
        examples: ["Azure構成図", "AWSアイコン", "社内ロゴ", "KPI表"]
      }
    ]
  },
  {
    id: "slide-briefing-en",
    name: "Slide Briefing English",
    locale: "en-US",
    description: "Brief purpose, audience, volume, and delivery context before creating a visual DeckSpec.",
    designDirection: "visual-briefing",
    density: "medium",
    rules: [
      "Clarify purpose, audience, delivery context, and desired action first",
      "Use assertion titles that pass the three-second glance test",
      "Run review_content and adjust title/message/body rules for presentation, report, technical, handout, or decision mode",
      "Include a diagram, icon, data visual, comparison card, process visual, or schematic preset on each slide",
      "Use schematic presets for structured comparison/hierarchy/process/analysis/grouping visuals, and use generate_diagram (ponchi-e; omit node x/y for automatic layout) for freeform connected diagrams — never hand-place line/rightArrow shapes as connectors",
      "Adjust information density for live presentation versus handout use",
      "Run lint_deck after generation to verify reading order, alt text, contrast, and text density"
    ],
    forbidden: ["creating text-only slides without briefing", "packing multiple claims into one slide", "adding decorative icons without meaning"],
    intakeQuestions: [
      {
        id: "purpose",
        question: "What should the audience understand, decide, or do after this deck?",
        why: "This determines the main message and assertion titles.",
        examples: ["decision", "proposal", "technical sharing", "training", "pitch"]
      },
      {
        id: "audience",
        question: "Who is the primary audience and what do they already know?",
        why: "This controls terminology, density, and diagram granularity.",
        examples: ["executives", "sales", "engineers", "new hires", "investors"]
      },
      {
        id: "delivery",
        question: "Is this for live presentation, handout, async review, or public sharing?",
        why: "This controls text volume, notes, and self-contained explanations.",
        examples: ["live talk", "handout", "async review", "public slides"]
      },
      {
        id: "volume",
        question: "Do you have a target slide count, time limit, or section structure?",
        why: "This controls chunking and the number of visual scenes.",
        examples: ["5 slides", "10 minutes", "3 sections", "executive summary only"]
      },
      {
        id: "assets",
        question: "Are there templates, brand colors, icons, logos, or data sources to reuse?",
        why: "This lets the agent use search/register MCP tools instead of inventing assets.",
        examples: ["Azure diagram", "AWS icons", "company logo", "KPI table"]
      }
    ]
  },
  {
    id: "consulting-ja",
    name: "Consulting Japanese",
    locale: "ja-JP",
    description: "資料種別に応じて、短い話題タイトル + スライドメッセージ、または短い主張タイトルを使い分ける日本語コンサルティング資料向け方針。",
    designDirection: "minimal-consulting",
    density: "medium",
    rules: [
      "各スライドは1つの主張に絞る",
      "報告書/技術文書ではタイトルは短い話題ラベルにし、主張は50字以内のスライドメッセージに分ける",
      "発表/意思決定資料では、短い主張タイトルを使ってもよい",
      "詳細はspeaker notesへ移す",
      "図表は要点を直接ラベル化する"
    ],
    forbidden: ["意味のない装飾アイコン", "赤/緑だけの状態表現", "小さすぎる注釈"]
  },
  {
    id: "accessibility-strict",
    name: "Accessibility Strict",
    locale: "en-US",
    description: "Strict WCAG-inspired slide checks for public or reusable decks.",
    designDirection: "accessible-minimal",
    density: "low",
    rules: [
      "Require unique slide titles",
      "Require alt text for every non-decorative visual",
      "Keep text contrast at or above WCAG AA thresholds",
      "Avoid color-only meaning",
      "Preserve explicit reading order"
    ],
    forbidden: ["decorative animation", "images of text", "ambiguous link text"]
  }
];

export function listSkillPacks(): SkillPack[] {
  return BUILTIN_SKILL_PACKS.map((skill) => SkillPackSchema.parse(skill));
}

export function getSkillPack(id: string): SkillPack | undefined {
  return listSkillPacks().find((skill) => skill.id === id);
}
