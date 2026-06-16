import { describe, expect, it } from "vitest";
import { createSampleDeck } from "@pptcreater/core";
import { renderStudioHtml } from "./index.js";

describe("Studio preview", () => {
  it("renders a localized static HTML preview", () => {
    const html = renderStudioHtml(createSampleDeck("ja-JP"));

    expect(html).toContain("pptcreater Studio");
    expect(html).toContain("スライド");
    expect(html).toContain("lint");
  });

  it("adds final source references to Studio previews", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.metadata.sources = [
      {
        id: "source-1",
        title: "Reference article",
        url: "https://example.com/source",
        usage: "inspiration"
      }
    ];

    const html = renderStudioHtml(deck);

    expect(html).toContain("参考URL・出典");
    expect(html).toContain("https://example.com/source");
  });
});
