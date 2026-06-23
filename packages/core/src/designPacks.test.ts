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
});
