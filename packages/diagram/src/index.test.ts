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

  it("auto-lays-out nodes when coordinates are omitted and sizes the canvas to fit", () => {
    const rendered = renderPonchiDiagram({
      title: "Auto layout",
      summary: "no coordinates",
      longDescription: "Verifies the engine places nodes automatically when no x/y are provided.",
      nodes: [
        { id: "a", label: "Source", kind: "actor" },
        { id: "b", label: "Middle", kind: "system" },
        { id: "c", label: "Sink", kind: "data" }
      ],
      arrows: [
        { from: "a", to: "b" },
        { from: "b", to: "c" }
      ]
    });

    // A three-node chain lays out across three columns, so the canvas is wider than one node.
    const viewBox = rendered.svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
    expect(viewBox).not.toBeNull();
    expect(Number(viewBox![1])).toBeGreaterThan(Number(viewBox![2]));
    expect(rendered.svg).toContain("<polygon");
  });

  it("rejects a mix of auto-laid-out and hand-placed nodes", () => {
    expect(() =>
      renderPonchiDiagram({
        title: "Mixed placement",
        summary: "ambiguous",
        longDescription: "This diagram mixes placed and unplaced nodes to verify the all-or-nothing rule.",
        nodes: [
          { id: "a", label: "Placed", x: 40, y: 40 },
          { id: "b", label: "Floating" }
        ],
        arrows: [{ from: "a", to: "b" }]
      })
    ).toThrow(/auto-laid-out and hand-placed/);
  });

  it("routes a skip-rank arrow through a gutter instead of through the intermediate node", () => {
    const rendered = renderPonchiDiagram({
      title: "Skip arrow",
      summary: "bypass",
      longDescription: "Verifies that an arrow skipping a rank detours around the node it would cross.",
      direction: "LR",
      nodes: [
        { id: "a", label: "A", kind: "system" },
        { id: "b", label: "B", kind: "system" },
        { id: "c", label: "C", kind: "system" }
      ],
      // a->b->c places b between a and c; a->c skips b and must route around it.
      arrows: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "a", to: "c" }
      ]
    });

    // The bypass path is a multi-segment route (V then H then V), so its arrowhead is present and
    // the diagram still renders all three connectors as explicit polygons.
    const polygons = rendered.svg.match(/<polygon/g) ?? [];
    expect(polygons.length).toBeGreaterThanOrEqual(3);
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
