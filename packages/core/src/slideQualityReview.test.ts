import { describe, expect, it } from "vitest";
import { createSampleDeck, DeckSpecSchema, reviewDeck, reviewSlideQuality, type DeckSpec } from "./index.js";

function denseDeck(): DeckSpec {
  return DeckSpecSchema.parse({
    version: "0.1",
    title: "Dense",
    locale: "ja-JP",
    template: "modern-simple",
    slideSize: { widthInches: 13.333, heightInches: 7.5, aspect: "16:9" },
    slides: [
      {
        id: "dense-1",
        title: "概要",
        layout: "message-detail",
        background: { color: "#ffffff" },
        elements: [
          { id: "title", type: "text", role: "title", text: "概要", x: 0.8, y: 0.5, w: 10, h: 0.6, fontSize: 30, readingOrder: 1 },
          ...Array.from({ length: 10 }, (_, index) => ({
            id: `body-${index}`,
            type: "text" as const,
            role: "body" as const,
            text: "背景、前提、論点、補足、例外、注意事項、判断材料、次のアクションを同じスライドに詰め込み、読者が要点を探しにくい状態です。さらに、見出しや区画化がないため、情報設計ではなく文章量だけで理解を求める悪い配布資料になっています。",
            x: 0.9,
            y: 1.25 + index * 0.42,
            w: 8.5,
            h: 0.34,
            fontSize: 13,
            readingOrder: 2 + index
          }))
        ]
      }
    ],
    metadata: { contentMode: "handout", keywords: [], sources: [] }
  });
}

describe("slide quality standard review", () => {
  it("scores a generated sample deck with purpose profile defaults", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 3, contentMode: "decision" });
    const report = reviewSlideQuality(deck);

    expect(report.purpose).toBe("P5");
    expect(report.dimensions.D1.score).toBeGreaterThanOrEqual(2);
    expect(report.weightedScore).toBeGreaterThan(0);
    expect(report.storyFlow).not.toBeNull();
    expect(report.topFixes.length).toBeGreaterThan(0);
  });

  it("detects dense anti-patterns and caps severe quality findings", () => {
    const report = reviewSlideQuality(denseDeck(), "P4");

    expect(report.antiPatterns.map((pattern) => pattern.code)).toContain("A5");
    expect(report.verdict).toBe("C");
    expect(report.capApplied).toBe(true);
    expect(report.topFixes.map((fix) => fix.dimension)).toContain("A5");
  });

  it("routes quality anti-patterns through the aggregated review gate", () => {
    const report = reviewDeck(denseDeck());
    const qualityIssue = report.blocking.find((issue) => issue.code === "quality.a5");

    expect(qualityIssue?.owner).toBe("content-strategist");
  });
});