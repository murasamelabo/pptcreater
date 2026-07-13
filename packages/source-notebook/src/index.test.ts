import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { notebookCoverage, parseMarkdownToSourceNotebook, serializeSourceNotebook, sourceNotebookFromLegacyDocSpec } from "./index.js";

const COMPLETE_MARKDOWN = [
  "# Notebook fixture",
  "",
  "Intro paragraph with **strong**, *emphasis*, `inline code`, and [link](https://example.com).",
  "",
  "## Data",
  "",
  "- first item",
  "1. ordered item",
  "",
  "| Name | Value |",
  "| :--- | ---: |",
  "| alpha | 1 |",
  "",
  "> quoted line",
  "> second line",
  "",
  "```ts",
  "const value = 1;",
  "```",
  "",
  "![Architecture](./architecture.png \"System architecture\")",
  "",
  "[source]: https://example.com/source",
  ""
].join("\n");

describe("source notebook", () => {
  it("preserves ordered source blocks and all supported Markdown structures", () => {
    const notebook = parseMarkdownToSourceNotebook(COMPLETE_MARKDOWN, { sourceUri: "fixtures/complete.md" });
    const coverage = notebookCoverage(notebook);

    expect(notebook.title).toBe("Notebook fixture");
    expect(notebook.blocks.map((block) => block.order)).toEqual(notebook.blocks.map((_, index) => index));
    expect(coverage).toEqual({ heading: 2, paragraph: 1, "list-item": 2, table: 1, code: 1, quote: 1, image: 1, citation: 1 });
    const paragraph = notebook.blocks.find((block) => block.kind === "paragraph");
    expect(paragraph?.marks.map((mark) => mark.kind)).toEqual(["strong", "emphasis", "code", "link"]);
    const table = notebook.blocks.find((block) => block.kind === "table");
    expect(table?.headers).toEqual(["Name", "Value"]);
    expect(table?.alignments).toEqual(["left", "right"]);
    expect(table?.rows).toEqual([["alpha", "1"]]);
    expect(serializeSourceNotebook(notebook)).toBe(COMPLETE_MARKDOWN);
  });

  it("keeps source IDs stable across whitespace-only edits", () => {
    const first = parseMarkdownToSourceNotebook("# Title\n\nParagraph with   spaces.\n", { sourceUri: "fixtures/stable.md" });
    const second = parseMarkdownToSourceNotebook("# Title\r\n\r\nParagraph with spaces.\r\n", { sourceUri: "fixtures/stable.md", previous: first });

    expect(second.blocks.map((block) => block.anchor.id)).toEqual(first.blocks.map((block) => block.anchor.id));
    expect(second.blocks.every((block) => block.anchor.previousId === undefined)).toBe(true);
  });

  it("records lineage for a small content edit at the same structural position", () => {
    const first = parseMarkdownToSourceNotebook("# Title\n\nOriginal paragraph.\n", { sourceUri: "fixtures/lineage.md" });
    const second = parseMarkdownToSourceNotebook("# Title\n\nRevised paragraph with detail.\n", { sourceUri: "fixtures/lineage.md", previous: first });
    const oldParagraph = first.blocks.find((block) => block.kind === "paragraph");
    const newParagraph = second.blocks.find((block) => block.kind === "paragraph");

    expect(newParagraph?.anchor.id).not.toBe(oldParagraph?.anchor.id);
    expect(newParagraph?.anchor.previousId).toBe(oldParagraph?.anchor.id);
  });

  it("keeps unchanged IDs when a sibling block is inserted before them", () => {
    const first = parseMarkdownToSourceNotebook("# Title\n\n- Alpha\n- Beta\n", { sourceUri: "fixtures/insertion.md" });
    const second = parseMarkdownToSourceNotebook("# Title\n\n- New\n- Alpha\n- Beta\n", { sourceUri: "fixtures/insertion.md", previous: first });
    const idsByText = (notebook: typeof first) => new Map(notebook.blocks.filter((block) => block.kind === "list-item").map((block) => [block.text, block.anchor.id]));
    const firstIds = idsByText(first);
    const secondIds = idsByText(second);

    expect(secondIds.get("Alpha")).toBe(firstIds.get("Alpha"));
    expect(secondIds.get("Beta")).toBe(firstIds.get("Beta"));
    expect(second.blocks.filter((block) => block.kind === "list-item" && ["Alpha", "Beta"].includes(block.text)).every((block) => block.anchor.previousId === undefined)).toBe(true);
  });

  it("resolves parent references when sibling headings have duplicate text", () => {
    const notebook = parseMarkdownToSourceNotebook("# Root\n\n## Repeat\n\nFirst.\n\n## Repeat\n\nSecond.\n", { sourceUri: "fixtures/duplicate-headings.md" });
    const headingIds = new Set(notebook.blocks.filter((block) => block.kind === "heading").map((block) => block.anchor.id));
    const repeatHeadings = notebook.blocks.filter((block) => block.kind === "heading" && block.text === "Repeat");
    const paragraphs = notebook.blocks.filter((block) => block.kind === "paragraph");

    expect(repeatHeadings).toHaveLength(2);
    expect(new Set(repeatHeadings.map((block) => block.anchor.id)).size).toBe(2);
    expect(paragraphs.every((block) => Boolean(block.parentHeadingId && headingIds.has(block.parentHeadingId)))).toBe(true);
    expect(paragraphs.map((block) => block.parentHeadingId)).toEqual(repeatHeadings.map((block) => block.anchor.id));
  });

  it("preserves the exact XAA source as non-slide-shaped blocks when available", async () => {
    const sourcePath = process.env.PPTCREATER_BENCH_XAA_SOURCE;
    if (!sourcePath) return;
    let markdown: string;
    try {
      markdown = await readFile(sourcePath, "utf8");
    } catch {
      return;
    }
    const notebook = parseMarkdownToSourceNotebook(markdown, { sourceUri: "benchmark/xaa.md", title: "XAA / ID-JAG 技術解説" });
    const coverage = notebookCoverage(notebook);
    const raw = notebook.blocks.map((block) => block.raw).join("\n");

    expect(notebook.blocks.length).toBeGreaterThan(40);
    expect(coverage.heading).toBeGreaterThanOrEqual(12);
    expect(coverage.table).toBeGreaterThanOrEqual(5);
    expect(coverage.code).toBeGreaterThanOrEqual(2);
    expect(raw).toContain("requested_token_type");
    expect(raw).toContain("actor_token_type");
    expect(JSON.stringify(notebook)).not.toMatch(/visualType|slideRole|DeckSpec|MessageSpec/u);
  });

  it("does not import the legacy core package", async () => {
    const source = await readFile(resolve("packages/source-notebook/src/index.ts"), "utf8");
    const imports = source.split(/\r?\n/u).filter((line) => /^import\s/u.test(line)).join("\n");

    expect(imports).not.toMatch(/@pptcreater\/core|DeckSpec|MessageSpec|SlideIntent/u);
  });

  it("rejects Markdown that exceeds the configured source size", () => {
    expect(() => parseMarkdownToSourceNotebook("# Title\n\nToo large", { sourceUri: "fixtures/large.md", maxSourceBytes: 8 })).toThrow(/maximum allowed/u);
  });

  it("adapts a legacy DocSpec shape without depending on core types", () => {
    const notebook = sourceNotebookFromLegacyDocSpec({
      sourceId: "legacy-auth",
      title: "Legacy auth",
      sections: [{ id: "purpose", level: 2, title: "Purpose", text: "Authenticate users." }],
      tables: [{ id: "params", sectionId: "purpose", headers: ["Name", "Value"], rows: [["userName", "required"]] }],
      diagrams: [{ id: "flow", sectionId: "purpose", kind: "mermaid", source: "flowchart LR\nA-->B" }]
    });

    expect(notebook.blocks.map((block) => block.kind)).toEqual(["heading", "paragraph", "table", "code"]);
    expect(notebook.parseWarnings[0].message).toContain("legacy DocSpec");
    const headingId = notebook.blocks[0].anchor.id;
    expect(notebook.blocks.slice(1).every((block) => block.parentHeadingId === headingId)).toBe(true);
  });
});
