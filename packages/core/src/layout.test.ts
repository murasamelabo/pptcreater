import { describe, expect, it } from "vitest";
import { normalizeDeckLayout, normalizeReadingOrder } from "./layout.js";
import type { Slide } from "./schema.js";
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

  it("restacks opaque decorative shapes below overlapping text", () => {
    const slide: Slide = {
      id: "s1",
      title: "Z-order",
      layout: "title-content",
      elements: [
        {
          id: "body-text",
          type: "text",
          role: "body",
          text: "Visible message",
          x: 1,
          y: 1,
          w: 4,
          h: 1,
          fontSize: 24,
          bold: false,
          decorative: false,
          readingOrder: 1
        },
        {
          id: "cover-card",
          type: "shape",
          shape: "rect",
          x: 1,
          y: 1,
          w: 4,
          h: 1,
          fill: "#000000",
          decorative: true,
          readingOrder: 2
        }
      ]
    };

    const normalized = normalizeReadingOrder(slide);
    const text = normalized.elements.find((element) => element.id === "body-text");
    const card = normalized.elements.find((element) => element.id === "cover-card");

    expect(card?.readingOrder ?? 0).toBeLessThan(text?.readingOrder ?? 0);
  });

  it("keeps full-bleed backgrounds at the very bottom", () => {
    const slide: Slide = {
      id: "s2",
      title: "Background",
      layout: "title-content",
      elements: [
        {
          id: "title-text",
          type: "text",
          role: "title",
          text: "Title",
          x: 1,
          y: 1,
          w: 6,
          h: 1.5,
          fontSize: 36,
          bold: true,
          decorative: false,
          readingOrder: 5
        },
        {
          id: "atmosphere",
          type: "svg",
          svg: '<svg viewBox="0 0 10 10"><rect x="0" y="0" width="10" height="10" /></svg>',
          x: 0,
          y: 0,
          w: 13.333,
          h: 7.5,
          decorative: true,
          readingOrder: 1
        }
      ]
    };

    const normalized = normalizeReadingOrder(slide);
    const atmosphere = normalized.elements.find((element) => element.id === "atmosphere");
    const title = normalized.elements.find((element) => element.id === "title-text");

    expect(atmosphere?.readingOrder ?? 99).toBeLessThan(title?.readingOrder ?? 0);
    expect(atmosphere?.readingOrder).toBe(1);
  });
});
