import { describe, expect, it } from "vitest";
import { createSampleDeck, lintDeckSpec, parseDeckSpec } from "./index.js";

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
