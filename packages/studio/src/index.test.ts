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
});
