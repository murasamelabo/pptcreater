import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listDesignComponents } from "../packages/core/dist/index.js";
import { renderDeckToPptx } from "../packages/render-pptx/dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const components = await listDesignComponents({ kind: "tree", roots: [resolve(root, "design-packs")] });
const byId = new Map(components.map((c) => [c.id, c]));

// Each slide demonstrates node add/remove on a curated tree, relaying out within the
// original footprint so nothing collides or dangles.
const specs = [
  {
    id: "tree-vertical-org",
    note: "営業本部に第三営業部を追加 / 管理本部から人事総務を削除",
    nodeOperations: [
      { op: "add", group: "eigyo", cloneFrom: "第一営業部", label: "第三営業部" },
      { op: "remove", target: "人事総務" }
    ],
    textReplacements: [{ at: 2, to: "VERTICAL — ノード追加・削除のデモ" }]
  },
  {
    id: "tree-horizontal",
    note: "クラウド配下に3項目目を追加 / セキュリティ配下を1項目に削減",
    nodeOperations: [
      { op: "add", group: "cloud", cloneFrom: "IaaS / PaaS", label: "コンテナ基盤" },
      { op: "remove", target: "運用監視" }
    ],
    textReplacements: [{ at: 2, to: "HORIZONTAL — ノード追加・削除のデモ" }]
  },
  {
    id: "tree-logic",
    note: "客数ブランチに3つ目の打ち手を追加 / 客単価ブランチを1つに削減",
    nodeOperations: [
      { op: "add", group: "kyakusu", cloneFrom: "新規獲得を強化", label: "休眠の掘り起こし" },
      { op: "remove", target: "クロスセル拡大" }
    ],
    textReplacements: [{ at: 2, to: "LOGIC — ノード追加・削除のデモ" }]
  }
];

const slides = specs.map((spec) => {
  const component = byId.get(spec.id);
  return {
    id: spec.id,
    title: `${component.name}（${spec.note}）`,
    layout: "design-component",
    background: { color: "#ffffff" },
    speakerNotes: `${component.name}: ${spec.note}`,
    elements: [
      {
        id: `${spec.id}-slide`,
        type: "pptxSlide",
        templatePath: component.sourcePptxPath,
        sourceSlideIndex: component.sourceSlideIndex,
        nodeGroups: component.editableGroups,
        nodeOperations: spec.nodeOperations,
        textReplacements: spec.textReplacements,
        x: 0,
        y: 0,
        w: 13.333,
        h: 7.5,
        decorative: false,
        summary: `${component.name}（ノード編集）`,
        longDescription: `Curated ${spec.id} tree with structural node add/remove: ${spec.note}.`,
        altText: component.name,
        readingOrder: 1
      }
    ]
  };
});

const deck = {
  version: "0.1",
  title: "Tree Design Pack — Node Add/Remove Gallery",
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
  metadata: { contentMode: "presentation", keywords: ["tree", "nodes"], sources: [] }
};

const output = resolve(root, "generated", "tree-design-nodes-gallery.pptx");
await mkdir(dirname(output), { recursive: true });
const result = await renderDeckToPptx(deck, output, { allowLintErrors: true });
console.log("Rendered:", result.outputPath);
