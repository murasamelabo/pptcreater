import { describe, expect, it } from "vitest";
import { parseDeckSpec } from "./schema.js";
import { createSampleDeck } from "./samples.js";

describe("sample deck generation", () => {
  it("creates a visual sample deck", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 4, contentMode: "decision" });

    expect(deck.slides).toHaveLength(4);
    expect(deck.slides.every((slide) => slide.elements.some((element) => element.type === "shape"))).toBe(true);
    expect(deck.slides[2].elements.filter((element) => element.type === "shape")).toHaveLength(6);
  });

  it("changes visible labels for technical mode", () => {
    const deck = createSampleDeck("ja-JP", { contentMode: "technical" });
    const text = deck.slides.flatMap((slide) => slide.elements).filter((element) => element.type === "text").map((element) => element.text).join(" ");

    expect(text).toContain("概念");
    expect(text).toContain("構成");
  });

  it("rejects invalid runtime content modes", () => {
    expect(() => createSampleDeck("en-US", { contentMode: "bogus" as "presentation" })).toThrow(/contentMode/);
  });

  it("requires alt text for non-decorative native shapes", () => {
    const deck = createSampleDeck("en-US");
    const shape = deck.slides[0].elements.find((element) => element.type === "shape");
    expect(shape).toBeDefined();
    if (shape?.type === "shape") {
      shape.decorative = false;
    }

    const parsed = parseDeckSpec(deck);
    const target = parsed.slides[0].elements.find((element) => element.type === "shape");
    expect(target).toMatchObject({ decorative: false });
  });

  it("accepts common agent-generated shape aliases and zero-height lines", () => {
    const deck = createSampleDeck("en-US", { slideCount: 1 });
    deck.slides[0].elements.push(
      {
        id: "zero-height-line",
        type: "shape",
        shape: "line",
        x: 1,
        y: 1,
        w: 2,
        h: 0,
        fill: "none",
        decorative: true,
        readingOrder: 100
      },
      {
        id: "rounded-alias",
        type: "shape",
        shape: "roundedRect",
        x: 1,
        y: 1.2,
        w: 2,
        h: 1,
        fill: "#ffffff",
        decorative: true,
        readingOrder: 101
      }
    );

    expect(() => parseDeckSpec(deck)).not.toThrow();
  });

  it("rejects zero-height non-line shapes", () => {
    const deck = createSampleDeck("en-US", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "bad-zero-height-rect",
      type: "shape",
      shape: "rect",
      x: 1,
      y: 1,
      w: 2,
      h: 0,
      fill: "#ffffff",
      decorative: true,
      readingOrder: 102
    });

    expect(() => parseDeckSpec(deck)).toThrow(/Only line shapes/);
  });
});
