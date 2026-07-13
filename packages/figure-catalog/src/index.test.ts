import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { instantiateFigure, loadFigureCatalog, searchFigures, validateFigureInstance } from "./index.js";

describe("figure catalog", () => {
  it("discovers the existing diagram encyclopedia and tree packs", async () => {
    const catalog = await loadFigureCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(90);
    expect(new Set(catalog.map((entry) => entry.packId))).toEqual(expect.objectContaining(new Set(["zukai", "tree"])));
    expect(catalog.every((entry) => entry.metadataConfidence === "inferred")).toBe(true);
    expect(catalog.every((entry) => entry.avoidWhen.length > 0)).toBe(true);
  });

  it("searches by semantic data shape, item count, and tone", async () => {
    const catalog = await loadFigureCatalog();
    const results = searchFigures(catalog, { semanticNeed: "工程 手順", dataShape: "sequence", itemCount: 5, tone: "light", limit: 5 });
    expect(results).toHaveLength(5);
    expect(results.every((entry) => entry.dataShape === "sequence")).toBe(true);
    expect(results.some((entry) => entry.id.startsWith("flow-horizontal"))).toBe(true);
  });

  it("instantiates a fixed-cardinality editable flow as a DeckSpec-independent fragment", async () => {
    const catalog = await loadFigureCatalog();
    const entry = catalog.find((item) => item.id === "flow-horizontal-p1")!;
    const fragment = instantiateFigure(entry, { labels: ["Source", "Notebook", "Manuscript", "Program", "PPTX"], sourceRefs: ["src_1", "src_2", "src_3"] }, { x: 1, y: 1.5, w: 11, h: 4.5 });
    const command = fragment.commands[0];
    expect(command.kind).toBe("importPptxComponent");
    if (command.kind !== "importPptxComponent") throw new Error("Unexpected command");
    expect(command.replacements).toMatchObject({ 要件定義: "Source", 設計: "Notebook", 開発: "Manuscript", テスト: "Program", リリース: "PPTX" });
    expect(command.operations).toEqual([]);
    expect(fragment.editModel.map((item) => item.capability)).toEqual(expect.arrayContaining(["edit-text", "reorder"]));
    expect(validateFigureInstance(fragment, entry)).toEqual([]);
  });

  it("rejects partial reduction of inferred PowerPoint templates", async () => {
    const catalog = await loadFigureCatalog();
    const entry = catalog.find((item) => item.id === "flow-horizontal-p1")!;
    expect(entry.editability.addRemove).toBe(false);
    expect(() => instantiateFigure(entry, { labels: ["Source", "Manuscript", "PPTX"], sourceRefs: ["src"] }, { x: 0, y: 0, w: 10, h: 4 })).toThrow(/exactly 5 items/u);
  });

  it("rejects label and item counts outside component constraints", async () => {
    const catalog = await loadFigureCatalog();
    const original = catalog.find((item) => item.id === "flow-horizontal-p1")!;
    const entry = { ...original, constraints: { minItems: 2, maxItems: 3, maxLabelChars: 8 } };
    expect(() => instantiateFigure(entry, { labels: ["Only one"], sourceRefs: ["src"] }, { x: 0, y: 0, w: 10, h: 4 })).toThrow(/at least 2/u);
    expect(() => instantiateFigure(entry, { labels: ["One", "Two", "Three", "Four"], sourceRefs: ["src"] }, { x: 0, y: 0, w: 10, h: 4 })).toThrow(/at most 3/u);
    expect(() => instantiateFigure(entry, { labels: ["Short", "This label is too long"], sourceRefs: ["src"] }, { x: 0, y: 0, w: 10, h: 4 })).toThrow(/exceeds 8/u);
  });

  it("does not import legacy authoring schemas", async () => {
    const source = await readFile(resolve("packages/figure-catalog/src/index.ts"), "utf8");
    const imports = source.split(/\r?\n/u).filter((line) => /^import\s/u.test(line)).join("\n");
    expect(imports).not.toMatch(/@pptcreater\/core|DeckSpec|MessageSpec|SlideIntent/u);
  });
});
