import { mkdir, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DeckSpecSchema, listDesignComponents, renderDesignComponentDeck } from "./index.js";

describe("design asset packs", () => {
  it("lists tree components and renders them as pptxSlide DeckSpec elements", async () => {
    const root = await mkdtemp(join(tmpdir(), "pptcreater-design-pack-"));
    const treeDir = join(root, "tree");
    await mkdir(treeDir, { recursive: true });
    await writeFile(join(treeDir, "tree.pptx"), "placeholder");
    await writeFile(
      join(treeDir, "manifest.json"),
      JSON.stringify(
        {
          id: "tree",
          name: "Tree pack",
          description: "Tree components.",
          version: "0.1.0",
          sourcePptx: "tree.pptx",
          components: [
            {
              id: "tree-test",
              kind: "tree",
              name: "Tree test",
              sourceSlideIndex: 3,
              bestFor: ["hierarchy"],
              constraints: { maxItems: 5, maxLabelChars: 18 }
            }
          ]
        },
        null,
        2
      ),
      "utf8"
    );

    const components = await listDesignComponents({ kind: "tree", roots: [root] });
    const deck = await renderDesignComponentDeck("tree-test", { roots: [root] });
    const element = deck.slides[0]?.elements.find((el) => el.type === "pptxSlide");

    expect(components).toHaveLength(1);
    expect(components[0]?.sourcePptxPath).toBe(join(treeDir, "tree.pptx"));
    expect(element?.type).toBe("pptxSlide");
    if (element?.type === "pptxSlide") {
      expect(element.sourceSlideIndex).toBe(3);
      expect(element.templatePath).toBe(join(treeDir, "tree.pptx"));
    }
    expect(DeckSpecSchema.safeParse(deck).success).toBe(true);
  });

  it("discovers components across multiple packs and filters by kind", async () => {
    const root = await mkdtemp(join(tmpdir(), "pptcreater-design-multipack-"));
    const treeDir = join(root, "tree");
    const zukaiDir = join(root, "zukai");
    await mkdir(treeDir, { recursive: true });
    await mkdir(zukaiDir, { recursive: true });
    await writeFile(join(treeDir, "tree.pptx"), "placeholder");
    await writeFile(join(zukaiDir, "zukai.pptx"), "placeholder");
    await writeFile(
      join(treeDir, "manifest.json"),
      JSON.stringify({
        id: "tree",
        name: "Tree pack",
        description: "Tree components.",
        version: "0.1.0",
        sourcePptx: "tree.pptx",
        components: [{ id: "tree-a", kind: "tree", name: "Tree A", sourceSlideIndex: 3 }]
      }),
      "utf8"
    );
    await writeFile(
      join(zukaiDir, "manifest.json"),
      JSON.stringify({
        id: "zukai",
        name: "Zukai pack",
        description: "Zukai components.",
        version: "0.1.0",
        sourcePptx: "zukai.pptx",
        components: [
          { id: "cycle-p1", kind: "cycle", name: "Cycle P1", sourceSlideIndex: 18 },
          { id: "matrix-p1", kind: "matrix", name: "Matrix P1", sourceSlideIndex: 31 }
        ]
      }),
      "utf8"
    );

    const all = await listDesignComponents({ roots: [root] });
    expect(all).toHaveLength(3);
    expect(new Set(all.map((c) => c.kind))).toEqual(new Set(["tree", "cycle", "matrix"]));

    const cycleOnly = await listDesignComponents({ kind: "cycle", roots: [root] });
    expect(cycleOnly).toHaveLength(1);
    expect(cycleOnly[0]?.id).toBe("cycle-p1");
    expect(cycleOnly[0]?.packId).toBe("zukai");

    const deck = await renderDesignComponentDeck("matrix-p1", { roots: [root] });
    const element = deck.slides[0]?.elements.find((el) => el.type === "pptxSlide");
    expect(element?.type).toBe("pptxSlide");
    if (element?.type === "pptxSlide") {
      expect(element.sourceSlideIndex).toBe(31);
      expect(element.templatePath).toBe(join(zukaiDir, "zukai.pptx"));
    }
  });

  it("passes editableGroups (with layout) into the pptxSlide nodeGroups and merges nodeOperations", async () => {
    const root = await mkdtemp(join(tmpdir(), "pptcreater-design-groups-"));
    const packDir = join(root, "zukai");
    await mkdir(packDir, { recursive: true });
    await writeFile(join(packDir, "zukai.pptx"), "placeholder");
    await writeFile(
      join(packDir, "manifest.json"),
      JSON.stringify({
        id: "zukai",
        name: "Zukai pack",
        description: "Zukai components.",
        version: "0.1.0",
        sourcePptx: "zukai.pptx",
        components: [
          {
            id: "flow-horizontal-p1",
            kind: "flow-horizontal",
            name: "Flow H P1",
            sourceSlideIndex: 4,
            editableGroups: [
              {
                id: "items",
                axis: "x",
                layout: "linear-x",
                connectorBetween: true,
                renumber: true,
                members: ["A", "B", "C"]
              }
            ]
          }
        ]
      }),
      "utf8"
    );

    const deck = await renderDesignComponentDeck("flow-horizontal-p1", {
      roots: [root],
      nodeOperations: [{ op: "add", group: "items", label: "D", cloneFrom: "B" }]
    });
    const element = deck.slides[0]?.elements.find((el) => el.type === "pptxSlide");
    expect(element?.type).toBe("pptxSlide");
    if (element?.type === "pptxSlide") {
      expect(element.nodeGroups).toHaveLength(1);
      expect(element.nodeGroups?.[0]?.layout).toBe("linear-x");
      expect(element.nodeGroups?.[0]?.members).toEqual(["A", "B", "C"]);
      expect(element.nodeOperations).toEqual([{ op: "add", group: "items", label: "D", cloneFrom: "B" }]);
    }
  });

  it("re-tones a design component figure for a dark deck (backdrop + title recolor)", async () => {
    const root = await mkdtemp(join(tmpdir(), "pptcreater-design-tone-"));
    const packDir = join(root, "zukai");
    await mkdir(packDir, { recursive: true });
    await writeFile(join(packDir, "zukai.pptx"), "placeholder");
    await writeFile(
      join(packDir, "manifest.json"),
      JSON.stringify({
        id: "zukai",
        name: "Zukai pack",
        description: "Zukai components.",
        version: "0.1.0",
        sourcePptx: "zukai.pptx",
        components: [{ id: "flow-horizontal-p1", kind: "flow-horizontal", name: "Flow H P1", sourceSlideIndex: 4, editableGroups: [] }]
      }),
      "utf8"
    );

    const dark = await renderDesignComponentDeck("flow-horizontal-p1", { roots: [root], tone: "dark" });
    const backdrop = dark.slides[0]?.elements.find((el) => el.id.endsWith("-backdrop"));
    expect(backdrop?.type).toBe("shape");
    if (backdrop?.type === "shape") {
      expect(backdrop.fill).toBe("#0E2233");
      expect(backdrop.readingOrder).toBe(0);
    }
    const darkFigure = dark.slides[0]?.elements.find((el) => el.type === "pptxSlide");
    if (darkFigure?.type === "pptxSlide") {
      expect(darkFigure.recolor?.some((r) => r.from.toLowerCase() === "#16243b")).toBe(true);
    }

    // background: "none" inherits the deck/template — no backdrop element, but the recolor still applies.
    const inherit = await renderDesignComponentDeck("flow-horizontal-p1", { roots: [root], tone: "dark", background: "none" });
    expect(inherit.slides[0]?.elements.some((el) => el.id.endsWith("-backdrop"))).toBe(false);
    const inheritFigure = inherit.slides[0]?.elements.find((el) => el.type === "pptxSlide");
    if (inheritFigure?.type === "pptxSlide") {
      expect(inheritFigure.recolor?.some((r) => r.from.toLowerCase() === "#16243b")).toBe(true);
    }
  });
});
