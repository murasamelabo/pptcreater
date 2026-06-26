import { defaultTokens } from "./color.js";
import { createDetailSlide } from "./proseDetail.js";
import { createSectionDividerSlide } from "./sectionDivider.js";
import type { DeckSpec, Locale, ShapeElement, Slide, SlideElement, TextElement } from "./schema.js";
import { createVisualScaffold } from "./visualScaffold.js";

const W = 13.333;
const H = 7.5;

const SCHEMATIC_PATTERNS = [
  "table",
  "tree",
  "flow",
  "vertical-flow",
  "cycle",
  "before-after",
  "map",
  "puzzle",
  "correlation",
  "matrix",
  "venn",
  "cross",
  "set",
  "contrast",
  "scale-contrast",
  "grow",
  "layer",
  "triangle",
  "step",
  "gantt",
  "ranking",
  "list",
  "list-horizontal",
  "list-enumeration",
  "mockup"
] as const;

export const COMPREHENSIVE_PATTERN_GALLERY_IDS = [
  "pattern-section",
  "pattern-native-shapes",
  "pattern-diagram-svg",
  "pattern-visual-scaffold",
  "pattern-svg-image",
  "pattern-detail-explanation",
  "pattern-detail-qa",
  "pattern-detail-benefits",
  ...SCHEMATIC_PATTERNS.map((kind) => `pattern-schematic-${kind}`)
] as const;

function text(
  id: string,
  role: TextElement["role"],
  value: string,
  x: number,
  y: number,
  w: number,
  h: number,
  readingOrder: number,
  options: { fontSize?: number; color?: string; bold?: boolean; align?: TextElement["align"]; contrastBackground?: string } = {}
): TextElement {
  return {
    id,
    type: "text",
    role,
    text: value,
    x,
    y,
    w,
    h,
    readingOrder,
    fontSize: options.fontSize ?? (role === "title" ? 30 : role === "subtitle" ? 20 : 18),
    color: options.color ?? "#0f172a",
    contrastBackground: options.contrastBackground ?? "#ffffff",
    bold: options.bold ?? role === "title",
    align: options.align ?? "left",
    decorative: false
  };
}

function shape(
  id: string,
  shapeType: ShapeElement["shape"],
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  readingOrder: number,
  options: { lineColor?: string; radius?: number } = {}
): ShapeElement {
  return {
    id,
    type: "shape",
    shape: shapeType,
    x,
    y,
    w,
    h,
    fill,
    line: { color: options.lineColor ?? fill, width: 0.8 },
    radius: options.radius ?? 0.06,
    readingOrder,
    decorative: true
  };
}

function contentSlide(id: string, title: string, lead: string, elements: SlideElement[], notes?: string): Slide {
  return {
    id,
    title,
    layout: "title-content",
    speakerNotes: notes,
    background: { color: "#ffffff" },
    elements: [
      text(`${id}-title`, "title", title, 0.72, 0.42, 11.9, 0.56, 1),
      text(`${id}-lead`, "subtitle", lead, 0.74, 1.12, 11.6, 0.4, 2, { color: "#334155" }),
      shape(`${id}-rule`, "rect", 0.74, 1.68, 1.2, 0.06, "#2563eb", 3, { radius: 0 }),
      ...elements
    ]
  };
}

function visibleDiagramSvg(kind: string, title: string, labels: readonly string[]): string {
  const labelTexts = labels.slice(0, 5);
  const slots = [
    [90, 210],
    [260, 120],
    [430, 210],
    [600, 120],
    [770, 210]
  ];
  const nodes = labelTexts
    .map(([...label], index) => {
      const [x, y] = slots[index];
      return `<rect x="${x}" y="${y}" width="120" height="72" rx="14" fill="#eff6ff" stroke="#2563eb" stroke-width="3"/><text x="${x + 60}" y="${y + 43}" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#0f172a">${label.join("")}</text>`;
    })
    .join("");
  const connectors = labelTexts
    .slice(0, -1)
    .map((_, index) => {
      const [x1, y1] = slots[index];
      const [x2, y2] = slots[index + 1];
      return `<line x1="${x1 + 120}" y1="${y1 + 36}" x2="${x2}" y2="${y2 + 36}" stroke="#2563eb" stroke-width="4"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" role="img" aria-label="${title}"><rect width="960" height="540" fill="#ffffff"/><text x="48" y="62" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#0f172a">${title}</text><text x="48" y="105" font-family="Arial, sans-serif" font-size="22" fill="#475569">${kind}</text>${connectors}${nodes}</svg>`;
}

function diagramSlide(kind: string): Slide {
  const title = `Pattern: ${kind}`;
  return contentSlide(`pattern-schematic-${kind}`, title, "代表パターンを可視ラベル付き図として描画する。", [
    {
      id: `${kind}-diagram`,
      type: "diagram",
      x: 0.82,
      y: 1.95,
      w: 11.7,
      h: 4.85,
      readingOrder: 10,
      decorative: false,
      altText: `${kind} pattern diagram with visible labels`,
      svg: visibleDiagramSvg(kind, title, ["Input", "Design", "Check", "Render", "Review"]),
      summary: `${kind} schematic pattern`,
      longDescription: `${kind} pattern rendered as a labeled diagram in the comprehensive gallery test.`
    }
  ]);
}

function nativeShapesSlide(): Slide {
  const elements: SlideElement[] = [
    shape("native-a", "roundRect", 0.9, 2.2, 2.2, 0.9, "#eff6ff", 10, { lineColor: "#2563eb" }),
    text("native-a-text", "body", "Plan", 1.15, 2.5, 1.7, 0.25, 11, { fontSize: 18, align: "center" }),
    shape("native-b", "roundRect", 4.1, 2.2, 2.2, 0.9, "#ecfdf5", 12, { lineColor: "#059669" }),
    text("native-b-text", "body", "Build", 4.35, 2.5, 1.7, 0.25, 13, { fontSize: 18, align: "center" }),
    shape("native-c", "roundRect", 7.3, 2.2, 2.2, 0.9, "#fff7ed", 14, { lineColor: "#ea580c" }),
    text("native-c-text", "body", "Validate", 7.55, 2.5, 1.7, 0.25, 15, { fontSize: 18, align: "center" }),
    shape("native-d", "roundRect", 10.5, 2.2, 2.0, 0.9, "#f5f3ff", 16, { lineColor: "#7c3aed" }),
    text("native-d-text", "body", "Ship", 10.75, 2.5, 1.5, 0.25, 17, { fontSize: 18, align: "center" }),
    shape("native-line-1", "line", 3.25, 2.65, 0.7, 0.01, "none", 18, { lineColor: "#2563eb" }),
    shape("native-line-2", "line", 6.45, 2.65, 0.7, 0.01, "none", 19, { lineColor: "#2563eb" }),
    shape("native-line-3", "line", 9.65, 2.65, 0.7, 0.01, "none", 20, { lineColor: "#2563eb" })
  ];
  return contentSlide("pattern-native-shapes", "Native editable shapes", "手置き矢印ではなく、編集可能な安全形状で流れを示す。", elements);
}

function diagramSvgSlide(): Slide {
  return contentSlide("pattern-diagram-svg", "Diagram element", "固定図解も可視ラベル付きSVGとして検証する。", [
    {
      id: "intent-like-diagram",
      type: "diagram",
      x: 0.9,
      y: 1.95,
      w: 11.5,
      h: 4.8,
      readingOrder: 10,
      decorative: false,
      altText: "Intent diagram with user, policy, gateway, tool, and audit nodes",
      svg: visibleDiagramSvg("intent-diagram", "Intent diagram", ["User", "Policy", "Gateway", "Tool", "Audit"]),
      summary: "Intent diagram with visible labels",
      longDescription: "A labeled SVG diagram used to verify diagram rendering and accessibility metadata."
    }
  ]);
}

function visualScaffoldSlide(locale: Locale): Slide {
  const tokens = defaultTokens(locale);
  const scaffold = createVisualScaffold(
    {
      concept: locale === "ja-JP" ? "品質ゲート" : "Quality gate",
      caption: locale === "ja-JP" ? "作成から公開までを止めるべき所で止める" : "Stops the flow at the right checkpoints",
      points: ["Plan", "Generate", "Finalize", "Render"]
    },
    { locale, tokens, frame: { x: 8.8, y: 1.85, w: 3.6, h: 4.8 }, idPrefix: "gallery-scaffold" }
  );
  return contentSlide("pattern-visual-scaffold", "Visual scaffold", "右レールの概念ビジュアルも実スライドで確認する。", [
    ...scaffold.elements,
    text("scaffold-copy", "body", "本文領域と視覚レールが重ならず、読み順も保たれることを確認します。", 0.9, 2.15, 6.9, 1.1, 10, {
      fontSize: 20,
      color: tokens.colors.text
    })
  ]);
}

function svgImageSlide(): Slide {
  const imageSvg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100"><rect width="160" height="100" rx="16" fill="#dbeafe"/><circle cx="52" cy="50" r="24" fill="#2563eb"/><text x="92" y="57" font-family="Arial" font-size="24" fill="#0f172a">IMG</text></svg>'
  ).toString("base64");
  return contentSlide("pattern-svg-image", "SVG and image assets", "SVG要素とimage.dataUriを同じデッキで検証する。", [
    {
      id: "inline-safe-svg",
      type: "svg",
      x: 1.1,
      y: 2.1,
      w: 4.4,
      h: 2.7,
      readingOrder: 10,
      decorative: false,
      altText: "Safe SVG icon with visible label",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" rx="22" fill="#ecfdf5"/><path d="M76 95l38 38 92-92" fill="none" stroke="#059669" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/><text x="160" y="155" text-anchor="middle" font-family="Arial" font-size="28" fill="#064e3b">safe svg</text></svg>',
      title: "Safe SVG",
      description: "Inline SVG asset with visible text."
    },
    {
      id: "data-uri-image",
      type: "image",
      x: 7.1,
      y: 2.1,
      w: 4.4,
      h: 2.7,
      readingOrder: 20,
      decorative: false,
      altText: "Data URI image asset",
      dataUri: `data:image/svg+xml;base64,${imageSvg}`,
      description: "Base64 SVG image data URI."
    }
  ]);
}

export function createComprehensivePatternDeck(locale: Locale = "ja-JP"): DeckSpec {
  const tokens = defaultTokens(locale);
  const explanation = createDetailSlide(
    {
      variant: "explanation",
      title: "Detail explanation",
      lead: "説明型スライドも意図的な例外として検証する。",
      blocks: [
        { heading: "目的", body: "品質ゲートは、崩れたスライドを生成物として残さないために使います。" },
        { heading: "確認", body: "図解、画像、本文、出典、アクセシビリティを同じデッキ内で確認します。" }
      ]
    },
    { locale, tokens, id: "pattern-detail-explanation", idPrefix: "detail-explanation" }
  ).slide;
  const qa = createDetailSlide(
    {
      variant: "qa",
      title: "Detail Q&A",
      lead: "質問と回答の読みやすさを確認する。",
      items: [
        { question: "なぜ総合テストが必要ですか？", answer: "単体lintだけでは、render後の崩れや複合パターンの衝突を見落とすためです。" },
        { question: "何を確認しますか？", answer: "主要パターンを含むDeckSpecを実際にPPTXへ出力できることを確認します。" }
      ]
    },
    { locale, tokens, id: "pattern-detail-qa", idPrefix: "detail-qa" }
  ).slide;
  const benefits = createDetailSlide(
    {
      variant: "benefits",
      title: "Detail benefits",
      lead: "得られることの形式も確認する。",
      items: [
        { label: "再現性", description: "複数パターンを毎回同じ条件で検証できます。" },
        { label: "安全性", description: "blocking errorが残る場合はrenderを止められます。" },
        { label: "拡張性", description: "新しいパターン追加時にこのギャラリーへ足せます。" }
      ]
    },
    { locale, tokens, id: "pattern-detail-benefits", idPrefix: "detail-benefits" }
  ).slide;

  return {
    version: "0.1",
    title: "Comprehensive Pattern Gallery",
    locale,
    template: "default",
    skillPack: locale === "ja-JP" ? "slide-craft-ja" : "slide-craft-en",
    tokens,
    slideSize: { widthInches: W, heightInches: H, aspect: "16:9" },
    headerFooter: { showFooter: false, showSlideNumber: false, showDate: false },
    slides: [
      createSectionDividerSlide(
        { title: "Pattern gallery", subtitle: "主要パターンを実スライドとしてまとめて検証する。" },
        { locale, tokens, id: "pattern-section", idPrefix: "pattern-section", index: 1, total: 1 }
      ),
      nativeShapesSlide(),
      diagramSvgSlide(),
      visualScaffoldSlide(locale),
      svgImageSlide(),
      explanation,
      qa,
      benefits,
      ...SCHEMATIC_PATTERNS.map((kind) => diagramSlide(kind))
    ],
    metadata: {
      author: "pptcreater",
      subject: "Comprehensive pattern gallery integration test",
      keywords: ["pattern-gallery", "schematic", "diagram", "accessibility"],
      contentMode: "technical",
      sources: []
    }
  };
}
