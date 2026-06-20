import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  SCHEMATIC_KIND_CATALOG,
  SCHEMATIC_KINDS,
  renderSchematicDiagram,
  schematicToneForStyleProfile
} from "../packages/diagram/dist/index.js";

const outputPath = resolve("samples", "schematic-patterns.deck.json");
const styleProfiles = ["minimal", "stylish", "report", "presentation", "technical"];

const tokens = {
  colors: {
    background: "#ffffff",
    surface: "#f6f5f2",
    text: "#1f2933",
    mutedText: "#59636e",
    accent: "#315f9f",
    danger: "#9f3a38",
    success: "#2f6f55"
  },
  typography: {
    headingFont: "Yu Gothic",
    bodyFont: "Yu Gothic",
    fallbackFonts: ["Meiryo", "Hiragino Kaku Gothic ProN", "Arial", "sans-serif"],
    titleSize: 38,
    bodySize: 22,
    captionSize: 14
  },
  spacing: {
    margin: 0.6,
    gutter: 0.28,
    radius: 0.1
  }
};

const examples = {
  table: {
    title: "表: 論点と判断材料をそろえる",
    items: ["観点", "品質", "速度", "再利用", "安全性"],
    secondaryItems: ["確認事項", "lintで検証", "finalizeで短縮", "assetsを検索", "safe SVGのみ"]
  },
  tree: {
    title: "ツリー: 複雑な情報を階層で整理する",
    items: ["PPT作成", "構成", "図解", "資産", "検証", "出力"]
  },
  flow: {
    title: "横型フロー: 作成から検証までを迷わず進める",
    items: ["brief", "template", "schematic", "lint", "render"]
  },
  "vertical-flow": {
    title: "縦型フロー: 承認プロセスを上から下へ示す",
    items: ["申請", "レビュー", "承認", "配布", "改善"]
  },
  cycle: {
    title: "サイクル: 継続改善を循環で見せる",
    items: ["計画", "作成", "確認", "修正", "公開", "学習"]
  },
  "before-after": {
    title: "前後比較: 現状と改善後の差分を見せる",
    items: ["Before", "手作業で配置", "改行が不安定", "修正ループが長い", "再利用しづらい"],
    secondaryItems: ["After", "プリセットを選択", "自動fit", "finalizeで短縮", "サンプルを再利用"]
  },
  map: {
    title: "マップ: 制御ポイントを空間的に把握する",
    items: ["入力", "生成", "検証", "公開", "改善"],
    secondaryItems: ["主要ポイント"]
  },
  puzzle: {
    title: "パズル/ハニカム: 構成要素を一体感で示す",
    items: ["テンプレート", "配色", "余白", "アイコン", "図解", "検証", "出力"]
  },
  correlation: {
    title: "相関図: 中心概念と周辺要素の関係を示す",
    items: ["高品質なDeckSpec", "テンプレート", "アイコン", "図解", "lint", "render"],
    secondaryItems: ["選択", "装飾", "構造化", "検査", "出力"]
  },
  matrix: {
    title: "マトリクス: 優先度を2軸で判断する",
    items: ["Quick win", "Strategic", "Defer", "Maintain"],
    axisX: "実装容易性",
    axisY: "効果"
  },
  venn: {
    title: "ベン図: 重なりから価値を説明する",
    items: ["Design", "Automation", "Accessibility"],
    secondaryItems: ["信頼できるスライド"]
  },
  cross: {
    title: "数式: 複数要素を成果へつなげる",
    items: ["構成", "図解", "検証"],
    secondaryItems: ["美しいPPTX"]
  },
  set: {
    title: "グループ/集合: 要素をまとまりで見せる",
    items: ["Planning", "Visual", "Quality"],
    secondaryItems: ["brief", "story", "icons", "schematic", "lint", "render"]
  },
  contrast: {
    title: "項目比較: 2案の違いを並べて見せる",
    items: ["Freehand", "自由度が高い", "崩れやすい", "再現性が低い"],
    secondaryItems: ["Preset", "短時間で作れる", "崩れにくい", "再利用しやすい"]
  },
  "scale-contrast": {
    title: "規模比較: 数値差を面積で直感化する",
    items: ["Manual 80", "Preset 45", "Finalize 25", "Sample 15"],
    secondaryItems: ["80", "45", "25", "15"]
  },
  grow: {
    title: "規模分析: TAM/SAM/SOMを同心円で示す",
    items: ["TAM", "SAM", "SOM"],
    secondaryItems: ["全体市場", "到達可能市場", "初期対象"]
  },
  layer: {
    title: "レイヤー構造: アーキテクチャを積層で説明する",
    items: ["Experience", "Workflow", "Validation", "Rendering", "Assets"],
    secondaryItems: ["UI", "Agent", "Core", "PPTX", "SVG"]
  },
  triangle: {
    title: "トライアングル: 基盤から頂点までを示す",
    items: ["Outcome", "Visual grammar", "DeckSpec rules", "Accessible tokens"]
  },
  step: {
    title: "階段: 成熟度やロードマップを段階で示す",
    items: ["導入", "標準化", "自動化", "最適化", "展開"]
  },
  gantt: {
    title: "ガントチャート: 作業と期間を同じ面で見る",
    items: ["設計", "実装", "サンプル", "検証", "公開"],
    secondaryItems: ["W1", "W2", "W3", "W4"]
  },
  ranking: {
    title: "ランキング: 優先順位と差を同時に見せる",
    items: ["Flow 95", "Matrix 80", "Layer 70", "Gantt 52", "Venn 35"],
    secondaryItems: ["95", "80", "70", "52", "35"]
  },
  list: {
    title: "箇条書き縦: 重要項目を読みやすく並べる",
    items: ["1スライド1メッセージ", "十分な余白", "可視ラベル", "高コントラスト", "出典管理"]
  },
  "list-horizontal": {
    title: "箇条書き横: 3-4点をカードで見せる",
    items: ["低彩度カラー", "8ptグリッド", "アイコン活用", "可読性優先"]
  },
  "list-enumeration": {
    title: "箇条書き羅列: 手順やチェックを番号で示す",
    items: ["rulesを読む", "型を選ぶ", "DeckSpecを書く", "finalizeする", "公開する"]
  },
  mockup: {
    title: "モックアップ: UIやポータルの概念を簡潔に示す",
    items: ["Templates", "Assets", "Schematics", "Finalize"]
  }
};

function referenceSlide() {
  return {
    id: "source-references",
    title: "参考URL・出典",
    layout: "references",
    speakerNotes:
      "Source URLs and attribution:\n1. Slideland schematic and taste references | URL: https://www.slideland.tech/docs/schematic | Notes: Layouts are inspired by common schematic categories, not copied from source visuals.",
    elements: [
      {
        id: "references-title",
        type: "text",
        role: "title",
        text: "参考URL・出典",
        x: 0.75,
        y: 0.58,
        w: 11.8,
        h: 0.9,
        fontSize: 34,
        color: tokens.colors.text,
        contrastBackground: tokens.colors.background,
        bold: true,
        decorative: false,
        readingOrder: 1
      },
      {
        id: "references-message",
        type: "text",
        role: "body",
        text: "外部サイトを参照した内容は、以下のURLを出典として確認できます（1件）。",
        x: 0.78,
        y: 1.48,
        w: 11.6,
        h: 0.42,
        fontSize: 20,
        color: tokens.colors.mutedText,
        contrastBackground: tokens.colors.background,
        bold: false,
        decorative: false,
        readingOrder: 2
      },
      {
        id: "reference-1",
        type: "text",
        role: "caption",
        text: "1. Slideland schematic and taste references\nhttps://www.slideland.tech/docs/schematic",
        x: 0.85,
        y: 2.08,
        w: 11.45,
        h: 4.76,
        fontSize: 14,
        color: tokens.colors.text,
        contrastBackground: tokens.colors.background,
        bold: false,
        decorative: false,
        readingOrder: 3
      }
    ]
  };
}

const slides = SCHEMATIC_KINDS.map((kind, index) => {
  const entry = SCHEMATIC_KIND_CATALOG[kind];
  const sample = examples[kind];
  const styleProfile = styleProfiles[index % styleProfiles.length];
  const title = sample.title ?? `${entry.labelJa}: ${entry.labelEn}`;
  const longDescription = `${entry.labelJa} (${kind}) のサンプルです。${entry.description} pptcreater の安全なschematicプリセットで生成しています。`;
  const rendered = renderSchematicDiagram({
    kind,
    title,
    summary: `${entry.labelJa} schematic sample`,
    longDescription,
    items: sample.items,
    secondaryItems: sample.secondaryItems ?? [],
    axisX: sample.axisX,
    axisY: sample.axisY,
    tone: schematicToneForStyleProfile(styleProfile)
  });

  return {
    id: `schematic-${kind}`,
    title,
    layout: "schematic",
    speakerNotes: `Pattern: ${kind}. Style profile: ${styleProfile}. ${entry.description}`,
    elements: [
      {
        id: `${kind}-visual`,
        x: 0,
        y: 0,
        w: 13.333,
        h: 7.5,
        readingOrder: 1,
        decorative: false,
        altText: `${entry.labelJa} (${kind}) schematic sample`,
        type: "diagram",
        svg: rendered.svg,
        summary: rendered.summary,
        longDescription: rendered.longDescription
      }
    ]
  };
});

const deck = {
  version: "0.1",
  title: "pptcreater schematic pattern samples",
  locale: "ja-JP",
  template: "modern-simple",
  skillPack: "slide-briefing-ja",
  tokens,
  slides: [...slides, referenceSlide()],
  metadata: {
    keywords: ["schematic", "slideland-inspired", ...SCHEMATIC_KINDS],
    contentMode: "presentation",
    sources: [
      {
        id: "slideland-schematic-inspiration",
        title: "Slideland schematic and taste references",
        url: "https://www.slideland.tech/docs/schematic",
        usage: "inspiration",
        notes: "Layouts are inspired by common schematic categories, not copied from source visuals."
      }
    ]
  }
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(deck, null, 2)}\n`, "utf8");
console.log(`Created ${outputPath} with ${slides.length} schematic pattern slides.`);
