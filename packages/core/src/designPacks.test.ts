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
    const element = deck.slides[0]?.elements[0];

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
    const element = deck.slides[0]?.elements[0];
    expect(element?.type).toBe("pptxSlide");
    if (element?.type === "pptxSlide") {
      expect(element.sourceSlideIndex).toBe(31);
      expect(element.templatePath).toBe(join(zukaiDir, "zukai.pptx"));
    }
  });
});
