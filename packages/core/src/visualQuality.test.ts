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

  it("flags ppptevaluater anti-patterns for over-dense and over-colored slides", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].layout = "message-detail";
    deck.slides[0].elements = [
      {
        id: "title",
        type: "text",
        role: "title",
        text: "詳細説明",
        x: 0.8,
        y: 0.4,
        w: 8,
        h: 0.5,
        fontSize: 28,
        bold: true,
        decorative: false,
        readingOrder: 1
      }
    ];
    for (let index = 0; index < 8; index += 1) {
      deck.slides[0].elements.push({
        id: `paragraph-${index}`,
        type: "text",
        role: "body",
        text: "これは長い説明文です。背景、前提、論点、補足、例外、注意事項を同じスライド内に詰め込み、読む人が要点を探しにくくなる状態を再現しています。視線の入口がなく、文章量だけで理解を求めるため、ミチミチな資料として扱うべき状態です。",
        x: 0.9,
        y: 1.2 + index * 0.45,
        w: 7.8,
        h: 0.35,
        fontSize: 13,
        bold: false,
        decorative: false,
        readingOrder: 2 + index
      });
    }
    ["#2563eb", "#16a34a", "#dc2626", "#f97316"].forEach((fill, index) => {
      deck.slides[0].elements.push({
        id: `color-${index}`,
        type: "shape",
        shape: "rect",
        x: 9,
        y: 1 + index * 0.5,
        w: 0.5,
        h: 0.3,
        fill,
        decorative: true,
        readingOrder: 20 + index
      });
    });

    const report = reviewVisualQuality(deck);

    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["quality.a2", "quality.a5", "quality.a6"]));
  });
});
