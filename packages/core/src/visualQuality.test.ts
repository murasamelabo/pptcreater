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
});
