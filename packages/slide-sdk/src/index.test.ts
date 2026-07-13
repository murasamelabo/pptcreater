import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DesignBriefSchema, SlideFragmentSchema } from "@pptcreater/authoring-contracts";
import { createCatalogComponentResolver, instantiateFigure, loadFigureCatalog } from "@pptcreater/figure-catalog";
import { fragmentToCommands, preflightSlideProgram, renderSlideProgram, type SlideProgram } from "./index.js";

const designBrief = DesignBriefSchema.parse({ id: "direct-light", locale: "ja-JP", mood: ["editorial", "precise"], paletteRoles: { background: "FBFAF7", text: "222222", accent: "A33B32" }, typography: { headingFont: "Yu Gothic", bodyFont: "Yu Gothic", cjkFallbacks: ["Meiryo"] }, spacing: { gridInches: 0.125, marginInches: 0.7, whitespace: "balanced" }, density: { targetVisibleChars: 240, maxVisibleChars: 520 }, do: ["Preserve prose"], dont: ["Force card grids"], referenceAssets: [] });

function sampleProgram(): SlideProgram {
  return {
    version: "1.0",
    id: "sample-program",
    title: "Direct Slide Program",
    locale: "ja-JP",
    designBrief,
    slides: [
      {
        id: "cover",
        title: "Cover",
        background: "FBFAF7",
        sourceRefs: ["src_cover"],
        notes: ["Explain the direct-authoring architecture."],
        commands: [
          { id: "cover-title", kind: "text", role: "title", text: "直接スライドプログラム", frame: { x: 0.9, y: 2.2, w: 8.4, h: 0.9 }, sourceRefs: ["src_cover"], style: { fontSize: 30, bold: true, color: "222222" } },
          { id: "cover-accent", kind: "shape", shape: "rect", frame: { x: 0, y: 0, w: 0.18, h: 7.5 }, sourceRefs: [], style: { fill: "A33B32", line: "A33B32" } }
        ]
      },
      {
        id: "flow",
        title: "Flow",
        background: "FFFFFF",
        sourceRefs: ["src_a", "src_b"],
        notes: [],
        commands: [
          { id: "a", kind: "shape", shape: "roundRect", frame: { x: 1, y: 2.5, w: 2.4, h: 1 }, sourceRefs: ["src_a"], style: { fill: "EFE9E2", line: "D3CEC7" } },
          { id: "a-label", kind: "text", role: "label", text: "Source", frame: { x: 1.2, y: 2.82, w: 2, h: 0.3 }, sourceRefs: ["src_a"], style: { fontSize: 16, align: "center" } },
          { id: "b", kind: "shape", shape: "roundRect", frame: { x: 7.5, y: 2.5, w: 2.4, h: 1 }, sourceRefs: ["src_b"], style: { fill: "F1F5F9", line: "CBD5E1" } },
          { id: "b-label", kind: "text", role: "label", text: "PPTX", frame: { x: 7.7, y: 2.82, w: 2, h: 0.3 }, sourceRefs: ["src_b"], style: { fontSize: 16, align: "center" } },
          { id: "a-b", kind: "connector", from: "a", to: "b", label: "Slide Program", frame: { x: 3.4, y: 3, w: 4.1, h: 0.01 }, sourceRefs: ["src_a", "src_b"], style: { color: "A33B32", width: 2 } }
        ]
      }
    ]
  };
}

describe("slide sdk", () => {
  it("renders a DeckSpec-independent Slide Program to PPTX", async () => {
    const directory = await mkdtemp(join(tmpdir(), "slide-sdk-"));
    try {
      const outputPath = join(directory, "program.pptx");
      const result = await renderSlideProgram(sampleProgram(), outputPath);
      const bytes = await readFile(outputPath);
      expect(result.issues).toEqual([]);
      expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("blocks overflow, duplicate IDs, and broken command references", () => {
    const program = sampleProgram();
    program.slides[0].commands.push({ id: "cover-title", kind: "text", role: "body", text: "Very long text ".repeat(80), frame: { x: 1, y: 1, w: 1, h: 0.2 }, sourceRefs: [], style: { fontSize: 20 } });
    program.slides[1].commands.push({ id: "broken", kind: "connector", from: "missing", to: "b", frame: { x: 0, y: 0, w: 1, h: 0.1 }, sourceRefs: [], style: {} });
    const codes = preflightSlideProgram(program).map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining(["duplicate-command-id", "text-overflow-risk", "unknown-command-ref"]));
  });

  it("keeps component import explicitly unsupported until Figure Catalog wiring", () => {
    const program = sampleProgram();
    program.slides[0].commands.push({ id: "component", kind: "importPptxComponent", componentId: "flow-horizontal-p1", frame: { x: 1, y: 1, w: 10, h: 4 }, sourceRefs: [], replacements: {}, operations: [] });
    expect(preflightSlideProgram(program).map((issue) => issue.code)).toContain("unsupported-component-import");
  });

  it("transplants a real diagram encyclopedia component into the generated PPTX", async () => {
    const catalog = await loadFigureCatalog();
    const entry = catalog.find((item) => item.id === "flow-horizontal-p1")!;
    const fragment = instantiateFigure(entry, { labels: ["Source", "Manuscript", "PPTX"], sourceRefs: ["src_1", "src_2", "src_3"] }, { x: 0, y: 0, w: 13.333, h: 7.5 });
    const program = sampleProgram();
    program.slides[1].commands = fragment.commands;
    const directory = await mkdtemp(join(tmpdir(), "slide-sdk-component-"));
    try {
      const outputPath = join(directory, "component.pptx");
      await renderSlideProgram(program, outputPath, { componentResolver: createCatalogComponentResolver(catalog), workspaceRoot: process.cwd() });
      const bytes = await readFile(outputPath);
      expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(bytes);
      const xml = await zip.file("ppt/slides/slide2.xml")!.async("string");
      expect(xml).toContain("Source");
      expect(xml).toContain("Manuscript");
      expect(xml).toContain("PPTX");
      expect(xml).not.toContain("テスト");
      expect(xml).not.toContain("リリース");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("accepts SlideFragment commands without a DeckSpec conversion", () => {
    const fragment = SlideFragmentSchema.parse({ id: "fragment", bounds: { x: 0, y: 0, w: 4, h: 2 }, commands: [{ id: "box", kind: "shape", shape: "roundRect", frame: { x: 0, y: 0, w: 4, h: 2 }, sourceRefs: [], style: {} }], editModel: [], sourceRefs: [], accessibility: { summary: "Box", longDescription: "Editable box", readingOrder: ["box"] }, constraints: {} });
    expect(fragmentToCommands(fragment)[0].kind).toBe("shape");
  });

  it("does not import legacy authoring packages", async () => {
    const source = await readFile(resolve("packages/slide-sdk/src/index.ts"), "utf8");
    const imports = source.split(/\r?\n/u).filter((line) => /^import\s/u.test(line)).join("\n");
    expect(imports).not.toMatch(/@pptcreater\/core|DeckSpec|MessageSpec|SlideIntent/u);
  });
});
