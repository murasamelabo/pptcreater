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
  },
  {
    id: "slide-craft-ja",
    name: "Slide Craft Japanese",
    locale: "ja-JP",
    description: "「説明が先、スライドは後」を起点に、メッセージ設計→構造抽出→ノイズ除去→最小限の装飾の順で、3秒で伝わる図解中心スライドを作るための実践方針（日本語ビジネス／SNS資料向け）。",
    designDirection: "story-first-craft",
    density: "medium",
    rules: [
      "スライドを作る前にまず言語化する: 口頭で説明できる結論・大枠・抽象を固めてからDeckSpecに落とす（説明が先、スライドは後）。スライドは文字による説明を補完するサポート役で、思考の道具ではない",
      "主役は聴き手: 『どう伝えれば相手が納得し行動するか』を起点にメッセージを設計する。話し手の言いたいことではなく、聴き手が知りたいことを軸にする",
      "『要するに』で一言に絞る: 各スライドの本質を1文に言い切り、それをタイトルかキーメッセージにする（1スライド1メッセージ）。人は聞いた話のほとんどを忘れるため、エッセンスを明示する",
      "文字だけの書類テスト: スライドを文字だけの文書に変換しても意味が伝わるか確認する。伝わらないなら、図解や画像をいくら足しても伝わらない。まず文字だけで伝わる説明を作り、次にビジュアル化する",
      "文字をまず整える: スライドの大部分は文字。フォント・メリハリ・字間行間・言葉選び・配置を先に整えるだけで見やすさは大きく上がる。見出しを付け、数字は大きく、強調は太字に絞る（影・下線・多色を避ける）。長文は左揃え、数値は右揃え",
      "記号を選ぶ: メッセージごとに文字・図・グラフ・写真から適切な記号を意識的に選ぶ。文字は情報密度が高く強力だが『読む』ワンクッションが要る。秒で伝えたい要点は可能な限りビジュアル化する。詳細説明・Q&A・得られることは generate_detail_slide を使う",
      "構造を抽出する: 箇条書きの並列・対比・包含・順序・因果のどれかを見極め、recommend_figure / list_schematic_presets で対応する図解（list/contrast/tree/flow・step/cycle/matrix）に落とす。ここが最も重要で難しい工程。箇条書きはヘッダー付きの四角グリッド（カテゴリ＝見出しセル＋項目セル）にして種類をタテヨコに整理する",
      "ノイズを減らす=削る・揃える・空ける: ①削る（不要なメッセージ・色・線・装飾を消し、1スライド1メッセージに研ぐ）②揃える（要素をキレイに整列）③空ける（余白を取り関係の近いものを近くに置く）。一度すべてをグレーにし、本当に強調したい1要素だけにアクセント色を与える。余白は『見えない境界線』。区切りは罫線・囲み枠ではなく余白で表すとノイズが減る",
      "図解は宙に浮かせない: 図やビジュアルには領域（ハコ）とタイトルを付けて意味づけする。登場要素の役割は色・形で区別し、矢印は主役にせず（脇役・控えめサイズ）、向きや種類でやり取りの違いを表す。余白にも意味を持たせる（無意味に小さい・大きいビジュアルを作らない）",
      "色は最小限: 低彩度の背景・中立面を使い、アクセントは細い罫線・アイコン・バッジ・1つの主役オブジェクトだけに使う。置いた色はすべて意味を持つ。状態を赤/緑だけで表さない",
      "図形は基本形で一貫: 四角・丸・三角に統一し、角丸半径・線幅・余白など一度決めたスタイルを資料全体で守る。角丸は控えめに、図形のタテヨコ比を歪めない",
      "配置に理由を: 余白も要素。ハコ（領域）を先に作り、四角を並べて構造化し、視線はZ（左上→右下）で流す。すべての要素について『なぜそこに置いたか』を説明できる状態を理想とする。紙とペンで頭を整理してからパワポを開く",
      "凡例・ラベルは要素に直接書き、罫線や格子は脇役にして文字を主役にする。不自然な改行を避け、polish_deck_layout に折り返しを任せる",
      "具体例で示し、抽象→具体の順で構成する。一段上から考える: 目的は『伝わる』ことで、ツールや装飾は手段にすぎない",
      "先人に学ぶ: 既存テンプレート（search_templates）や登録アイコン（search_assets）を再利用し、生成後は review_content → lint_deck → review_deck を通してから render_pptx する"
    ],
    forbidden: [
      "情報量×装飾量の2軸で自己診断し、6つの型を避ける（理想は両軸のバランス）",
      "スカスカ（情報が薄く余白だけ）— まずデザインより内容（メッセージと根拠）を練り直す",
      "ミチミチ（情報を詰め込みすぎ）",
      "文字文字（本文の長文ベタ書きだけ）で図解にしない",
      "写真頼り（意味のないビジュアルでごまかす）",
      "サバサバ（メリハリ・強調がなく全要素が同じ強さ）",
      "ゴテゴテ（多色・多装飾・影や枠の盛りすぎ）",
      "色付きライン付きカードを3つ以上並べるだけのAI生成風レイアウト。カードは主役1つに留め、比較・判断・流れ・全体像に応じて表・マトリクス・フロー・ポンチ絵へ変換する",
      "凡例の外出し、格子や罫線を主役にする、状態を色だけで示す、矢印を主役にする、角丸など図形スタイルの不揃い"
    ]
  },
  {
    id: "slide-craft-en",
    name: "Slide Craft English",
    locale: "en-US",
    description: "A craft-first method: explanation before slides, then message design -> structure extraction -> noise removal -> minimal decoration, to produce figure-first slides that land in three seconds.",
    designDirection: "story-first-craft",
    density: "medium",
    rules: [
      "Verbalize first: be able to say the conclusion, the big picture, and the abstraction out loud before authoring DeckSpec (explanation first, slides second). The slide supports the spoken explanation; it is not a thinking tool",
      "The audience is the protagonist: design the message from 'what will make them agree and act', not from what the speaker wants to say",
      "Distill with 'in short': boil each slide down to one sentence and make it the title or key message (one slide, one message). People forget most of what they hear, so state the essence explicitly",
      "Text-only document test: convert the slide to a text-only document and check it still makes sense. If it doesn't, no amount of figures or images will fix it. Write an explanation that works in text first, then visualize it",
      "Fix the text first: most of a slide is text, so tuning font, emphasis, letter/line spacing, wording, and placement alone greatly improves legibility. Add headings, make numbers big, limit emphasis to bold (avoid shadow/underline/multi-color). Left-align long text, right-align numbers",
      "Choose the right symbol: per message, consciously pick text, figure, graph, or photo. Text is dense and powerful but needs a 'read it' step; visualize the points you want understood in seconds. Use generate_detail_slide for detailed explanation / Q&A / benefits pages",
      "Extract structure: decide whether the bullets are parallel, contrast, containment, sequence, or causation, then map them to a figure via recommend_figure / list_schematic_presets (list/contrast/tree/flow-step/cycle/matrix). This is the most important and hardest step. Turn bullet lists into a labeled box grid (category = header cell + item cells) sorted into rows/columns",
      "Reduce noise = cut / align / space: (1) cut unneeded messages, colors, lines, and decoration and sharpen to one message; (2) align elements cleanly; (3) add whitespace and put related items close. Make everything gray first, then give an accent to only the one element that must stand out. Whitespace is an invisible divider — separate with space, not rules or boxes, to cut noise",
      "Use color sparingly: low-chroma backgrounds and neutral surfaces; reserve the accent for thin rules, icons, badges, and a single focal object. Every color you place carries meaning. Never encode state with red/green alone",
      "Keep shapes consistent: use rectangle, circle, and triangle, and once a style is set (corner radius, stroke width, spacing) keep it consistent across the deck. Keep corner radius restrained and never distort a shape's aspect ratio",
      "Don't let a figure float: give every figure/visual a region (box) and a title to anchor its meaning. Differentiate roles by color/shape, keep arrows in a supporting role (not the star, restrained size) and use direction/type to show what is exchanged. Give whitespace meaning (no needlessly tiny or huge visuals)",
      "Every placement has a reason: whitespace is an element. Create the regions first, lay out boxes to build structure, lead the eye in a Z (top-left to bottom-right), and be able to explain why each element sits where it does. Organize your thoughts with paper and pen before opening PowerPoint",
      "Write legends/labels directly on the elements, keep gridlines and rules supporting and the text the lead, and let polish_deck_layout wrap text instead of hand-coding breaks",
      "Show with concrete examples and structure abstract-then-concrete. Think one level up: the goal is 'it gets across' — the tool and the decoration are only means",
      "Learn from predecessors: reuse existing templates (search_templates) and registered icons (search_assets), and run review_content -> lint_deck -> review_deck before render_pptx"
    ],
    forbidden: [
      "Self-diagnose on two axes (amount of information x amount of decoration) and avoid the six failure types (the ideal is balanced on both axes)",
      "Too sparse (thin content, only whitespace) — rework the content (message and evidence) before the design",
      "Too dense (crammed with information)",
      "Wall-of-text body copy instead of a figure",
      "Leaning on decorative photos to paper over a weak message",
      "Flat emphasis where every element has the same weight",
      "Over-decoration: many colors, heavy borders, shadows, and effects",
      "Repeating three or more colored accent-bar cards as the main slide expression; keep accent bars to one focal card and convert comparison, decision, process, or overview content into table, matrix, flow, or ponchi-e",
      "External legends, gridlines as the lead, state encoded by color alone, arrows as the star, or inconsistent shape styles (e.g. mismatched corner radii)"
    ]
  }
];

export function listSkillPacks(): SkillPack[] {
  return BUILTIN_SKILL_PACKS.map((skill) => SkillPackSchema.parse(skill));
}

export function getSkillPack(id: string): SkillPack | undefined {
  return listSkillPacks().find((skill) => skill.id === id);
}
