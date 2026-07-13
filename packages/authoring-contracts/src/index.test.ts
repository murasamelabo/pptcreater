import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BenchmarkManifestSchema,
  CriticResponseSchema,
  SlideFragmentSchema,
  createSourceAnchor,
  renderDirectAuthoringSpike
} from "./index.js";

const SPIKE_MARKDOWN = `# Direct authoring spike

## 背景

文章をスライド型スキーマへ圧縮する前に、読者が理解する流れを決めます。

## 仕組み

原文の段落を保ったまま、章ごとに必要な説明量を決めます。

## 図解

図解は必要な場合だけFigure Catalogから呼び出します。

## 評価

生成したPNGとPPTXをArtifact Criticが評価します。
`;

describe("direct authoring architecture contracts", () => {
  it("creates deterministic source anchors and records edit lineage", () => {
    const input = { sourceUri: "fixtures/xaa.md", structuralPath: ["Architecture", "Token Exchange"], kind: "paragraph" as const, content: "ID-JAG を発行する。" };
    const first = createSourceAnchor(input);
    const same = createSourceAnchor({ ...input, content: "  ID-JAG   を発行する。 " });
    const edited = createSourceAnchor({ ...input, content: "ID-JAG を短命で発行する。", previousId: first.id });

    expect(same.id).toBe(first.id);
    expect(edited.id).not.toBe(first.id);
    expect(edited.previousId).toBe(first.id);
  });

  it("validates a DeckSpec-independent editable slide fragment", () => {
    const fragment = SlideFragmentSchema.parse({
      id: "three-stage-flow",
      bounds: { x: 0, y: 0, w: 10, h: 4 },
      commands: [
        { id: "node-a", kind: "shape", shape: "roundRect", frame: { x: 0, y: 1, w: 2, h: 1 }, sourceRefs: ["src_a"], style: {} },
        { id: "node-b", kind: "shape", shape: "roundRect", frame: { x: 4, y: 1, w: 2, h: 1 }, sourceRefs: ["src_b"], style: {} },
        { id: "edge-a-b", kind: "connector", from: "node-a", to: "node-b", frame: { x: 2, y: 1.5, w: 2, h: 0.01 }, sourceRefs: ["src_a", "src_b"], style: {} }
      ],
      editModel: [
        { id: "flow-items", commandIds: ["node-a", "node-b"], capability: "reorder", groupId: "items" }
      ],
      sourceRefs: ["src_a", "src_b"],
      accessibility: { summary: "Two-stage flow", longDescription: "Source A flows to source B.", readingOrder: ["node-a", "node-b"] },
      constraints: { minItems: 2, maxItems: 5, maxLabelChars: 24 }
    });

    expect(fragment.commands.map((command) => command.kind)).toEqual(["shape", "shape", "connector"]);
    expect(fragment.editModel[0].capability).toBe("reorder");
  });

  it("locks critic output to program-source revision briefs", () => {
    const response = CriticResponseSchema.parse({
      defects: [{ type: "semantic-figure-mismatch", slideId: "slide-4", severity: "blocking", evidence: "A sequence figure was used for peer categories." }],
      scores: { flow: 72, sourceFidelity: 100 },
      slideFindings: [{ slideId: "slide-4", findings: ["Use prose or peer comparison."] }],
      revisionBriefs: [{ programSourceId: "program.ts#slide-4", reason: "Figure semantics mismatch", requestedOutcome: "Replace the sequential figure without changing the manuscript." }],
      humanReviewNeeded: false
    });

    expect(response.revisionBriefs[0].programSourceId).toContain("program.ts");
  });

  it("loads the frozen benchmark manifest", async () => {
    const manifest = JSON.parse((await readFile(resolve("benchmarks/direct-authoring/manifest.json"), "utf8")).replace(/^\uFEFF/u, ""));
    const parsed = BenchmarkManifestSchema.parse(manifest);

    expect(parsed.scenarios).toHaveLength(6);
    expect(parsed.humanGate.minimumRaters).toBeGreaterThanOrEqual(5);
    expect(parsed.releaseGate.minimumScenarioWins).toBe(5);
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toMatch(/[A-Za-z]:[\\/]|\/Users\//u);
    for (const scenario of parsed.scenarios.filter((item) => item.source.availability === "repo")) {
      await expect(access(resolve(scenario.source.path))).resolves.toBeUndefined();
    }
  });

  it("does not depend on the legacy core authoring package", async () => {
    const packageManifest = JSON.parse((await readFile(resolve("packages/authoring-contracts/package.json"), "utf8")).replace(/^\uFEFF/u, "")) as { dependencies?: Record<string, string> };

    expect(packageManifest.dependencies).not.toHaveProperty("@pptcreater/core");
  });

  it("renders a direct PPTX without importing legacy authoring schemas", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pptcreater-direct-spike-"));
    try {
      const sourcePath = join(directory, "source.md");
      const outputPath = join(directory, "spike.pptx");
      await writeFile(sourcePath, SPIKE_MARKDOWN, "utf8");
      const result = await renderDirectAuthoringSpike({ sourceMarkdownPath: sourcePath, outputPath, title: "Direct Spike" });
      const bytes = await readFile(outputPath);
      const directSource = await readFile(resolve("packages/authoring-contracts/src/directSpike.ts"), "utf8");

      expect(result.slides).toBe(5);
      expect(result.sourceSections).toBe(4);
      expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
      const importLines = directSource.split(/\r?\n/u).filter((line) => /^import\s/u.test(line)).join("\n");
      expect(importLines).not.toMatch(/DeckSpec|MessageSpec|SlideIntent|createDeckFromMessageMap|@pptcreater\/core/u);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
