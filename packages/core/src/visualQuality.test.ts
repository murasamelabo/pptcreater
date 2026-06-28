import { describe, expect, it } from "vitest";
import { createSampleDeck, reviewVisualQuality } from "./index.js";

describe("visual quality review", () => {
  it("flags truncation, inconsistent typography, and repeated generated-looking cards", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements = deck.slides[0].elements.slice(0, 3);
    deck.slides[0].elements.push(
      {
        id: "tiny-label",
        type: "text",
        role: "body",
        text: "市助成…",
        x: 1,
        y: 2,
        w: 1,
        h: 0.3,
        fontSize: 9,
        bold: false,
        decorative: false,
        readingOrder: 20
      },
      {
        id: "large-body",
        type: "text",
        role: "body",
        text: "大きい本文",
        x: 1,
        y: 2.5,
        w: 3,
        h: 0.5,
        fontSize: 22,
        bold: false,
        decorative: false,
        readingOrder: 21
      }
    );
    for (let index = 0; index < 3; index += 1) {
      const x = 1 + index * 3;
      deck.slides[0].elements.push(
        { id: `card-${index}`, type: "shape", shape: "roundRect", x, y: 3.3, w: 2.4, h: 1.1, fill: "#ffffff", decorative: true, readingOrder: 30 + index * 3 },
        { id: `bar-${index}`, type: "shape", shape: "rect", x: x + 0.08, y: 3.42, w: 0.1, h: 0.85, fill: "#2563eb", decorative: true, readingOrder: 31 + index * 3 }
      );
    }

    const report = reviewVisualQuality(deck);

    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["visual.truncated-text", "visual.typography-inconsistent", "visual.accent-bar-card-repetition"])
    );
  });

  it("accepts clean generated schematic-like slides", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    const report = reviewVisualQuality(deck);

    expect(report.issues.some((issue) => issue.severity === "error")).toBe(false);
  });

  it("flags non-orthogonal matrix axes and repeated layout runs", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 3 });
    deck.slides.forEach((slide, index) => {
      slide.layout = "message-table";
      slide.id = `content-${index}`;
      slide.elements.push({
        id: index === 0 ? "decision-axis-y-line" : `line-${index}`,
        type: "shape",
        shape: "line",
        x: 1,
        y: 2,
        w: index === 0 ? 0.7 : 0,
        h: index === 0 ? 2.2 : 1,
        fill: "none",
        decorative: true,
        readingOrder: 100 + index
      });
    });

    const report = reviewVisualQuality(deck);

    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["visual.axis-y-not-vertical", "visual.repeated-layout-run"]));
  });

  it("flags broken hub-map connectors and icon-less generated message slides", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].layout = "message-hub-map";
    deck.slides[0].elements = [
      {
        id: "bad-diagonal",
        type: "shape",
        shape: "line",
        x: 1,
        y: 2,
        w: 3,
        h: 2,
        fill: "none",
        decorative: true,
        readingOrder: 1
      },
      {
        id: "message",
        type: "text",
        role: "body",
        text: "本文",
        x: 1,
        y: 1,
        w: 2,
        h: 0.4,
        fontSize: 18,
        bold: false,
        decorative: false,
        readingOrder: 2
      }
    ];

    const report = reviewVisualQuality(deck);

    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["visual.hub-map-diagonal-connector", "visual.message-slide-icon-missing"]));
  });

  it("flags icons that overlap text", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements = [
      {
        id: "step-icon",
        type: "svg",
        x: 1,
        y: 1,
        w: 0.5,
        h: 0.5,
        svg: "<svg/>",
        decorative: true,
        readingOrder: 1
      },
      {
        id: "step-label",
        type: "text",
        role: "caption",
        text: "STEP 1",
        x: 1.1,
        y: 1.1,
        w: 1,
        h: 0.3,
        fontSize: 12,
        bold: false,
        decorative: false,
        readingOrder: 2
      }
    ];

    const report = reviewVisualQuality(deck);

    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain("visual.icon-text-overlap");
  });

  it("adds Slideland-style advisory checks for whitespace, typography hierarchy, and color discipline", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].layout = "message-table";
    deck.slides[0].elements = [
      {
        id: "title",
        type: "text",
        role: "title",
        text: "見出し",
        x: 0.05,
        y: 0.05,
        w: 4,
        h: 0.4,
        fontSize: 18,
        bold: true,
        decorative: false,
        readingOrder: 1
      },
      {
        id: "body",
        type: "text",
        role: "body",
        text: "本文",
        x: 0.05,
        y: 0.55,
        w: 4,
        h: 0.4,
        fontSize: 16,
        bold: false,
        decorative: false,
        readingOrder: 2
      },
      { id: "red", type: "shape", shape: "rect", x: 0.05, y: 1.1, w: 3.1, h: 1, fill: "#e11d48", decorative: true, readingOrder: 3 },
      { id: "blue", type: "shape", shape: "rect", x: 3.3, y: 1.1, w: 3.1, h: 1, fill: "#2563eb", decorative: true, readingOrder: 4 },
      { id: "green", type: "shape", shape: "rect", x: 6.55, y: 1.1, w: 3.1, h: 1, fill: "#16a34a", decorative: true, readingOrder: 5 },
      { id: "orange", type: "shape", shape: "rect", x: 9.8, y: 1.1, w: 3.1, h: 1, fill: "#f97316", decorative: true, readingOrder: 6 }
    ];
    for (let index = 0; index < 8; index += 1) {
      deck.slides[0].elements.push({
        id: `chip-${index}`,
        type: "shape",
        shape: "rect",
        x: 0.05 + (index % 4) * 3.2,
        y: 2.35 + Math.floor(index / 4) * 2.25,
        w: 3.1,
        h: 2.05,
        fill: "#f8fafc",
        decorative: true,
        readingOrder: 10 + index
      });
    }

    const report = reviewVisualQuality(deck);

    expect(report.ok).toBe(true);
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["visual.slideland-whitespace-tight", "visual.slideland-typography-flat", "visual.slideland-color-discipline"])
    );
  });
});
