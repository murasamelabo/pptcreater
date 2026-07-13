import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createLosslessManuscriptDraft } from "@pptcreater/manuscript";
import { parseMarkdownToSourceNotebook } from "@pptcreater/source-notebook";
import { compileManuscriptToSlideProgram, runDirectAuthoring } from "./index.js";

function editedFixture() {
  const notebook = parseMarkdownToSourceNotebook("# Product\n\n## Problem\n\nLong-lived keys prevent central control.\n\n## Target\n\nShort-lived delegation enables audit and revocation.\n", { sourceUri: "fixtures/direct.md" });
  const manuscript = createLosslessManuscriptDraft(notebook, { audience: "Architects", purpose: "Explain migration", desiredAction: "Approve prototype" });
  manuscript.thesis = "Replace long-lived keys with governed short-lived delegation.";
  for (const chapter of manuscript.chapters) {
    chapter.purpose = `Explain ${chapter.title} in the reader journey.`;
    for (const slide of chapter.slides) {
      slide.title = chapter.title;
      slide.takeaway = slide.visibleBody[0];
    }
  }
  return { notebook, manuscript };
}

describe("direct authoring orchestrator", () => {
  it("compiles a covered manuscript to a DeckSpec-independent Slide Program", async () => {
    const { notebook, manuscript } = editedFixture();
    const program = await compileManuscriptToSlideProgram({ notebook, manuscript, catalog: [] });
    expect(program.slides.length).toBe(manuscript.chapters.flatMap((chapter) => chapter.slides).length);
    expect(program.slides.every((slide) => slide.sourceRefs.length > 0)).toBe(true);
    expect(JSON.stringify(program)).not.toMatch(/DeckSpec|MessageSpec|visualType/u);
  });

  it("runs manuscript to PPTX to deterministic critic end-to-end", async () => {
    const { notebook, manuscript } = editedFixture();
    const directory = await mkdtemp(join(tmpdir(), "direct-authoring-"));
    try {
      const outputPath = join(directory, "direct.pptx");
      const result = await runDirectAuthoring({ notebook, manuscript, outputPath });
      const bytes = await readFile(outputPath);
      expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
      expect(result.critic.defects).toEqual([]);
      expect(result.critic.scores.sourceCoverage).toBe(100);
      expect(result.critic.humanReviewNeeded).toBe(true);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("allows a program author to replace the default slide composition", async () => {
    const { notebook, manuscript } = editedFixture();
    const program = await compileManuscriptToSlideProgram({ notebook, manuscript, catalog: [], composer: (slide) => ({ id: slide.id, title: slide.title, background: "000000", sourceRefs: slide.sourceRefs, notes: [], commands: [{ id: `${slide.id}-custom`, kind: "text", role: "title", text: `CUSTOM: ${slide.takeaway}`, frame: { x: 1, y: 1, w: 10, h: 1 }, sourceRefs: slide.sourceRefs, style: { color: "FFFFFF", fontSize: 24 } }] }) });
    expect(program.slides.every((slide) => slide.background === "000000")).toBe(true);
    expect(program.slides.every((slide) => slide.commands[0].kind === "text" && slide.commands[0].text.startsWith("CUSTOM:"))).toBe(true);
  });

  it("propagates design reference profiles to the program and composer", async () => {
    const { notebook, manuscript } = editedFixture();
    let composerProfileId = "";
    const designBrief = {
      id: "slideland-inspired",
      locale: "ja-JP" as const,
      mood: ["editorial"],
      paletteRoles: {},
      typography: { headingFont: "Yu Gothic", bodyFont: "Yu Gothic", cjkFallbacks: [] },
      spacing: { gridInches: 0.125, marginInches: 0.7, whitespace: "generous" as const },
      density: { targetVisibleChars: 240, maxVisibleChars: 520 },
      do: [], dont: [], referenceAssets: [],
      referenceProfiles: [{ id: "slideland", sourceUrl: "https://www.slideland.tech/docs/recommendation", principles: ["Lead with one claim"] }]
    };
    const program = await compileManuscriptToSlideProgram({ notebook, manuscript, catalog: [], designBrief, composer: (slide, _index, context) => {
      composerProfileId = context.designBrief.referenceProfiles[0].id;
      return { id: slide.id, title: slide.title, background: "FFFFFF", sourceRefs: slide.sourceRefs, notes: [], commands: [{ id: `${slide.id}-title`, kind: "text", role: "title", text: slide.title, frame: { x: 1, y: 1, w: 10, h: 1 }, sourceRefs: slide.sourceRefs, style: {} }] };
    } });
    expect(composerProfileId).toBe("slideland");
    expect(program.designBrief.referenceProfiles[0].principles).toEqual(["Lead with one claim"]);
    expect(program.designBrief.referenceProfiles[0].inspirationOnly).toBe(true);
  });

  it("does not import legacy authoring packages", async () => {
    const source = await readFile(resolve("packages/direct-authoring/src/index.ts"), "utf8");
    const imports = source.split(/\r?\n/u).filter((line) => /^import\s/u.test(line)).join("\n");
    expect(imports).not.toMatch(/@pptcreater\/core|DeckSpec|MessageSpec|SlideIntent/u);
  });
});
