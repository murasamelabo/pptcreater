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

    expect(report.issues.some((issue) => issue.code === "layout.text-overlap")).toBe(true);
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
