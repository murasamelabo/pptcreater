import { describe, expect, it } from "vitest";
import { renderPonchiDiagram, renderSchematicDiagram } from "./index.js";

describe("ponchi diagram rendering", () => {
  it("rejects arrows that reference unknown nodes", () => {
    expect(() =>
      renderPonchiDiagram({
        title: "Invalid diagram",
        summary: "Invalid reference",
        longDescription: "This diagram intentionally references an unknown node to verify validation.",
        nodes: [
          {
            id: "a",
            label: "A",
            x: 10,
            y: 10
          }
        ],
        arrows: [
          {
            from: "a",
            to: "missing"
          }
        ]
      })
    ).toThrow(/unknown target node/);
  });
});

describe("schematic diagram rendering", () => {
  it("renders safe Slideland-style schematic presets", () => {
    for (const kind of ["table", "tree", "flow", "vertical-flow", "list", "list-horizontal", "list-enumeration", "mockup"] as const) {
      const rendered = renderSchematicDiagram({
        kind,
        title: `${kind} schematic`,
        summary: `${kind} visual`,
        longDescription: `This ${kind} schematic is generated from a safe preset for PowerPoint slide use.`,
        items: ["現状", "課題", "施策", "効果"],
        secondaryItems: ["Before", "After", "Evidence", "Next"],
        tone: "minimal"
      });

      expect(rendered.svg).toContain("<svg");
      expect(rendered.svg).toContain("<title>");
      expect(rendered.svg).not.toContain("<script");
    }
  });

  it("rejects canvases too small for preset geometry", () => {
    expect(() =>
      renderSchematicDiagram({
        kind: "table",
        title: "Too small",
        summary: "Too small",
        longDescription: "This schematic is intentionally too small to verify geometry validation.",
        items: ["A", "B"],
        width: 320,
        height: 180
      })
    ).toThrow();
  });

  it("accepts the default 16:9 schematic canvas", () => {
    const rendered = renderSchematicDiagram({
      kind: "vertical-flow",
      title: "Default canvas",
      summary: "Default canvas",
      longDescription: "This schematic uses the default sixteen by nine canvas size for stable geometry.",
      items: ["A", "B", "C", "D", "E"],
      width: 960,
      height: 540
    });

    expect(rendered.svg).toContain('viewBox="0 0 960 540"');
  });
});
