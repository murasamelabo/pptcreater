import type { ContentMode, Locale } from "./schema.js";
import { getContentGuidance } from "./content.js";

export type SlideCreationRules = {
  locale: Locale;
  contentMode: ContentMode;
  goal: string;
  workflow: string[];
  hardRules: string[];
  layoutRules: string[];
  visualRules: string[];
  accessibilityRules: string[];
  sourceRules: string[];
  preflightChecklist: string[];
  agentPrompt: string;
};

function localeText(locale: Locale, japanese: string, english: string): string {
  return locale === "ja-JP" ? japanese : english;
}

export function getSlideCreationRules(locale: Locale = "ja-JP", contentMode: ContentMode = "presentation"): SlideCreationRules {
  const contentGuidance = getContentGuidance(locale, contentMode);
  const goal = localeText(
    locale,
    "初回生成で lint/polish/render の修正ループを最小化するため、DeckSpec を書く前にこの制約内で構成・文章・図解・配置を決める。",
    "Minimize lint/polish/render retry loops by choosing structure, copy, visuals, and placement inside these constraints before writing DeckSpec."
  );
  const workflow = locale === "ja-JP"
    ? [
        "最初にこの get_slide_creation_rules / pptcreater rules の内容を読み、以後の DeckSpec 生成制約として扱う。",
        "目的・聴衆・contentMode・枚数・出典・使うテンプレート/ブランドが曖昧なら、DeckSpec を書く前に確認または合理的に仮定する。",
        "経営向け・顧客向け・重要会議・コンサル風資料では plan_business_deck を先に実行し、章構成と各スライドの役割を決める。",
        "search_templates / recommend_template で template を決め、search_assets で既存アイコン・クラウドプリセットを先に探す。",
        "意図した構図・粒度がある図解は generate_intent_diagram を先に使い、それ以外は list_schematic_presets で型を選んで generate_schematic、または generate_native_diagram でテキスト・カード・矢印・ラベルを編集可能な形で作る。",
        "DeckSpec 作成後は finalize_deck（または CLI `pptcreater finalize <deck.json> --output <deck.pptx>`）で polish→lint→render を1回でまとめて実行する。改行・はみ出し・小さすぎる文字・読み上げ順などの polishFixable 項目は polish が自動修正するので手作業で直さない。blockingErrors（本当に直すべき項目）だけを修正して再実行する。lint/polish/render を別々に何度も呼ぶ非効率なループは避ける。"
      ]
    : [
        "Read these get_slide_creation_rules / pptcreater rules first and treat them as constraints for the DeckSpec you are about to write.",
        "If purpose, audience, contentMode, slide count, sources, template, or brand constraints are unclear, clarify or make explicit assumptions before writing DeckSpec.",
        "For executive, customer-facing, important-meeting, or consulting-style decks, run plan_business_deck first to define sections and slide roles.",
        "Choose the template through search_templates / recommend_template, and search_assets before creating new icons or cloud pictograms.",
        "Use generate_intent_diagram first when a diagram has a known intended composition/granularity; otherwise call list_schematic_presets and use generate_schematic, or use generate_native_diagram so diagrams, cards, arrows, and labels remain editable.",
        "After DeckSpec creation, run finalize_deck (or CLI `pptcreater finalize <deck.json> --output <deck.pptx>`) to polish, lint, and render in a single pass. polishFixable items (line breaks, overflow, too-small text, reading order) are auto-resolved by polish — do not hand-edit them; fix only the blockingErrors and re-run. Avoid the slow loop of calling lint, polish, and render separately and repeatedly."
      ];

  const hardRules = locale === "ja-JP"
    ? [
        "1スライド1メッセージ。複数論点・複数判断・複数フローを1枚に詰め込まない。",
        contentGuidance.titleModel,
        contentGuidance.messageModel,
        contentGuidance.bodyModel,
        "本文は原則3-5チャンク。長い説明文、前提、読み上げ原稿は speakerNotes に移す。",
        "手動改行で詰め込まない。長いラベルは短縮し、必要ならスライドを分割する。",
        "最終PPTXでは render-blocking lint を force しない。エラーは内容・構造・配置を直して解消する。"
      ]
    : [
        "One slide, one message. Do not combine multiple arguments, decisions, or flows on one slide.",
        contentGuidance.titleModel,
        contentGuidance.messageModel,
        contentGuidance.bodyModel,
        "Use 3-5 body chunks by default. Move long narrative, assumptions, and talk-track text to speakerNotes.",
        "Do not cram content with manual line breaks. Shorten labels and split slides when needed.",
        "Do not force render-blocking lint errors in final PPTX output; fix content, structure, or placement."
      ];

  const layoutRules = locale === "ja-JP"
    ? [
        "まずレイアウト枠を決めてから要素を置く。タイトル帯、メッセージ帯、本文/図解エリア、注釈エリアを重ねない。",
        "6枚を超えるデッキでは、主要な章の冒頭に generate_section_divider で扉スライド(layout: section)を挿入し、章の切り替えを明示する。扉スライドは視覚リッチネス判定の対象外。",
        "タイトルは原則30pt以上、リード/メッセージは18pt以上、本文は14pt以上、ラベル/注釈は12pt以上を目安にする。",
        "テキストボックスは最初から十分な幅・高さを取る。短い高さの横長カードに長文を入れない。",
        "装飾背景やカードは text より低い readingOrder にする。opaque な shape をテキスト上に置かない。",
        "比較は table/contrast、階層は tree/layer、工程は flow/vertical-flow/cycle/step、分析は matrix/scale-contrast/grow/ranking、予定は gantt、集合・関係は venn/set/puzzle/correlation/map、3-4点要約は list/list-horizontal を優先する。"
      ]
    : [
        "Decide the layout frame before placing elements: title band, message band, body/visual area, and notes must not overlap.",
        "For decks longer than six slides, insert section divider slides (layout 'section') via generate_section_divider at the start of each major section to signal chapter changes; divider slides are exempt from the visual-richness gate.",
        "Use roughly >=30pt titles, >=18pt leads/messages, >=14pt body text, and >=12pt labels/notes.",
        "Allocate enough width and height up front. Do not put long copy into shallow horizontal cards.",
        "Decorative backgrounds/cards must have lower readingOrder than text. Never place opaque shapes over text.",
        "Use table/contrast for comparisons, tree/layer for hierarchy, flow/vertical-flow/cycle/step for processes, matrix/scale-contrast/grow/ranking for analysis, gantt for schedules, venn/set/puzzle/correlation/map for grouping or relationships, and list/list-horizontal for 3-4 point summaries."
      ];

  const visualRules = locale === "ja-JP"
    ? [
        "本文スライドはテキストだけにしない。少なくともカード、アイコン、表、図解、フロー、ツリー、タイムライン、または Slideland 風 schematic パターンのいずれかを入れる。",
        "図解を別途作らない本文スライドには generate_visual_scaffold で右側に編集可能なコンセプトビジュアル(パネル＋アイコン/モノグラム＋見出し＋観点チップ)を付け、テキストのみ・低リッチネスを避ける。観点チップは短いフレーズ(目安24字以内)に絞る。",
        "色付きライン付きカードを3つ以上並べるだけの表現を避ける。カードは主役1つの強調に留め、比較は table/contrast、判断は matrix、流れは flow、全体像は map/ponchi-e に変換する。",
        "Enterprise Access Model、閉じた特権経路、左右比較など構図を外したくない概念図は generate_intent_diagram を使う。一般的なアーキテクチャ/セキュリティ/制御フロー/ポンチ絵は generate_native_diagram を使い、ローカルSVGを image.path として貼らない。",
        "プロセスや変化の表現は generate_intent_diagram のプリセットを使い分ける: 反復工程は lifecycle、段階的高度化は maturity-ladder、現状と目標の対比は before-after、中核機能と関連領域の関係は relationship-map。",
        "SVG図を使う場合も、可視ラベルを入れ、内部テキストが8pt未満にならないサイズで配置する。",
        "クラウド/ベンダー図では search_assets で preset-azure / preset-entra / preset-aws / preset-google を先に探す。公式SVGが必要な場合は list_icon_sources でライセンスを確認してから登録する。",
        "色だけで意味を表さない。状態・差分・リスクにはラベル、形、アイコン、凡例を併用する。"
      ]
    : [
        "Content slides must not be text-only. Include cards, icons, tables, diagrams, flows, trees, timelines, or Slideland-style schematic patterns.",
        "For content slides without a dedicated diagram, attach an editable right-rail concept visual (panel + icon/monogram + heading + aspect chips) via generate_visual_scaffold to avoid text-only/low-richness slides. Keep aspect chips to short phrases (~24 chars max).",
        "Do not build slides by repeating three or more colored accent-bar cards. Keep accent bars for at most one focal card; convert comparisons to table/contrast, decisions to matrix, processes to flow, and overviews to map/ponchi-e.",
        "Use generate_intent_diagram for concept diagrams where composition must not drift, such as Enterprise Access Model, closed privileged paths, or side-by-side comparisons. Use generate_native_diagram for general architecture/security/control-flow/ponchi-e diagrams; do not paste local SVG diagrams as image.path.",
        "Pick the right generate_intent_diagram preset for process/change stories: lifecycle for repeating cycles, maturity-ladder for staged improvement, before-after for current-vs-target contrast, and relationship-map for a hub function and its related domains.",
        "If SVG diagrams are used, include visible labels and place them large enough that internal text stays at least 8pt.",
        "For cloud/vendor diagrams, search_assets for preset-azure / preset-entra / preset-aws / preset-google first. If exact official SVGs are required, check list_icon_sources before registering them.",
        "Do not encode meaning by color alone; combine labels, shapes, icons, or legends for state, difference, and risk."
      ];

  const accessibilityRules = locale === "ja-JP"
    ? [
        "全スライドに一意で説明的な title を入れる。",
        "非装飾の image/svg/diagram には altText を入れる。diagram には summary と longDescription も入れる。",
        "readingOrder はタイトル -> メッセージ -> 主図解/本文 -> 補足 -> 出典の順にする。",
        "通常テキストは十分なコントラストを確保し、低コントラストの薄いグレー文字を避ける。"
      ]
    : [
        "Every slide must have a unique descriptive title.",
        "Non-decorative image/svg/diagram elements need altText. Diagrams also need summary and longDescription.",
        "Set readingOrder as title -> message -> main visual/body -> supplement -> source.",
        "Keep sufficient text contrast and avoid low-contrast pale gray text."
      ];

  const sourceRules = locale === "ja-JP"
    ? [
        "外部URL・資料を使ったら metadata.sources に url と usage を記録する。",
        "出典図をそのまま引用するのは、正確性と利用権が明確な場合だけ。通常は編集可能な図として再作成する。",
        "参照URLは最終スライドへ集約されるため、DeckSpec 生成時点で sources を欠落させない。"
      ]
    : [
        "Record external URLs/documents in metadata.sources with url and usage.",
        "Quote source visuals only when exact fidelity and usage rights are clear; otherwise recreate them as editable visuals.",
        "References are collected on the final slide, so do not omit sources during DeckSpec creation."
      ];

  const preflightChecklist = locale === "ja-JP"
    ? [
        "タイトル/メッセージ/本文が contentMode の文字量内に収まっている。",
        "本文スライドがテキストだけではなく、1つの視覚文法に沿っている。",
        "長いラベル・長文・脚注をスライド面に詰め込まず、分割または notes に移している。",
        "構図意図がある概念図は intent diagram、一般的なアーキテクチャ/フロー図は native diagram、構造化図解はモード別 schematic プリセットで作っている。",
        "altText、readingOrder、sources、コントラストを最初から入れている。"
      ]
    : [
        "Titles/messages/body copy fit the selected contentMode limits.",
        "Content slides are not text-only and use one visual grammar.",
        "Long labels, prose, and footnotes are split or moved to notes.",
        "Concept diagrams with intended composition use intent diagrams; general architecture/flow diagrams use native diagrams, and structured visuals use mode-aware schematic presets.",
        "altText, readingOrder, sources, and contrast are present from the start."
      ];

  const agentPrompt = formatSlideCreationRules({
    locale,
    contentMode,
    goal,
    workflow,
    hardRules,
    layoutRules,
    visualRules,
    accessibilityRules,
    sourceRules,
    preflightChecklist,
    agentPrompt: ""
  });

  return {
    locale,
    contentMode,
    goal,
    workflow,
    hardRules,
    layoutRules,
    visualRules,
    accessibilityRules,
    sourceRules,
    preflightChecklist,
    agentPrompt
  };
}

export function formatSlideCreationRules(rules: Omit<SlideCreationRules, "agentPrompt"> | SlideCreationRules): string {
  const heading = rules.locale === "ja-JP" ? "PPTX 初回生成ルール" : "PPTX first-pass generation rules";
  const section = (title: string, items: string[]) => [`## ${title}`, ...items.map((item, index) => `${index + 1}. ${item}`)].join("\n");

  return [
    `# ${heading}`,
    "",
    rules.goal,
    "",
    section(rules.locale === "ja-JP" ? "生成前ワークフロー" : "Pre-generation workflow", rules.workflow),
    "",
    section(rules.locale === "ja-JP" ? "必須ルール" : "Hard rules", rules.hardRules),
    "",
    section(rules.locale === "ja-JP" ? "レイアウトルール" : "Layout rules", rules.layoutRules),
    "",
    section(rules.locale === "ja-JP" ? "ビジュアルルール" : "Visual rules", rules.visualRules),
    "",
    section(rules.locale === "ja-JP" ? "アクセシビリティ" : "Accessibility", rules.accessibilityRules),
    "",
    section(rules.locale === "ja-JP" ? "出典" : "Sources", rules.sourceRules),
    "",
    section(rules.locale === "ja-JP" ? "DeckSpec を書く直前の確認" : "Checklist before writing DeckSpec", rules.preflightChecklist)
  ].join("\n");
}
