import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listDesignComponents } from "../packages/core/dist/index.js";
import { renderDeckToPptx } from "../packages/render-pptx/dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const components = await listDesignComponents({ kind: "tree", roots: [resolve(root, "design-packs")] });

// Fresh, domain-specific data for each curated tree (different from the shipped sample).
// `at` keys are 0-based <a:t> run indices in the source slide; empty strings reduce the
// number of populated items to demonstrate variable item counts.
const replacementsById = {
  "tree-vertical-org": [
    { at: 2, to: "VERTICAL — EC事業部の組織体制" },
    { at: 3, to: "EC事業部長" },
    { at: 4, to: "マーケティング部" },
    { at: 5, to: "広告運用G" },
    { at: 6, to: "CRMG" },
    { at: 7, to: "商品部" },
    { at: 8, to: "仕入れG" },
    { at: 9, to: "在庫管理G" },
    { at: 10, to: "開発部" },
    { at: 11, to: "フロント開発" },
    { at: 12, to: "バックエンド開発" }
  ],
  "tree-horizontal": [
    { at: 2, to: "HORIZONTAL — 社内ドキュメントの分類" },
    { at: 3, to: "社内ナレッジ" },
    { at: 4, to: "開発" },
    { at: 5, to: "設計ガイド" },
    { at: 6, to: "レビュー規約" },
    { at: 7, to: "営業" },
    { at: 8, to: "提案テンプレ" },
    { at: 9, to: "価格表" },
    { at: 10, to: "労務" },
    { at: 11, to: "就業規則" },
    { at: 12, to: "勤怠規程" }
  ],
  "tree-logic": [
    { at: 2, to: "LOGIC — コストをMECEに分解する" },
    { at: 3, to: "コストを下げる" },
    { at: 4, to: "固定費を削る" },
    { at: 5, to: "オフィス費の見直し" },
    { at: 6, to: "人件費の最適化" },
    { at: 7, to: "変動費を削る" },
    { at: 8, to: "仕入れ単価の交渉" },
    { at: 9, to: "物流費の最適化" }
  ],
  "tree-indented": [
    { at: 2, to: "INDENTED — 新製品ローンチWBS" },
    { at: 3, to: "ローンチ計画 Q3" },
    { at: 4, to: "開発" },
    { at: 5, to: "ベータ版リリース" },
    { at: 6, to: "重大バグ修正" },
    { at: 7, to: "販促" },
    { at: 8, to: "LP制作" },
    { at: 9, to: "プレス配信" },
    { at: 10, to: "サポート体制" }
  ],
  "tree-decision": [
    { at: 2, to: "DECISION — 問い合わせ一次対応フロー" },
    { at: 3, to: "問い合わせ受信" },
    { at: 4, to: "FAQで" },
    { at: 5, to: "解決できる？" },
    { at: 6, to: "FAQ案内で完了" },
    { at: 9, to: "緊急度は高い？" },
    { at: 10, to: "担当へエスカレーション" },
    { at: 12, to: "翌営業日に回答" }
  ],
  "tree-radial": [
    { at: 2, to: "RADIAL — 採用強化プロジェクト" },
    { at: 3, to: "母集団形成" },
    { at: 4, to: "選考設計" },
    { at: 5, to: "面接官の育成" },
    { at: 6, to: "内定者フォロー" },
    { at: 7, to: "オンボーディング" },
    { at: 8, to: "受け入れ準備" },
    { at: 9, to: "採用強化" },
    { at: 10, to: "プロジェクト" }
  ],
  "tree-pyramid": [
    { at: 2, to: "PYRAMID — プロダクト戦略の構造" },
    { at: 3, to: "パーパス" },
    { at: 4, to: "戦略" },
    { at: 5, to: "ロードマップ" },
    { at: 6, to: "スプリント" },
    { at: 7, to: "パーパス" },
    { at: 8, to: "世の中への提供価値" },
    { at: 9, to: "戦略" },
    { at: 10, to: "注力市場と勝ち筋" },
    { at: 11, to: "ロードマップ" },
    { at: 12, to: "四半期ごとの重点" },
    { at: 13, to: "スプリント" },
    { at: 14, to: "2週間ごとの実装" }
  ]
};

const slides = components.map((component) => ({
  id: component.id,
  title: component.name,
  layout: "design-component",
  background: { color: "#ffffff" },
  speakerNotes: `${component.name}（差し替えデータ版）: ${component.bestFor.join(" / ")}`,
  elements: [
    {
      id: `${component.id}-slide`,
      type: "pptxSlide",
      templatePath: component.sourcePptxPath,
      sourceSlideIndex: component.sourceSlideIndex,
      textReplacements: replacementsById[component.id] ?? [],
      x: 0,
      y: 0,
      w: 13.333,
      h: 7.5,
      decorative: false,
      summary: `${component.name}（データ差し替え）`,
      longDescription: `Curated ${component.id} tree with substituted, domain-specific data and a reduced item count where noted.`,
      altText: component.name,
      readingOrder: 1
    }
  ]
}));

const deck = {
  version: "0.1",
  title: "Tree Design Pack — Varied Data Gallery",
  locale: "ja-JP",
  template: "modern-simple",
  tokens: {
    colors: {
      background: "#ffffff",
      surface: "#f8fafc",
      text: "#111827",
      mutedText: "#334155",
      accent: "#2563eb",
      danger: "#dc2626",
      success: "#16a34a"
    },
    typography: { headingFont: "Yu Gothic", bodyFont: "Yu Gothic", fallbackFonts: [] },
    spacing: { margin: 0.5, gutter: 0.24, radius: 0.08 }
  },
  slideSize: { widthInches: 13.333, heightInches: 7.5, aspect: "16:9" },
  slides,
  metadata: { contentMode: "presentation", keywords: ["tree", "varied"], sources: [] }
};

const output = resolve(root, "generated", "tree-design-varied-gallery.pptx");
await mkdir(dirname(output), { recursive: true });
const result = await renderDeckToPptx(deck, output, { allowLintErrors: true });
console.log("Rendered:", result.outputPath);
console.log("Components:", components.length);
