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

  it("clips native preview text like a slide canvas", () => {
    const html = renderStudioHtml(createSampleDeck("ja-JP"));

    expect(html).toContain(".native-text { overflow: hidden; white-space: pre-wrap; line-height: 1.15; overflow-wrap: normal; }");
  });

  it("keeps native preview text large enough to approximate slide readability", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "preview-size-probe",
      type: "text",
      role: "body",
      text: "本文",
      x: 1,
      y: 1,
      w: 2,
      h: 0.4,
      fontSize: 20,
      bold: false,
      decorative: false
    });

    const html = renderStudioHtml(deck);

    expect(html).toContain("font-size:14px");
  });

  it("does not emit whitespace-only lines", () => {
    const html = renderStudioHtml(createSampleDeck("ja-JP"));

    expect(html.split(/\r?\n/).filter((line) => /^\s+$/.test(line))).toHaveLength(0);
  });
});
