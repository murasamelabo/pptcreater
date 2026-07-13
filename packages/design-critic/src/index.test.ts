import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DesignBriefSchema } from "@pptcreater/authoring-contracts";
import { createLosslessManuscriptDraft } from "@pptcreater/manuscript";
import { renderSlideProgram, type SlideProgram } from "@pptcreater/slide-sdk";
import { parseMarkdownToSourceNotebook } from "@pptcreater/source-notebook";
import { critiqueDirectAuthoring } from "./index.js";

const brief = DesignBriefSchema.parse({ id: "critic", locale: "ja-JP", mood: [], paletteRoles: {}, typography: { headingFont: "Yu Gothic", bodyFont: "Yu Gothic", cjkFallbacks: [] }, spacing: { gridInches: 0.125, marginInches: 0.7, whitespace: "balanced" }, density: { targetVisibleChars: 240, maxVisibleChars: 520 }, do: [], dont: [], referenceAssets: [] });

function fixture() {
  const notebook = parseMarkdownToSourceNotebook("# Root\n\n## Topic\n\nComplete explanation.\n", { sourceUri: "fixtures/critic.md" });
  const manuscript = createLosslessManuscriptDraft(notebook, { audience: "Architects", purpose: "Explain", desiredAction: "Review" });
  const refs = notebook.blocks.map((block) => block.anchor.id);
  const program: SlideProgram = { version: "1.0", id: "critic-program", title: "Critic", locale: "ja-JP", designBrief: brief, slides: [{ id: "slide-1", title: "Topic", background: "FFFFFF", sourceRefs: refs, notes: ["Source-aware notes"], commands: [{ id: "title", kind: "text", role: "title", text: "Topic", frame: { x: 1, y: 1, w: 10, h: 0.8 }, sourceRefs: refs, style: { fontSize: 28 } }, { id: "body", kind: "text", role: "body", text: "Complete explanation.", frame: { x: 1, y: 2, w: 10, h: 2 }, sourceRefs: refs, style: { fontSize: 18 } }] }] };
  return { notebook, manuscript, program };
}

describe("design critic", () => {
  it("passes deterministic gates and requests human review for a complete program", async () => {
    const { notebook, manuscript, program } = fixture();
    const directory = await mkdtemp(join(tmpdir(), "critic-"));
    try {
      const pptxPath = join(directory, "critic.pptx");
      await renderSlideProgram(program, pptxPath);
      const report = await critiqueDirectAuthoring({ notebook, manuscript, program, pptxPath });
      expect(report.defects).toEqual([]);
      expect(report.scores.sourceCoverage).toBe(100);
      expect(report.humanReviewNeeded).toBe(true);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("blocks missing manuscript source refs and returns program revision briefs", async () => {
    const { notebook, manuscript, program } = fixture();
    program.slides[0].sourceRefs = [];
    const report = await critiqueDirectAuthoring({ notebook, manuscript, program });
    expect(report.defects.map((defect) => defect.type)).toContain("source-fidelity");
    expect(report.revisionBriefs[0].programSourceId).toBe("program");
    expect(report.humanReviewNeeded).toBe(false);
  });

  it("blocks a sequence figure brief without an ordered relationship", async () => {
    const { notebook, manuscript, program } = fixture();
    manuscript.chapters[0].slides[0].figure = { need: "Show these peer categories", dataShape: "sequence", required: true, catalogHints: [], avoid: [] };
    const report = await critiqueDirectAuthoring({ notebook, manuscript, program });
    expect(report.defects.map((defect) => defect.type)).toContain("semantic-figure-mismatch");
  });

  it("does not treat a resolved Figure Catalog import as an alignment defect", async () => {
    const { notebook, manuscript, program } = fixture();
    program.slides[0].commands = [{ id: "catalog", kind: "importPptxComponent", componentId: "flow-horizontal-p1", frame: { x: 0, y: 0, w: 13.333, h: 7.5 }, sourceRefs: program.slides[0].sourceRefs, replacements: {}, operations: [] }];
    const report = await critiqueDirectAuthoring({ notebook, manuscript, program });
    expect(report.defects).toEqual([]);
  });

  it("advises against putting a concept slide into one large prose container", async () => {
    const { notebook, manuscript, program } = fixture();
    program.slides[0].commands = [{
      id: "prose",
      kind: "text",
      role: "body",
      text: "A long conceptual explanation. ".repeat(15),
      frame: { x: 0.8, y: 1.8, w: 11.6, h: 4.5 },
      sourceRefs: program.slides[0].sourceRefs,
      style: {}
    }];
    const report = await critiqueDirectAuthoring({ notebook, manuscript, program });
    expect(report.defects.map((defect) => defect.type)).toContain("single-large-prose-container");
    expect(report.defects.map((defect) => defect.type)).toContain("missing-focal-visual");
    expect(report.defects.find((defect) => defect.type === "single-large-prose-container")?.severity).toBe("advisory");
  });

  it("does not treat an incidental connector as a focal visual", async () => {
    const { notebook, manuscript, program } = fixture();
    program.slides[0].commands = [{ id: "prose", kind: "text", role: "body", text: "A long conceptual explanation. ".repeat(15), frame: { x: 0.8, y: 1.8, w: 11.6, h: 4.5 }, sourceRefs: program.slides[0].sourceRefs, style: {} }, { id: "incidental", kind: "connector", from: "prose", to: "prose", frame: { x: 1, y: 6.5, w: 1, h: 0.01 }, sourceRefs: [], style: {} }];
    const report = await critiqueDirectAuthoring({ notebook, manuscript, program });
    expect(report.defects.map((defect) => defect.type)).toContain("missing-focal-visual");
  });
});
