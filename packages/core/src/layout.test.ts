import { describe, expect, it } from "vitest";
import { normalizeDeckLayout } from "./layout.js";
import { createSampleDeck } from "./samples.js";

describe("layout polish", () => {
  it("keeps elements inside slide bounds", () => {
    const deck = createSampleDeck("en-US");
    deck.slides[0].elements[0].x = 20;

    const polished = normalizeDeckLayout(deck);

    expect(polished.slides[0].elements[0].x).toBeLessThan(13.333);
  });

  it("preserves valid edge-aligned full-slide elements", () => {
    const deck = createSampleDeck("en-US");
    deck.slides[0].elements.push({
      id: "full-bleed-bg",
      type: "shape",
      shape: "rect",
      x: 0,
      y: 0,
      w: 13.333,
      h: 7.5,
      fill: "#ffffff",
      decorative: true,
      readingOrder: 999
    });

    const polished = normalizeDeckLayout(deck);
    const fullBleed = polished.slides[0].elements.find((element) => element.id === "full-bleed-bg");

    expect(fullBleed).toMatchObject({ x: 0, y: 0, w: 13.333, h: 7.5 });
  });

  it("adjusts long text boxes", () => {
    const deck = createSampleDeck("en-US");
    const text = deck.slides[0].elements.find((element) => element.type === "text");
    if (text?.type === "text") {
      text.text = "Long text ".repeat(80);
      text.w = 2;
      text.h = 0.2;
      text.fontSize = 24;
    }

    const polished = normalizeDeckLayout(deck);
    const polishedText = polished.slides[0].elements.find((element) => element.type === "text");

    expect(polishedText?.h).toBeGreaterThanOrEqual(0.2);
  });
});
