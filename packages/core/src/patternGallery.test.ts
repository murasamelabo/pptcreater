import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createComprehensivePatternDeck, lintDeckSpec, parseDeckSpec } from "./index.js";
import { renderDeckToPptx } from "@pptcreater/render-pptx";

describe("comprehensive pattern gallery", () => {
  it("builds and renders a deck covering the major slide patterns without blocking lint errors", async () => {
    const deck = parseDeckSpec(createComprehensivePatternDeck("ja-JP"));
    const report = lintDeckSpec(deck);
    const blocking = report.issues.filter((issue) => issue.severity === "error" && !issue.polishFixable);
    expect(blocking).toEqual([]);

    const kinds = new Set(
      deck.slides.flatMap((slide) => slide.metadata?.patternKinds ?? [])
    );
    expect(kinds).toEqual(
      new Set([
        "section",
        "native-diagram",
        "intent-diagram",
        "detail-explanation",
        "detail-qa",
        "detail-benefits",
        "visual-scaffold",
        "svg",
        "image",
        "table",
        "flow",
        "vertical-flow",
        "cycle",
        "before-after",
        "matrix",
        "venn",
        "gantt",
        "ranking",
        "mockup"
      ])
    );

    const outputDir = await mkdtemp(join(tmpdir(), "pptcreater-pattern-gallery-"));
    const outputPath = join(outputDir, "pattern-gallery.pptx");
    const result = await renderDeckToPptx(deck, outputPath);
    const written = await stat(result.outputPath);

    expect(written.size).toBeGreaterThan(10_000);
  });
});
