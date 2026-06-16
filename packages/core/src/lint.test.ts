import { describe, expect, it } from "vitest";
import { createSampleDeck, ensureSourceReferenceSlide, lintDeckSpec, parseDeckSpec } from "./index.js";

describe("DeckSpec linting", () => {
  it("accepts the generated sample deck", () => {
    const deck = parseDeckSpec(createSampleDeck("ja-JP"));
    const report = lintDeckSpec(deck);

    expect(report.ok).toBe(true);
    expect(report.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
  });

  it("flags overlapping text elements", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push(
      {
        id: "overlap-a",
        type: "text",
        role: "body",
        text: "重なるテキストA",
        x: 1,
        y: 6.2,
        w: 4,
        h: 0.8,
        fontSize: 22,
        bold: false,
        decorative: false,
        readingOrder: 200
      },
      {
        id: "overlap-b",
        type: "text",
        role: "body",
        text: "重なるテキストB",
        x: 1.2,
        y: 6.3,
        w: 4,
        h: 0.8,
        fontSize: 22,
        bold: false,
        decorative: false,
        readingOrder: 201
      }
    );

    const report = lintDeckSpec(parseDeckSpec(deck));
    const overlap = report.issues.find((issue) => issue.code === "layout.text-overlap");

    expect(overlap?.severity).toBe("error");
  });

  it("treats text overflow risk as a render-blocking error", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    const title = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "title");
    if (title?.type === "text") {
      title.text = "長すぎるタイトル".repeat(30);
      title.w = 2;
      title.h = 0.3;
      title.fontSize = 32;
    }

    const report = lintDeckSpec(parseDeckSpec(deck));
    const overflow = report.issues.find((issue) => issue.code === "layout.text-overflow-risk");

    expect(overflow?.severity).toBe("error");
    expect(report.ok).toBe(false);
  });

  it("flags bad orphan line breaks", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    const title = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "title");
    if (title?.type === "text") {
      title.text = "中継局とインターフェイスは、Zero Trustを適用する入口にな\nる";
      title.w = 8;
      title.h = 1.6;
      title.fontSize = 30;
    }

    const report = lintDeckSpec(parseDeckSpec(deck));
    const badBreak = report.issues.find((issue) => issue.code === "layout.bad-line-break");

    expect(badBreak?.severity).toBe("error");
    expect(report.ok).toBe(false);
  });

  it("flags a connected diagram built from hand-placed arrow shapes", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    // Four node-like cards plus a hand-placed arrow shape between them: this is a diagram an agent
    // should build with generate_diagram, where arrows are routed border-to-border automatically.
    deck.slides[0].elements.push(
      { id: "card-a", type: "shape", shape: "roundRect", fill: "#e2e8f0", x: 1, y: 2, w: 1.5, h: 0.8, decorative: true, readingOrder: 300 },
      { id: "card-b", type: "shape", shape: "roundRect", fill: "#e2e8f0", x: 4, y: 2, w: 1.5, h: 0.8, decorative: true, readingOrder: 301 },
      { id: "card-c", type: "shape", shape: "roundRect", fill: "#e2e8f0", x: 7, y: 2, w: 1.5, h: 0.8, decorative: true, readingOrder: 302 },
      { id: "card-d", type: "shape", shape: "roundRect", fill: "#e2e8f0", x: 10, y: 2, w: 1.5, h: 0.8, decorative: true, readingOrder: 303 },
      {
        id: "arrow-ab",
        type: "shape",
        shape: "line",
        fill: "none",
        x: 2.5,
        y: 2.4,
        w: 1.5,
        h: 0,
        decorative: true,
        readingOrder: 304,
        line: { color: "#475569", endArrowType: "triangle" }
      }
    );

    const report = lintDeckSpec(parseDeckSpec(deck));
    const native = report.issues.find((issue) => issue.code === "diagram.native-connectors");

    expect(native?.severity).toBe("warning");
    expect(native?.message).toMatch(/generate_diagram/);
  });

  it("does not flag a single decorative divider line as a native connector", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "divider",
      type: "shape",
      shape: "line",
      fill: "none",
      x: 1,
      y: 3,
      w: 6,
      h: 0,
      decorative: true,
      readingOrder: 320,
      line: { color: "#cbd5e1" }
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "diagram.native-connectors")).toBe(false);
  });

  it("does not flag a slide that already uses the diagram engine", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push(
      {
        id: "engine-diagram",
        type: "diagram",
        x: 1,
        y: 2,
        w: 10,
        h: 4,
        svg: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 960 540\"><rect width=\"960\" height=\"540\" fill=\"#fff\"/></svg>",
        summary: "engine diagram",
        longDescription: "A diagram produced by the engine so hand-placed arrows are not needed on this slide.",
        decorative: false,
        altText: "Architecture overview produced by the diagram engine",
        readingOrder: 330
      },
      {
        id: "arrow-extra",
        type: "shape",
        shape: "rightArrow",
        fill: "#475569",
        x: 2,
        y: 6.2,
        w: 1,
        h: 0.4,
        decorative: true,
        readingOrder: 331
      },
      {
        id: "arrow-extra2",
        type: "shape",
        shape: "rightArrow",
        fill: "#475569",
        x: 4,
        y: 6.2,
        w: 1,
        h: 0.4,
        decorative: true,
        readingOrder: 332
      }
    );

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "diagram.native-connectors")).toBe(false);
  });

  it("blocks embedded SVG diagrams whose internal text becomes unreadably small", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "tiny-svg-diagram",
      type: "diagram",
      x: 1,
      y: 2,
      w: 5,
      h: 2.75,
      svg: [
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1200 660\">",
        "<rect width=\"1200\" height=\"660\" fill=\"#fff\"/>",
        "<text x=\"100\" y=\"120\" font-size=\"15\">Prediction</text>",
        "<text x=\"420\" y=\"120\" font-size=\"15\">Blast Radius</text>",
        "<text x=\"760\" y=\"120\" font-size=\"15\">Enforcement</text>",
        "</svg>"
      ].join(""),
      summary: "Tiny internal text diagram",
      longDescription: "A large SVG canvas with labels that become too small when the whole diagram is scaled down on a slide.",
      decorative: false,
      altText: "Diagram with tiny text",
      readingOrder: 340
    });

    const report = lintDeckSpec(parseDeckSpec(deck));
    const tinySvg = report.issues.find((issue) => issue.code === "visual.svg-text-too-small");

    expect(tinySvg?.severity).toBe("error");
    expect(report.ok).toBe(false);
  });

  it("allows embedded SVG diagrams whose internal text remains readable after scaling", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "readable-svg-diagram",
      type: "diagram",
      x: 1,
      y: 2,
      w: 10,
      h: 4,
      svg: [
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 960 540\">",
        "<rect width=\"960\" height=\"540\" fill=\"#fff\"/>",
        "<text x=\"100\" y=\"120\" font-size=\"18\">Prediction</text>",
        "<text x=\"420\" y=\"120\" font-size=\"18\">Enforcement</text>",
        "</svg>"
      ].join(""),
      summary: "Readable internal text diagram",
      longDescription: "A diagram with labels that remain readable after scaling into the slide area.",
      decorative: false,
      altText: "Readable diagram",
      readingOrder: 340
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "visual.svg-text-too-small")).toBe(false);
  });

  it("does not flag concise bullet lists as bad line breaks", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    const body = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "body");
    if (body?.type === "text") {
      body.text = "Risks:\n• A\n• B";
      body.w = 4;
      body.h = 1.4;
      body.fontSize = 20;
    }

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "layout.bad-line-break")).toBe(false);
  });

  it("allows short alphanumeric final title lines", () => {
    const deck = createSampleDeck("en-US", { slideCount: 1 });
    const title = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "title");
    if (title?.type === "text") {
      title.text = "Roadmap\nQ4";
      title.w = 4;
      title.h = 1.4;
      title.fontSize = 30;
    }

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "layout.bad-line-break")).toBe(false);
  });

  it("allows compact Japanese label-value structures", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    const body = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "body");
    if (body?.type === "text") {
      body.text = "指標\n値";
      body.w = 2;
      body.h = 0.8;
      body.fontSize = 20;
    }

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "layout.bad-line-break")).toBe(false);
  });

  it("still flags punctuation-only compact line breaks", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    const body = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "body");
    if (body?.type === "text") {
      body.text = "指標\n、値";
      body.w = 2;
      body.h = 0.8;
      body.fontSize = 20;
    }

    const report = lintDeckSpec(parseDeckSpec(deck));
    const badBreak = report.issues.find((issue) => issue.code === "layout.bad-line-break");

    expect(badBreak?.severity).toBe("error");
  });

  it("still flags compact orphan title lines", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    const title = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "title");
    if (title?.type === "text") {
      title.text = "中継局と\nる";
      title.w = 5;
      title.h = 1.4;
      title.fontSize = 30;
    }

    const report = lintDeckSpec(parseDeckSpec(deck));
    const badBreak = report.issues.find((issue) => issue.code === "layout.bad-line-break");

    expect(badBreak?.severity).toBe("error");
  });

  it("still flags compact orphan body lines", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    const body = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "body");
    if (body?.type === "text") {
      body.text = "中継局と\nる";
      body.w = 3;
      body.h = 0.9;
      body.fontSize = 20;
    }

    const report = lintDeckSpec(parseDeckSpec(deck));
    const badBreak = report.issues.find((issue) => issue.code === "layout.bad-line-break");

    expect(badBreak?.severity).toBe("error");
  });

  it("suggests visual hierarchy for body-only enumerations", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements = [
      {
        id: "one",
        type: "text",
        role: "body",
        text: "大きな列挙項目その一",
        x: 1,
        y: 1,
        w: 3,
        h: 1,
        fontSize: 22,
        bold: false,
        decorative: false,
        readingOrder: 1
      },
      {
        id: "two",
        type: "text",
        role: "body",
        text: "大きな列挙項目その二",
        x: 1,
        y: 2.2,
        w: 3,
        h: 1,
        fontSize: 22,
        bold: false,
        decorative: false,
        readingOrder: 2
      },
      {
        id: "three",
        type: "text",
        role: "body",
        text: "大きな列挙項目その三",
        x: 1,
        y: 3.4,
        w: 3,
        h: 1,
        fontSize: 22,
        bold: false,
        decorative: false,
        readingOrder: 3
      }
    ];

    const report = lintDeckSpec(parseDeckSpec(deck));
    const hierarchy = report.issues.find((issue) => issue.code === "layout.enumeration-hierarchy");

    expect(hierarchy?.severity).toBe("warning");
  });

  it("does not block enumerations with shape-based visual structure", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements = [
      {
        id: "card-one",
        type: "shape",
        shape: "roundRect",
        x: 0.8,
        y: 1,
        w: 3,
        h: 1,
        fill: "#ffffff",
        decorative: true,
        readingOrder: 1
      },
      {
        id: "one",
        type: "text",
        role: "body",
        text: "大きな列挙項目その一",
        x: 1,
        y: 1.2,
        w: 2.5,
        h: 0.6,
        fontSize: 22,
        bold: false,
        decorative: false,
        readingOrder: 2
      },
      {
        id: "card-two",
        type: "shape",
        shape: "roundRect",
        x: 4.1,
        y: 1,
        w: 3,
        h: 1,
        fill: "#ffffff",
        decorative: true,
        readingOrder: 3
      },
      {
        id: "two",
        type: "text",
        role: "body",
        text: "大きな列挙項目その二",
        x: 4.3,
        y: 1.2,
        w: 2.5,
        h: 0.6,
        fontSize: 22,
        bold: false,
        decorative: false,
        readingOrder: 4
      },
      {
        id: "card-three",
        type: "shape",
        shape: "roundRect",
        x: 7.4,
        y: 1,
        w: 3,
        h: 1,
        fill: "#ffffff",
        decorative: true,
        readingOrder: 5
      },
      {
        id: "three",
        type: "text",
        role: "body",
        text: "大きな列挙項目その三",
        x: 7.6,
        y: 1.2,
        w: 2.5,
        h: 0.6,
        fontSize: 22,
        bold: false,
        decorative: false,
        readingOrder: 6
      }
    ];

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "layout.enumeration-hierarchy")).toBe(false);
  });

  it("does not treat long prose boxes as enumeration cards", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements = [1, 2, 3].map((item) => ({
      id: `prose-${item}`,
      type: "text" as const,
      role: "body" as const,
      text: "これは報告書で使う長めの説明文です。複数の根拠や背景を一つの段落として示しており、列挙カードではありません。",
      x: 1,
      y: item,
      w: 8,
      h: 0.8,
      fontSize: 18,
      bold: false,
      decorative: false,
      readingOrder: item
    }));

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "layout.enumeration-hierarchy")).toBe(false);
  });

  it("flags Japanese technical titles that read like document sentences", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1, contentMode: "technical" });
    deck.metadata.contentMode = "technical";
    deck.slides[0].elements = [
      {
        id: "title",
        type: "text",
        role: "title",
        text: "露出グラフに攻撃活動を重ね、blast radius と最短経路を推定する",
        x: 0.8,
        y: 0.7,
        w: 11,
        h: 1.2,
        fontSize: 30,
        bold: true,
        decorative: false,
        readingOrder: 1
      }
    ];

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "content.title-too-long")).toBe(true);
    expect(report.issues.some((issue) => issue.code === "content.ja-title-claim-like")).toBe(true);
    expect(report.issues.some((issue) => issue.code === "content.ja-message-missing")).toBe(true);
  });

  it("allows a Japanese presentation action title when it is concise", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1, contentMode: "presentation" });
    deck.metadata.contentMode = "presentation";
    const title = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "title");
    if (title?.type === "text") {
      title.text = "初動の時間負けを縮める";
    }

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "content.ja-title-claim-like")).toBe(false);
  });

  it("flags English generic topic titles", () => {
    const deck = createSampleDeck("en-US", { slideCount: 1, contentMode: "decision" });
    deck.metadata.contentMode = "decision";
    const title = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "title");
    if (title?.type === "text") {
      title.text = "Overview";
    }

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "content.title-generic")).toBe(true);
  });

  it("flags an opaque shape drawn over text", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "cover-shape",
      type: "shape",
      shape: "rect",
      x: 0.8,
      y: 1.35,
      w: 6.5,
      h: 2.3,
      fill: "#000000",
      decorative: true,
      readingOrder: 900
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "layout.shape-over-text")).toBe(true);
  });

  it("flags missing alt text for non-decorative visuals", () => {
    const deck = createSampleDeck("en-US");
    deck.slides[0].elements.push({
      id: "visual",
      type: "svg",
      svg: "<svg viewBox=\"0 0 10 10\"><circle cx=\"5\" cy=\"5\" r=\"4\" /></svg>",
      x: 1,
      y: 3,
      w: 2,
      h: 2,
      readingOrder: 2,
      decorative: false
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === "visual.alt-text-missing")).toBe(true);
  });

  it("blocks text-only content slides so pptcreater output stays visually rich", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1, contentMode: "report" });
    deck.slides[0].elements = [
      {
        id: "title",
        type: "text",
        role: "title",
        text: "企業概要",
        x: 0.8,
        y: 0.6,
        w: 11,
        h: 0.7,
        fontSize: 32,
        color: "#0f172a",
        contrastBackground: "#ffffff",
        bold: true,
        decorative: false,
        readingOrder: 1
      },
      {
        id: "body",
        type: "text",
        role: "body",
        text: "主力事業、組織、顧客理解の観点を文章だけで説明します。事業領域の違いや部門ごとの特徴も、図解やカード構造を使わずに長い本文で並べてしまっています。",
        x: 0.9,
        y: 1.8,
        w: 10.5,
        h: 1,
        fontSize: 22,
        color: "#0f172a",
        contrastBackground: "#ffffff",
        bold: false,
        decorative: false,
        readingOrder: 2
      },
      {
        id: "body-2",
        type: "text",
        role: "body",
        text: "本来は事業マップ、部門構造、顧客接点を表やポンチ絵で示すべき内容です。",
        x: 0.9,
        y: 2.95,
        w: 10.5,
        h: 0.8,
        fontSize: 22,
        color: "#0f172a",
        contrastBackground: "#ffffff",
        bold: false,
        decorative: false,
        readingOrder: 3
      }
    ];

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === "visual.richness-missing")).toBe(true);
  });

  it("allows sparse cover or section slides without forcing decoration", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1, contentMode: "presentation" });
    deck.slides[0] = {
      id: "cover",
      title: "表紙",
      layout: "cover",
      elements: [
        {
          id: "title",
          type: "text",
          role: "title",
          text: "企業紹介",
          x: 0.8,
          y: 2,
          w: 11,
          h: 0.8,
          fontSize: 36,
          color: "#0f172a",
          contrastBackground: "#ffffff",
          bold: true,
          decorative: false,
          readingOrder: 1
        }
      ]
    };

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "visual.richness-missing")).toBe(false);
  });

  it("blocks whole decks that are mostly text-only", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 4, contentMode: "report" });
    deck.slides.forEach((slide, index) => {
      slide.elements = [
        {
          id: `title-${index}`,
          type: "text",
          role: "title",
          text: slide.title,
          x: 0.8,
          y: 0.6,
          w: 11,
          h: 0.7,
          fontSize: 30,
          color: "#0f172a",
          contrastBackground: "#ffffff",
          bold: true,
          decorative: false,
          readingOrder: 1
        },
        {
          id: `body-${index}`,
          type: "text",
          role: "body",
          text: "箇条書きだけで構成された、視覚構造のないスライドです。読み手は各項目の関係性や優先度を自分で解釈する必要があり、pptcreater の出力として不十分です。",
          x: 0.9,
          y: 1.8,
          w: 10.5,
          h: 1,
          fontSize: 22,
          color: "#0f172a",
          contrastBackground: "#ffffff",
          bold: false,
          decorative: false,
          readingOrder: 2
        },
        {
          id: `body-extra-${index}`,
          type: "text",
          role: "body",
          text: "図解、表、アイコン、カード構造のいずれもなく、読み手にとって単調な資料です。",
          x: 0.9,
          y: 3,
          w: 10.5,
          h: 0.8,
          fontSize: 22,
          color: "#0f172a",
          contrastBackground: "#ffffff",
          bold: false,
          decorative: false,
          readingOrder: 3
        }
      ];
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === "visual.richness-deck")).toBe(true);
  });

  it("allows decks that use shape/card composition without SVG diagrams", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 4, contentMode: "report" });
    deck.slides.forEach((slide, index) => {
      slide.layout = "title-content";
      slide.elements = [
        {
          id: `title-${index}`,
          type: "text",
          role: "title",
          text: slide.title,
          x: 0.8,
          y: 0.6,
          w: 11,
          h: 0.7,
          fontSize: 30,
          color: "#0f172a",
          contrastBackground: "#ffffff",
          bold: true,
          decorative: false,
          readingOrder: 1
        },
        {
          id: `card-${index}-a`,
          type: "shape",
          shape: "roundRect",
          x: 0.9,
          y: 1.8,
          w: 3.2,
          h: 1.6,
          fill: "#eff6ff",
          line: { color: "#93c5fd" },
          decorative: true,
          readingOrder: 2
        },
        {
          id: `card-${index}-b`,
          type: "shape",
          shape: "roundRect",
          x: 4.5,
          y: 1.8,
          w: 3.2,
          h: 1.6,
          fill: "#f0fdf4",
          line: { color: "#86efac" },
          decorative: true,
          readingOrder: 3
        },
        {
          id: `card-${index}-c`,
          type: "shape",
          shape: "roundRect",
          x: 8.1,
          y: 1.8,
          w: 3.2,
          h: 1.6,
          fill: "#fff7ed",
          line: { color: "#fdba74" },
          decorative: true,
          readingOrder: 4
        },
        {
          id: `body-${index}`,
          type: "text",
          role: "body",
          text: "カード構造で情報を分割しているため、文字だけのスライドではありません。",
          x: 1.1,
          y: 2.1,
          w: 9.5,
          h: 0.6,
          fontSize: 22,
          color: "#0f172a",
          contrastBackground: "#ffffff",
          bold: false,
          decorative: false,
          readingOrder: 5
        }
      ];
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "visual.richness-deck")).toBe(false);
  });

  it("requires citation metadata for quoted source visuals", () => {
    const deck = createSampleDeck("en-US");
    deck.metadata.sources = [
      {
        id: "source-1",
        title: "Reference article",
        usage: "quote"
      }
    ];
    deck.slides[0].elements.push({
      id: "source-visual",
      type: "svg",
      svg: "<svg viewBox=\"0 0 10 10\"><circle cx=\"5\" cy=\"5\" r=\"4\" /></svg>",
      altText: "Quoted source visual",
      sourceId: "source-1",
      x: 1,
      y: 3,
      w: 2,
      h: 2,
      readingOrder: 20,
      decorative: false
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === "source.attribution-missing")).toBe(true);
    expect(report.issues.some((issue) => issue.code === "source.citation-missing")).toBe(true);
  });

  it("requires external source URLs to appear on the final references slide", () => {
    const deck = createSampleDeck("ja-JP");
    deck.metadata.sources = [
      {
        id: "source-1",
        title: "Microsoft reference",
        url: "https://learn.microsoft.com/azure/example",
        usage: "inspiration"
      }
    ];

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === "source.reference-slide-missing")).toBe(true);
  });

  it("adds a final references slide with actual source URLs", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.metadata.sources = [
      {
        id: "source-1",
        title: "Microsoft reference",
        url: "https://learn.microsoft.com/azure/example",
        usage: "inspiration"
      },
      {
        id: "source-2",
        title: "AWS reference",
        url: "https://aws.amazon.com/architecture/icons/",
        usage: "inspiration"
      }
    ];

    const withReferences = ensureSourceReferenceSlide(parseDeckSpec(deck));
    const finalSlide = withReferences.slides.at(-1);

    expect(finalSlide?.title).toBe("参考URL・出典");
    expect(finalSlide?.elements.some((element) => element.type === "text" && element.text.includes("https://learn.microsoft.com/azure/example"))).toBe(true);
    expect(finalSlide?.speakerNotes).toContain("https://aws.amazon.com/architecture/icons/");
    expect(lintDeckSpec(withReferences).issues.some((issue) => issue.code === "source.reference-slide-missing")).toBe(false);
  });

  it("updates a generated references slide when source URLs change", () => {
    const deck = createSampleDeck("en-US", { slideCount: 1 });
    deck.metadata.sources = [
      {
        id: "source-1",
        title: "Old source",
        url: "https://example.com/old",
        usage: "inspiration"
      }
    ];
    const withOldReferences = ensureSourceReferenceSlide(parseDeckSpec(deck));
    const updatedDeck = {
      ...withOldReferences,
      metadata: {
        ...withOldReferences.metadata,
        sources: [
          {
            id: "source-2",
            title: "New source",
            url: "https://example.com/new",
            usage: "inspiration" as const
          }
        ]
      }
    };

    const withNewReferences = ensureSourceReferenceSlide(parseDeckSpec(updatedDeck));
    const finalText = withNewReferences.slides.at(-1)?.elements.map((element) => (element.type === "text" ? element.text : "")).join("\n");

    expect(finalText).toContain("https://example.com/new");
    expect(finalText).not.toContain("https://example.com/old");
  });

  it("allows URL sources to be collected only on the final references slide", () => {
    const deck = createSampleDeck("en-US", { slideCount: 1 });
    deck.metadata.sources = [
      {
        id: "source-1",
        title: "Reference article",
        url: "https://example.com/reference",
        usage: "quote"
      }
    ];
    deck.slides[0].elements.push({
      id: "source-visual",
      type: "svg",
      svg: "<svg viewBox=\"0 0 10 10\"><circle cx=\"5\" cy=\"5\" r=\"4\" /></svg>",
      altText: "Quoted source visual",
      sourceId: "source-1",
      x: 1,
      y: 3,
      w: 2,
      h: 2,
      readingOrder: 20,
      decorative: false
    });

    const report = lintDeckSpec(ensureSourceReferenceSlide(parseDeckSpec(deck)));

    expect(report.issues.some((issue) => issue.code === "source.citation-missing")).toBe(false);
    expect(report.issues.some((issue) => issue.code === "source.visual-reference-missing")).toBe(false);
    expect(report.issues.some((issue) => issue.code === "source.attribution-missing")).toBe(false);
  });

  it("does not require visual richness on a manually authored final references slide", () => {
    const deck = createSampleDeck("en-US", { slideCount: 1 });
    deck.metadata.sources = [
      {
        id: "source-1",
        title: "Reference article",
        url: "https://example.com/reference",
        usage: "inspiration"
      }
    ];
    deck.slides.push({
      id: "manual-reference-list",
      title: "Useful links",
      layout: "title-content",
      elements: [
        {
          id: "manual-ref-title",
          type: "text",
          role: "title",
          text: "Useful links",
          x: 0.8,
          y: 0.6,
          w: 10,
          h: 0.7,
          fontSize: 32,
          color: "#0f172a",
          contrastBackground: "#ffffff",
          bold: true,
          decorative: false,
          readingOrder: 1
        },
        {
          id: "manual-ref-url",
          type: "text",
          role: "body",
          text: "https://example.com/reference",
          x: 0.9,
          y: 1.8,
          w: 10.5,
          h: 0.5,
          fontSize: 22,
          color: "#0f172a",
          contrastBackground: "#ffffff",
          bold: false,
          decorative: false,
          readingOrder: 2
        }
      ]
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "source.reference-slide-missing")).toBe(false);
    expect(report.issues.some((issue) => issue.path === "slides.1" && issue.code === "visual.richness-missing")).toBe(false);
  });

  it("requires quoted or recreated sources to be referenced by elements", () => {
    const deck = createSampleDeck("en-US");
    deck.metadata.sources = [
      {
        id: "source-1",
        title: "Reference article",
        usage: "recreate",
        attribution: "Reference article"
      }
    ];

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === "source.visual-reference-missing")).toBe(true);
  });

  it("rejects duplicate source ids", () => {
    const deck = createSampleDeck("en-US");
    deck.metadata.sources = [
      {
        id: "source-1",
        title: "Reference article",
        usage: "quote",
        attribution: "Reference article"
      },
      {
        id: "source-1",
        title: "Shadow source",
        usage: "inspiration"
      }
    ];

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === "source.duplicate-id")).toBe(true);
  });

  it("requires recreated source visuals to be editable objects", () => {
    const deck = createSampleDeck("en-US");
    deck.metadata.sources = [
      {
        id: "source-1",
        title: "Reference article",
        usage: "recreate",
        attribution: "Reference article"
      }
    ];
    deck.slides[0].elements.push({
      id: "source-visual",
      type: "svg",
      svg: "<svg viewBox=\"0 0 10 10\"><circle cx=\"5\" cy=\"5\" r=\"4\" /></svg>",
      altText: "Recreated visual",
      sourceId: "source-1",
      citation: "Adapted from Reference article.",
      x: 1,
      y: 3,
      w: 2,
      h: 2,
      readingOrder: 20,
      decorative: false
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === "source.recreate-not-editable")).toBe(true);
  });

  it("requires source-linked recreated shapes to make an accessibility decision", () => {
    const deck = createSampleDeck("en-US");
    deck.metadata.sources = [
      {
        id: "source-1",
        title: "Reference article",
        usage: "recreate",
        attribution: "Reference article"
      }
    ];
    deck.slides[0].elements.push({
      id: "source-shape",
      type: "shape",
      shape: "roundRect",
      fill: "#ffffff",
      sourceId: "source-1",
      citation: "Adapted from Reference article.",
      x: 1,
      y: 3,
      w: 2,
      h: 1,
      readingOrder: 20,
      decorative: true
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === "source.recreate-shape-accessibility-missing")).toBe(true);
  });
});
