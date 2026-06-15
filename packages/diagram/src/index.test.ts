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

  it("draws explicit polygon arrowheads instead of relying on SVG markers", () => {
    const rendered = renderPonchiDiagram({
      title: "Flow",
      summary: "A to B",
      longDescription: "A simple two node flow used to verify that connectors render explicit arrowheads.",
      nodes: [
        { id: "a", label: "Source", x: 40, y: 200, w: 180, h: 90, kind: "system" },
        { id: "b", label: "Target", x: 520, y: 200, w: 180, h: 90, kind: "cloud" }
      ],
      arrows: [{ from: "a", to: "b", label: "sync", style: "orthogonal", bidirectional: true }]
    });

    expect(rendered.svg).toContain("<polygon");
    expect(rendered.svg).not.toContain("marker-end");
  });

  it("keeps multi-word node labels from splitting words across lines", () => {
    const rendered = renderPonchiDiagram({
      title: "Labels",
      summary: "wrapping",
      longDescription: "Verifies that node labels wrap on word boundaries rather than splitting words.",
      nodes: [{ id: "n", label: "Provisioning Service", x: 40, y: 200, w: 180, h: 96, kind: "cloud" }],
      arrows: []
    });

    // The word "Provisioning" must stay whole on one text line (no "Provisio" / "ning" split).
    expect(rendered.svg).toContain(">Provisioning<");
    expect(rendered.svg).toContain(">Service<");
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
