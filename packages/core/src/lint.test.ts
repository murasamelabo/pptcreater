import { describe, expect, it } from "vitest";
import { createSampleDeck, lintDeckSpec, parseDeckSpec } from "./index.js";

describe("DeckSpec linting", () => {
  it("accepts the generated sample deck", () => {
    const deck = parseDeckSpec(createSampleDeck("ja-JP"));
    const report = lintDeckSpec(deck);

    expect(report.ok).toBe(true);
    expect(report.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
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
});
