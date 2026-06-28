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
        "DeckSpecを書く前にMessage Map / SlideIntentを作り、各スライドのmessage・evidence・visualType・emphasisを決める。メッセージが曖昧ならヒアリングしてから進める。",
        "PDF知見: いきなりPowerPointを立ち上げない。先に「聴き手に何を納得/行動してもらうか」「贈り物として何を渡すか」を紙・メモ・Message Mapで決める。",
        "経営向け・顧客向け・重要会議・コンサル風資料では plan_business_deck を先に実行し、章構成と各スライドの役割を決める。",
        "search_templates / recommend_template で template を決め、search_assets で既存アイコン・クラウドプリセットを先に探す。",
        "PDF知見: 先人に学ぶ。ゼロから自由配置で発明せず、既存テンプレート、schematic、intent diagram、side-image など近い型を選んでから内容を当てはめる。",
        "意図した構図・粒度がある図解は generate_intent_diagram を先に使い、それ以外は list_schematic_presets で型を選んで generate_schematic、または generate_native_diagram でテキスト・カード・矢印・ラベルを編集可能な形で作る。",
        "DeckSpec 作成後は finalize_deck（または CLI `pptcreater finalize <deck.json> --output <deck.pptx>`）で polish→lint→render を1回でまとめて実行する。改行・はみ出し・小さすぎる文字・読み上げ順などの polishFixable 項目は polish が自動修正するので手作業で直さない。blockingErrors（本当に直すべき項目）だけを修正して再実行する。lint/polish/render を別々に何度も呼ぶ非効率なループは避ける。"
      ]
    : [
        "Read these get_slide_creation_rules / pptcreater rules first and treat them as constraints for the DeckSpec you are about to write.",
        "If purpose, audience, contentMode, slide count, sources, template, or brand constraints are unclear, clarify or make explicit assumptions before writing DeckSpec.",
        "Before writing DeckSpec, create a Message Map / SlideIntent set that defines message, evidence, visualType, and emphasis for each slide. If the message is unclear, interview first.",
        "PDF-derived rule: do not open PowerPoint first. Decide what the audience should understand/do and what 'gift' the slide gives them using paper, notes, or Message Map before layout.",
        "For executive, customer-facing, important-meeting, or consulting-style decks, run plan_business_deck first to define sections and slide roles.",
        "Choose the template through search_templates / recommend_template, and search_assets before creating new icons or cloud pictograms.",
        "PDF-derived rule: learn from predecessors. Do not invent freeform layouts from scratch; choose the nearest existing template, schematic, intent diagram, or side-image pattern, then adapt content.",
        "Use generate_intent_diagram first when a diagram has a known intended composition/granularity; otherwise call list_schematic_presets and use generate_schematic, or use generate_native_diagram so diagrams, cards, arrows, and labels remain editable.",
        "After DeckSpec creation, run finalize_deck (or CLI `pptcreater finalize <deck.json> --output <deck.pptx>`) to polish, lint, and render in a single pass. polishFixable items (line breaks, overflow, too-small text, reading order) are auto-resolved by polish — do not hand-edit them; fix only the blockingErrors and re-run. Avoid the slow loop of calling lint, polish, and render separately and repeatedly."
      ];

  const hardRules = locale === "ja-JP"
    ? [
        "1スライド1メッセージ。複数論点・複数判断・複数フローを1枚に詰め込まない。",
        "主役は作り手ではなく聴き手。自分が話したい順ではなく、相手が納得し行動しやすい順に並べる。",
        "スライドはメッセージを伝える手段であり目的ではない。キー・メッセージ・図表の3要素を先に分ける。",
        "主役を強める前に脇役を弱める。不要な線、濃い枠、過剰な色、巨大な矢印、装飾アイコンを減らして、残す主役を明確にする。",
        "文字を減らすこと自体を目的にしない。必要な文字は残し、意味のかたまり・見出し・図表で読める構造にする。",
        contentGuidance.titleModel,
        contentGuidance.messageModel,
        contentGuidance.bodyModel,
        "本文は原則3-5チャンク。長い説明文、前提、読み上げ原稿は speakerNotes に移す。",
        "手動改行で詰め込まない。長いラベルは短縮し、必要ならスライドを分割する。",
        "最終PPTXでは render-blocking lint を force しない。エラーは内容・構造・配置を直して解消する。"
      ]
    : [
        "One slide, one message. Do not combine multiple arguments, decisions, or flows on one slide.",
        "The audience is the protagonist. Order content by what helps them understand, agree, and act — not by the author's thinking order.",
        "Slides are a means to convey a message, not the goal. Separate key point, message, and visual/table before designing.",
        "Before strengthening the hero, weaken supporting elements: remove unnecessary lines, heavy borders, excessive color, oversized arrows, and decorative icons.",
        "Do not make text reduction the goal. Keep necessary words, but organize them into semantic chunks, headings, and visuals/tables.",
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
        "PDF知見: レイアウトは思考を映す鏡。行き当たりばったりで要素を置かず、タテ・ヨコの軸、視線の流れ、意味のかたまりを先に決める。",
        "余白は余った白ではなく設計要素。スライド端まで詰めず、主役以外を弱めることでメッセージを際立たせる。",
        "横書きスライドでは左上から右へ、次に下へ向かう視線のストーリーを意識する。Z型/横方向の流れに沿わない配置は、見出し・番号・矢印・余白で順路を明示する。",
        "6枚を超えるデッキでは、主要な章の冒頭に generate_section_divider で扉スライド(layout: section)を挿入し、章の切り替えを明示する。扉スライドは視覚リッチネス判定の対象外。",
        "タイトルは原則30pt以上、リード/メッセージは18pt以上、本文は14pt以上、ラベル/注釈は12pt以上を目安にする。",
        "テキストボックスは最初から十分な幅・高さを取る。短い高さの横長カードに長文を入れない。",
        "装飾背景やカードは text より低い readingOrder にする。opaque な shape をテキスト上に置かない。",
        "比較は table/contrast、階層は tree/layer、工程は flow/vertical-flow/cycle/step、分析は matrix/scale-contrast/grow/ranking、複数軸のスコアプロファイルは radar、予定は gantt、集合・関係は venn/set/puzzle/correlation/map、3-4点要約は list/list-horizontal を優先する。"
      ]
    : [
        "Decide the layout frame before placing elements: title band, message band, body/visual area, and notes must not overlap.",
        "PDF-derived rule: layout mirrors thinking. Do not place objects ad hoc; decide vertical/horizontal axes, eye flow, and semantic chunks first.",
        "Whitespace is a designed element, not leftover space. Avoid edge-to-edge clutter and weaken supporting elements so the message stands out.",
        "For horizontal slides, plan the eye-flow story from upper-left to right, then downward. If the layout breaks the Z/left-to-right flow, clarify the route with headings, numbers, arrows, or whitespace.",
        "For decks longer than six slides, insert section divider slides (layout 'section') via generate_section_divider at the start of each major section to signal chapter changes; divider slides are exempt from the visual-richness gate.",
        "Use roughly >=30pt titles, >=18pt leads/messages, >=14pt body text, and >=12pt labels/notes.",
        "Allocate enough width and height up front. Do not put long copy into shallow horizontal cards.",
        "Decorative backgrounds/cards must have lower readingOrder than text. Never place opaque shapes over text.",
        "Use table/contrast for comparisons, tree/layer for hierarchy, flow/vertical-flow/cycle/step for processes, matrix/scale-contrast/grow/ranking for analysis, radar for multi-axis score profiles, gantt for schedules, venn/set/puzzle/correlation/map for grouping or relationships, and list/list-horizontal for 3-4 point summaries."
      ];

  const visualRules = locale === "ja-JP"
    ? [
        "通常の本文スライドはプレーンなテキストだけにしない。少なくともカード、アイコン、表、図解、フロー、ツリー、タイムライン、または Slideland 風 schematic パターンのいずれかを入れる。詳細説明・Q&A・得られることなど、読むこと自体が目的のスライドは detail/prose/structured-text として扱い、見出し、インデント、太字、色、余白で認知負荷を下げる。",
        "図解を別途作らない本文スライドには generate_visual_scaffold で右側に編集可能なコンセプトビジュアル(パネル＋アイコン/モノグラム＋見出し＋観点チップ)を付け、テキストのみ・低リッチネスを避ける。観点チップは短いフレーズ(目安24字以内)に絞る。",
        "色付きライン付きカードを3つ以上並べるだけの表現を避ける。カードは主役1つの強調に留め、比較は table/contrast、判断は matrix、流れは flow、全体像は map/ponchi-e に変換する。",
        "公式画像・製品画面・現地写真・調査したイメージ図を使える場合は、visualType: image と visualAsset(altText/sourceId/citation/placement)で左右どちらかに画像、反対側にメッセージと根拠を置く。権利が不明な画像は貼らず、編集可能なイメージ図として再作成する。",
        "Enterprise Access Model、閉じた特権経路、左右比較など構図を外したくない概念図は generate_intent_diagram を使う。一般的なアーキテクチャ/セキュリティ/制御フロー/ポンチ絵は generate_native_diagram を使い、ローカルSVGを image.path として貼らない。",
        "プロセスや変化の表現は generate_intent_diagram のプリセットを使い分ける: 反復工程は lifecycle、段階的高度化は maturity-ladder、現状と目標の対比は before-after、中核機能と関連領域の関係は relationship-map。",
        "表は罫線ではなく文字が主役。格子を濃くしない。必要な列/行のまとまり、見出し、余白、強調だけで読ませる。",
        "グラフは軸・目盛り・凡例ではなく視覚的情報が主役。不要な目盛線やラベルを弱め、主張に関係する系列や数字だけを強調する。",
        "矢印は脇役。大きすぎる矢印や手置きの斜め矢印で主役を奪わない。工程は flow/step/native diagram、関係性は hub/map/relationship-map を使う。",
        "写真や画像頼りにしない。写真は雰囲気・実物確認・公式画面の文脈を作る用途に絞り、必ず隣にメッセージと根拠を置く。",
        "SVG図を使う場合も、可視ラベルを入れ、内部テキストが8pt未満にならないサイズで配置する。",
        "クラウド/ベンダー図では search_assets で preset-azure / preset-entra / preset-aws / preset-google を先に探す。公式SVGが必要な場合は list_icon_sources でライセンスを確認してから登録する。",
        "色だけで意味を表さない。状態・差分・リスクにはラベル、形、アイコン、凡例を併用する。",
        "文字が黒い塊に見える場合は、文章を短くするだけでなく、意味のかたまり、見出し、余白、数字の強調、図表化で読み始めやすくする。"
      ]
    : [
        "Plain content slides should not be text-only. Include cards, icons, tables, diagrams, flows, trees, timelines, or Slideland-style schematic patterns. When reading is the point (detail explanation, Q&A, benefits, policy text), use a detail/prose/structured-text layout and reduce cognitive load with headings, indentation, bold emphasis, color, and whitespace.",
        "For content slides without a dedicated diagram, attach an editable right-rail concept visual (panel + icon/monogram + heading + aspect chips) via generate_visual_scaffold to avoid text-only/low-richness slides. Keep aspect chips to short phrases (~24 chars max).",
        "Do not build slides by repeating three or more colored accent-bar cards. Keep accent bars for at most one focal card; convert comparisons to table/contrast, decisions to matrix, processes to flow, and overviews to map/ponchi-e.",
        "When an official image, product screenshot, field photo, or researched illustration is appropriate and rights are clear, use visualType: image with visualAsset (altText/sourceId/citation/placement): image on one side, message/evidence on the other. If rights are unclear, recreate the idea as an editable illustration instead of embedding the source image.",
        "Use generate_intent_diagram for concept diagrams where composition must not drift, such as Enterprise Access Model, closed privileged paths, or side-by-side comparisons. Use generate_native_diagram for general architecture/security/control-flow/ponchi-e diagrams; do not paste local SVG diagrams as image.path.",
        "Pick the right generate_intent_diagram preset for process/change stories: lifecycle for repeating cycles, maturity-ladder for staged improvement, before-after for current-vs-target contrast, and relationship-map for a hub function and its related domains.",
        "In tables, text is the hero, not grid lines. Keep grids light and use grouping, headers, whitespace, and selective emphasis to guide reading.",
        "In charts, visual information is the hero, not axes, ticks, or legends. Weaken unnecessary gridlines/labels and emphasize only the series or numbers tied to the message.",
        "Arrows are supporting actors. Do not let oversized or hand-placed diagonal arrows steal attention. Use flow/step/native diagram for processes and hub/map/relationship-map for relationships.",
        "Do not rely on photos alone. Use photos for atmosphere, real-world proof, or official-screen context, and always pair them with a message and evidence.",
        "If SVG diagrams are used, include visible labels and place them large enough that internal text stays at least 8pt.",
        "For cloud/vendor diagrams, search_assets for preset-azure / preset-entra / preset-aws / preset-google first. If exact official SVGs are required, check list_icon_sources before registering them.",
        "Do not encode meaning by color alone; combine labels, shapes, icons, or legends for state, difference, and risk.",
        "If text looks like a black block, do not only shorten it; create semantic chunks, headings, whitespace, numeric emphasis, and visuals/tables so the reader knows where to start."
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
        "公式画像・写真・スクリーンショットを使う場合は visualAsset.sourceId / citation と metadata.sources を必ず対応させ、altText を入れる。引用ではなく参考利用なら、画像を貼らずに意味だけを図解として再構成する。",
        "参照URLは最終スライドへ集約されるため、DeckSpec 生成時点で sources を欠落させない。"
      ]
    : [
        "Record external URLs/documents in metadata.sources with url and usage.",
        "Quote source visuals only when exact fidelity and usage rights are clear; otherwise recreate them as editable visuals.",
        "When using official images, photos, or screenshots, pair visualAsset.sourceId / citation with metadata.sources and provide altText. If the source is only inspiration, do not embed it; recreate the meaning as an editable diagram.",
        "References are collected on the final slide, so do not omit sources during DeckSpec creation."
      ];

  const preflightChecklist = locale === "ja-JP"
    ? [
        "タイトル/メッセージ/本文が contentMode の文字量内に収まっている。",
        "通常の本文スライドがプレーンなテキストだけではなく、1つの視覚文法に沿っている。テキスト主体スライドは detail/prose/structured-text として見出し・インデント・強調・色・余白がある。",
        "長いラベル・長文・脚注をスライド面に詰め込まず、分割または notes に移している。",
        "構図意図がある概念図は intent diagram、一般的なアーキテクチャ/フロー図は native diagram、構造化図解はモード別 schematic プリセットで作っている。",
        "altText、readingOrder、sources、コントラストを最初から入れている。"
      ]
    : [
        "Titles/messages/body copy fit the selected contentMode limits.",
        "Plain content slides are not text-only and use one visual grammar; intentional text-rich slides use detail/prose/structured-text with hierarchy, indentation, emphasis, color, and whitespace.",
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
