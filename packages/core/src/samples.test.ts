import { describe, expect, it } from "vitest";
import { createSampleDeck } from "./samples.js";

describe("sample deck generation", () => {
  it("creates a visual sample deck", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 4, contentMode: "decision" });

    expect(deck.slides).toHaveLength(4);
    expect(deck.slides.some((slide) => slide.elements.some((element) => element.type === "svg" || element.type === "diagram"))).toBe(true);
  });

  it("rejects invalid runtime content modes", () => {
    expect(() => createSampleDeck("en-US", { contentMode: "bogus" as "presentation" })).toThrow(/contentMode/);
  });
});
