import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMarkdownToSourceNotebook } from "@pptcreater/source-notebook";
import { assertCompleteManuscriptCoverage, createLosslessManuscriptDraft, reviewManuscriptCoverage, serializeDeckManuscript } from "./index.js";

const SOURCE = `# Product

Opening context.

## Problem

The current process is slow.

- Long-lived key
- Distributed approval

## Target

Use short-lived delegation.
`;

describe("deck manuscript", () => {
  it("creates a lossless draft that explains every source block", () => {
    const notebook = parseMarkdownToSourceNotebook(SOURCE, { sourceUri: "fixtures/product.md" });
    const manuscript = createLosslessManuscriptDraft(notebook, { audience: "Architects", purpose: "Explain the migration", desiredAction: "Approve a prototype" });
    const coverage = assertCompleteManuscriptCoverage(notebook, manuscript);

    expect(coverage.coverageRatio).toBe(1);
    expect(coverage.referencedSourceBlocks).toBe(notebook.blocks.length);
    expect(coverage.omittedSourceBlocks).toBe(0);
    expect(manuscript.chapters.length).toBeGreaterThanOrEqual(2);
    expect(manuscript.chapters.flatMap((chapter) => chapter.slides).every((slide) => slide.editorialDecisions[0].kind === "keep")).toBe(true);
  });

  it("requires an explicit omission reason for every source unit not used on a slide", () => {
    const notebook = parseMarkdownToSourceNotebook(SOURCE, { sourceUri: "fixtures/omission.md" });
    const manuscript = createLosslessManuscriptDraft(notebook, { audience: "Architects", purpose: "Explain", desiredAction: "Review" });
    const chapter = manuscript.chapters.find((item) => item.slides.length > 1)!;
    const removedSlide = chapter.slides.pop();
    expect(removedSlide).toBeDefined();

    expect(() => assertCompleteManuscriptCoverage(notebook, manuscript)).toThrow(/unexplained/u);
    manuscript.sourceOmissions.push({ kind: "omit", sourceRefs: removedSlide!.sourceRefs, reason: "Duplicate context already proven in the preceding source unit." });
    expect(assertCompleteManuscriptCoverage(notebook, manuscript).coverageRatio).toBe(1);
  });

  it("rejects unknown source references and notebook hash drift", () => {
    const notebook = parseMarkdownToSourceNotebook(SOURCE, { sourceUri: "fixtures/unknown.md" });
    const manuscript = createLosslessManuscriptDraft(notebook, { audience: "Architects", purpose: "Explain", desiredAction: "Review" });
    manuscript.chapters[0].slides[0].sourceRefs.push("src_unknown");

    expect(reviewManuscriptCoverage(notebook, manuscript).unknownSourceRefs).toContain("src_unknown");
    expect(() => assertCompleteManuscriptCoverage(notebook, manuscript)).toThrow(/unknown source IDs/u);
    manuscript.chapters[0].slides[0].sourceRefs.pop();
    manuscript.sourceNotebookHash = "0000000000000000";
    expect(() => reviewManuscriptCoverage(notebook, manuscript)).toThrow(/does not match/u);
  });

  it("serializes a human-readable manuscript without layout names", () => {
    const notebook = parseMarkdownToSourceNotebook(SOURCE, { sourceUri: "fixtures/serialize.md" });
    const manuscript = createLosslessManuscriptDraft(notebook, { audience: "Architects", purpose: "Explain", desiredAction: "Review" });
    manuscript.chapters[0].slides[0].figure = { need: "Show the source relationship only if it improves understanding.", dataShape: "relationship", required: false, catalogHints: ["relationship-map"], avoid: ["decorative cards"] };
    const markdown = serializeDeckManuscript(manuscript);

    expect(markdown).toContain("sourceNotebookHash:");
    expect(markdown).toContain("**Takeaway:**");
    expect(markdown).toContain("**Source refs:**");
    expect(markdown).toContain("**Editorial decisions:**");
    expect(markdown).toContain("Figure brief");
    expect(markdown).not.toMatch(/visualType|DeckSpec|MessageSpec|table-text-system/u);
  });

  it("keeps nested headings in source order inside a chapter", () => {
    const notebook = parseMarkdownToSourceNotebook("# Root\n\n## Chapter\n\nIntro.\n\n### Detail\n\nDetail body.\n", { sourceUri: "fixtures/nested.md" });
    const manuscript = createLosslessManuscriptDraft(notebook, { audience: "Architects", purpose: "Explain", desiredAction: "Review" });
    const chapter = manuscript.chapters.find((item) => item.title === "Chapter")!;

    expect(chapter.slides.map((slide) => slide.visibleBody[0])).toEqual(["Intro.", "Detail", "Detail body."]);
    expect(assertCompleteManuscriptCoverage(notebook, manuscript).coverageRatio).toBe(1);
  });

  it("rejects editorial decisions that cite source blocks absent from the slide", () => {
    const notebook = parseMarkdownToSourceNotebook(SOURCE, { sourceUri: "fixtures/decision-refs.md" });
    const manuscript = createLosslessManuscriptDraft(notebook, { audience: "Architects", purpose: "Explain", desiredAction: "Review" });
    manuscript.chapters[0].slides[0].editorialDecisions[0].sourceRefs = ["src_unknown"];

    expect(() => assertCompleteManuscriptCoverage(notebook, manuscript)).toThrow(/not present in slide.sourceRefs/u);
  });

  it("creates a complete XAA lossless manuscript when the benchmark source is available", async () => {
    const sourcePath = process.env.PPTCREATER_BENCH_XAA_SOURCE;
    if (!sourcePath) return;
    const source = await readFile(sourcePath, "utf8");
    const notebook = parseMarkdownToSourceNotebook(source, { sourceUri: "benchmark/xaa.md", title: "XAA / ID-JAG 技術解説" });
    const manuscript = createLosslessManuscriptDraft(notebook, { audience: "Enterprise architects", purpose: "Explain XAA and ID-JAG", desiredAction: "Assess adoption" });
    const coverage = assertCompleteManuscriptCoverage(notebook, manuscript);
    const serialized = serializeDeckManuscript(manuscript);

    expect(coverage.referencedSourceBlocks).toBe(181);
    expect(serialized).toContain("requested_token_type");
    expect(serialized).toContain("actor_token_type");
    expect(serialized.length).toBeGreaterThan(source.length);
  });

  it("does not import legacy authoring schemas", async () => {
    const source = await readFile(resolve("packages/manuscript/src/index.ts"), "utf8");
    const imports = source.split(/\r?\n/u).filter((line) => /^import\s/u.test(line)).join("\n");
    expect(imports).not.toMatch(/@pptcreater\/core|DeckSpec|MessageSpec|SlideIntent/u);
  });
});
