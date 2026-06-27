import { describe, expect, it } from "vitest";
import { DeckSpecSchema } from "@pptcreater/core";
import { SCHEMATIC_KIND_CATALOG, SCHEMATIC_KINDS, SCHEMATIC_MODE_TEMPLATES, SCHEMATIC_STYLE_PRESETS, renderDiagramIntent, renderNativePonchiDiagram, renderNativeSchematicDiagram, renderPonchiDiagram, renderSchematicDiagram, schematicKindsForStyleProfile, schematicTemplatesForStyleProfile, schematicToneForStyleProfile } from "./index.js";

const TEST_FULL_WIDTH_PATTERN = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\u30FC\u30FB\uFF01-\uFF60\uFFE0-\uFFE6]/u;

function estimatedSvgTextWidth(value: string, fontSize: number): number {
  return Array.from(value).reduce((sum, char) => {
    if (/\s/.test(char)) {
      return sum + fontSize * 0.35;
    }

    if (TEST_FULL_WIDTH_PATTERN.test(char)) {
      return sum + fontSize;
    }

    return sum + fontSize * 0.58;
  }, 0);
}

function nodeTextLines(svg: string): Array<{ text: string; fontSize: number }> {
  return [...svg.matchAll(/<text\b[^>]*font-size="([0-9.]+)"[^>]*>(.*?)<\/text>/gu)].map((match) => ({
    fontSize: Number(match[1]),
    text: match[2]
  }));
}

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0;
}

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

  it("wraps mixed Japanese and English node labels inside the node width", () => {
    const rendered = renderPonchiDiagram({
      title: "Mixed labels",
      summary: "mixed label wrapping",
      longDescription: "Verifies that mixed Japanese and English architecture labels are wrapped by visual width so they stay inside their nodes.",
      nodes: [
        {
          id: "asset",
          label: "保護対象資産 デバイス / ユーザー / IP",
          x: 40,
          y: 200,
          w: 176,
          h: 92,
          kind: "actor"
        }
      ],
      arrows: []
    });

    expect(rendered.svg).toContain(">保護対象資産<");
    expect(rendered.svg).toContain(">デバイス / ユーザー /<");
    expect(rendered.svg).toContain(">IP<");
    expect(rendered.svg).not.toContain(">保護対象資産 デバイス /<");
  });

  it("prevents overwide unspaced node labels from escaping the card", () => {
    const rendered = renderPonchiDiagram({
      title: "Long labels",
      summary: "long label wrapping",
      longDescription: "Verifies that emergency wrapping or clipping prevents unspaced labels from escaping a node.",
      nodes: [
        {
          id: "kanji",
          label: "保護対象資産認証基盤監査証跡管理責任者",
          x: 40,
          y: 80,
          w: 176,
          h: 92,
          kind: "system"
        },
        {
          id: "latin",
          label: "SuperLongProvisioningServiceIdentifier",
          x: 40,
          y: 220,
          w: 176,
          h: 92,
          kind: "system"
        }
      ],
      arrows: []
    });

    for (const line of nodeTextLines(rendered.svg)) {
      expect(estimatedSvgTextWidth(line.text, line.fontSize)).toBeLessThanOrEqual(144);
    }
    expect(rendered.svg).toContain("SuperLong");
    expect(rendered.svg).toContain("…");
  });

  it("auto-lays-out nodes when coordinates are omitted and preserves the requested slide canvas", () => {
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

    // A three-node chain is scaled into the default 16:9 canvas so SVG image fallback never distorts.
    const viewBox = rendered.svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
    expect(viewBox).not.toBeNull();
    expect(Number(viewBox![1])).toBe(960);
    expect(Number(viewBox![2])).toBe(540);
    expect(rendered.svg).toContain("<g transform=");
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

  it("places SVG skip-rank connector labels on the routed gutter segment", () => {
    const rendered = renderPonchiDiagram({
      title: "Skip label",
      summary: "SVG skip label",
      longDescription: "Verifies that SVG fallback connector labels follow the routed bypass segment instead of sitting on the intermediate node.",
      direction: "LR",
      nodes: [
        { id: "a", label: "A", kind: "system" },
        { id: "b", label: "B", kind: "system" },
        { id: "c", label: "C", kind: "system" }
      ],
      arrows: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "a", to: "c", label: "governance lane" }
      ]
    });
    const labelRect = rendered.svg.match(/<rect x="[^"]+" y="([^"]+)" width="[^"]+" height="22" rx="11"/);

    expect(labelRect).not.toBeNull();
    expect(Number(labelRect?.[1])).toBeLessThan(60);
  });
});

describe("native ponchi diagram rendering", () => {
  it("renders editable DeckSpec shape and text elements instead of SVG or images", () => {
    const rendered = renderNativePonchiDiagram(
      {
        title: "Private Marketplace",
        summary: "Private marketplace governance flow",
        longDescription: "A native PowerPoint object diagram showing administrators publishing approved VSIX packages to a private marketplace used by managed clients.",
        direction: "LR",
        nodes: [
          { id: "admin", label: "管理者", sublabel: "審査・承認", kind: "actor" },
          { id: "repo", label: "Private Marketplace", sublabel: "VSIX / manifest", kind: "cloud" },
          { id: "client", label: "管理対象端末", sublabel: "VS Code", kind: "system" },
          { id: "policy", label: "AllowedExtensions", sublabel: "導入可否を判定", kind: "data", lane: "control" }
        ],
        arrows: [
          { from: "admin", to: "repo", label: "publish" },
          { from: "repo", to: "client", label: "install" },
          { from: "policy", to: "client", label: "enforce", dashed: true }
        ],
        groups: [{ id: "enterprise", label: "Enterprise control plane", nodeIds: ["admin", "repo", "policy"] }]
      },
      { frame: { x: 0.7, y: 1.5, w: 12, h: 5.4 }, readingOrderStart: 20 }
    );

    expect(rendered.elements.every((element) => element.type === "shape" || element.type === "text")).toBe(true);
    expect(rendered.elements.some((element) => element.id.startsWith("native-diagram-connector-"))).toBe(true);
    expect(rendered.elements.some((element) => element.type === "text" && element.text.includes("Private Marketplace"))).toBe(true);
    expect(rendered.elements.filter((element) => element.type === "text").every((element) => Boolean(element.contrastBackground))).toBe(true);
    expect(JSON.stringify(rendered)).not.toContain("\"type\":\"image\"");
    expect(JSON.stringify(rendered)).not.toContain("\"svg\"");
  });

  it("keeps generated element IDs unique for non-ASCII node IDs", () => {
    const rendered = renderNativePonchiDiagram({
      title: "Japanese IDs",
      summary: "Unique IDs",
      longDescription: "Verifies that Japanese source node ids do not collapse into duplicate generated element ids.",
      nodes: [
        { id: "管理者", label: "管理者", kind: "actor" },
        { id: "端末", label: "端末", kind: "system" }
      ],
      arrows: [{ from: "管理者", to: "端末" }]
    });
    const ids = rendered.elements.map((element) => element.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("colors all native nodes with a single shared accent regardless of node kind", () => {
    const rendered = renderNativePonchiDiagram({
      title: "Single accent",
      summary: "Single accent across kinds",
      longDescription: "Verifies that mixed node kinds do not produce a rainbow of category fills — every node shares one accent (no per-kind hue), per the one-accent design principle.",
      nodes: [
        { id: "a", label: "Actor", kind: "actor" },
        { id: "b", label: "System", kind: "system" },
        { id: "c", label: "Data", kind: "data" },
        { id: "d", label: "Cloud", kind: "cloud" }
      ],
      arrows: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "d" }
      ]
    });
    const accentBars = rendered.elements.filter(
      (element) => element.type === "shape" && /native-diagram-accent-/.test(element.id)
    );
    expect(accentBars.length).toBe(4);
    const fills = new Set(accentBars.map((element) => (element.type === "shape" ? element.fill : "")));
    // All four mixed-kind nodes share exactly one accent color.
    expect(fills.size).toBe(1);
    // And it is the single brand accent, not a per-kind hue like the old cloud violet.
    expect(fills.has("#2563eb")).toBe(true);
  });

  it("honors an explicit accent and a per-node accent override", () => {
    const rendered = renderNativePonchiDiagram(
      {
        title: "Custom accent",
        summary: "Custom accent",
        longDescription: "Verifies that the diagram accent option recolors all nodes and a per-node accent overrides just that node.",
        nodes: [
          { id: "a", label: "A", kind: "system" },
          { id: "b", label: "B", kind: "system", accent: "#9333ea" }
        ],
        arrows: [{ from: "a", to: "b" }]
      },
      { accent: "#0f766e" }
    );
    const barA = rendered.elements.find((element) => element.type === "shape" && element.id === "native-diagram-accent-a-0");
    const barB = rendered.elements.find((element) => element.type === "shape" && element.id === "native-diagram-accent-b-1");
    if (barA?.type === "shape" && barB?.type === "shape") {
      expect(barA.fill).toBe("#0f766e");
      expect(barB.fill).toBe("#9333ea");
    }
  });

  it("respects straight connector style for native ponchi diagrams", () => {
    const rendered = renderNativePonchiDiagram({
      title: "Straight relationship",
      summary: "Straight connector",
      longDescription: "Verifies that straight connector style is honored so relationship maps do not become jagged elbow routes.",
      nodes: [
        { id: "a", label: "A", x: 40, y: 40, w: 160, h: 80, kind: "system" },
        { id: "b", label: "B", x: 520, y: 280, w: 160, h: 80, kind: "system" }
      ],
      arrows: [{ from: "a", to: "b", style: "straight" }]
    });
    const connectorSegments = rendered.elements.filter((element) => element.id.startsWith("native-diagram-connector-"));

    expect(connectorSegments).toHaveLength(1);
  });

  it("keeps native node labels below the accent/marker band", () => {
    const rendered = renderNativePonchiDiagram({
      title: "Readable node labels",
      summary: "Readable labels",
      longDescription: "Verifies that native node labels do not overlap the top accent band or kind marker.",
      nodes: [
        { id: "touch", label: "利用接点 IDE / GitHub / CLI", kind: "actor" },
        { id: "context", label: "コンテキスト・コード・Issue・Docs", kind: "data" }
      ],
      arrows: [{ from: "touch", to: "context" }]
    });
    const node = rendered.elements.find((element) => element.type === "shape" && element.id === "native-diagram-node-touch-0");
    const label = rendered.elements.find((element) => element.type === "text" && element.id === "native-diagram-label-touch-0");

    expect(node?.type).toBe("shape");
    expect(label?.type).toBe("text");
    if (node?.type === "shape" && label?.type === "text") {
      expect(label.y).toBeGreaterThanOrEqual(node.y + 0.28);
    }
  });

  it("keeps multi-line native node text inside the node bottom", () => {
    const rendered = renderNativePonchiDiagram({
      title: "Dense node labels",
      summary: "Dense labels",
      longDescription: "Verifies that reserving space above native labels does not push multi-line label and sublabel text below the node.",
      nodes: [
        { id: "a", label: "Very long primary label for a compact node", sublabel: "Long secondary detail that also wraps", kind: "system" },
        { id: "b", label: "Another long primary label for compact layout", sublabel: "Another long secondary detail", kind: "process" },
        { id: "c", label: "Third long primary label for compact layout", sublabel: "Third secondary detail", kind: "data" },
        { id: "d", label: "Fourth long primary label for compact layout", sublabel: "Fourth secondary detail", kind: "note" }
      ],
      arrows: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "d" }
      ]
    });

    for (let index = 0; index < 4; index += 1) {
      const nodeId = ["a", "b", "c", "d"][index];
      const node = rendered.elements.find((element) => element.type === "shape" && element.id === `native-diagram-node-${nodeId}-${index}`);
      const texts = rendered.elements.filter(
        (element) =>
          element.type === "text" &&
          (element.id === `native-diagram-label-${nodeId}-${index}` || element.id === `native-diagram-sublabel-${nodeId}-${index}`)
      );
      expect(node?.type).toBe("shape");
      if (node?.type === "shape") {
        for (const text of texts) {
          if (text.type === "text") {
            expect(text.y + text.h).toBeLessThanOrEqual(node.y + node.h + 0.001);
          }
        }
      }
    }
  });

  it("uses a single border-to-border native connector for aligned adjacent nodes", () => {
    const rendered = renderNativePonchiDiagram({
      title: "Aligned connector",
      summary: "Single connector",
      longDescription: "Verifies that adjacent nodes on the same lane are connected by one line segment from border to border.",
      nodes: [
        { id: "a", label: "A", kind: "system" },
        { id: "b", label: "B", kind: "system" }
      ],
      arrows: [{ from: "a", to: "b" }]
    });
    const source = rendered.elements.find((element) => element.type === "shape" && element.id === "native-diagram-node-a-0");
    const target = rendered.elements.find((element) => element.type === "shape" && element.id === "native-diagram-node-b-1");
    const connectorSegments = rendered.elements.filter(
      (element) => element.type === "shape" && element.shape === "line" && element.id.startsWith("native-diagram-connector-")
    );

    expect(connectorSegments).toHaveLength(1);
    if (source?.type === "shape" && target?.type === "shape" && connectorSegments[0]?.type === "shape") {
      expect(connectorSegments[0].x).toBeCloseTo(source.x + source.w, 2);
      expect(connectorSegments[0].x + connectorSegments[0].w).toBeCloseTo(target.x, 2);
      expect(connectorSegments[0].h).toBe(0);
    }
  });

  it("routes straight native connectors as orthogonal segments to avoid diagonal flips", () => {
    const rendered = renderNativePonchiDiagram({
      title: "Straight connector",
      summary: "Orthogonal native fallback",
      longDescription: "Verifies that straight connectors with a negative slope are emitted as safe orthogonal native line segments.",
      nodes: [
        { id: "from", label: "From", x: 80, y: 320, w: 176, h: 92, kind: "system" },
        { id: "to", label: "To", x: 620, y: 120, w: 176, h: 92, kind: "system" }
      ],
      arrows: [{ from: "from", to: "to", style: "straight" }]
    });
    const connectorSegments = rendered.elements.filter(
      (element) => element.type === "shape" && element.shape === "line" && element.id.startsWith("native-diagram-connector-")
    );

    expect(connectorSegments.length).toBeGreaterThan(1);
    expect(connectorSegments.every((segment) => segment.w <= 0.01 || segment.h <= 0.01)).toBe(true);
  });

  it("fits long connector labels against the actual native text box width", () => {
    const rendered = renderNativePonchiDiagram({
      title: "Connector labels",
      summary: "Long labels",
      longDescription: "Verifies that generated connector labels fit the same width used for their native text boxes.",
      nodes: [
        { id: "a", label: "A", kind: "system" },
        { id: "b", label: "B", kind: "system" }
      ],
      arrows: [{ from: "a", to: "b", label: "AllowedExtensions policy enforcement decision" }]
    });
    const label = rendered.elements.find((element) => element.type === "text" && element.id === "native-diagram-connector-label-0");

    expect(label?.type).toBe("text");
    if (label?.type === "text") {
      expect(estimatedSvgTextWidth(label.text, label.fontSize)).toBeLessThanOrEqual(label.w * 72 - 10 + 0.001);
    }
  });

  it("keeps adjacent connector labels inside the node gap", () => {
    const rendered = renderNativePonchiDiagram({
      title: "Adjacent label",
      summary: "Adjacent connector label",
      longDescription: "Verifies that labels on a direct adjacent connector are constrained to the gap between the source and target nodes.",
      nodes: [
        { id: "a", label: "A", kind: "system" },
        { id: "b", label: "B", kind: "system" }
      ],
      arrows: [{ from: "a", to: "b", label: "install from private marketplace with approval" }]
    });
    const sourceNode = rendered.elements.find((element) => element.type === "shape" && element.id === "native-diagram-node-a-0");
    const targetNode = rendered.elements.find((element) => element.type === "shape" && element.id === "native-diagram-node-b-1");
    const labelBackground = rendered.elements.find((element) => element.type === "shape" && element.id === "native-diagram-connector-label-bg-0");

    expect(sourceNode?.type).toBe("shape");
    expect(targetNode?.type).toBe("shape");
    expect(labelBackground?.type).toBe("shape");
    if (sourceNode?.type === "shape" && targetNode?.type === "shape" && labelBackground?.type === "shape") {
      expect(overlaps(sourceNode, labelBackground)).toBe(false);
      expect(overlaps(targetNode, labelBackground)).toBe(false);
    }
  });

  it("places skip-rank connector labels on routed gutter segments above nodes", () => {
    const rendered = renderNativePonchiDiagram({
      title: "Skip label",
      summary: "Skip-rank label placement",
      longDescription: "Verifies that labels on skip-rank connectors sit on the routed gutter segment instead of under the intermediate node.",
      direction: "LR",
      nodes: [
        { id: "a", label: "A", kind: "system" },
        { id: "b", label: "B", kind: "system" },
        { id: "c", label: "C", kind: "system" }
      ],
      arrows: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "a", to: "c", label: "skip via governance lane" }
      ]
    });
    const intermediateNode = rendered.elements.find((element) => element.type === "shape" && element.id === "native-diagram-node-b-1");
    const skipLabel = rendered.elements.find((element) => element.type === "text" && element.id === "native-diagram-connector-label-2");

    expect(intermediateNode?.type).toBe("shape");
    expect(skipLabel?.type).toBe("text");
    if (intermediateNode?.type === "shape" && skipLabel?.type === "text") {
      expect(overlaps(intermediateNode, skipLabel)).toBe(false);
      expect(skipLabel.readingOrder).toBeGreaterThan(intermediateNode.readingOrder);
    }
  });

  it("keeps top-to-bottom skip-rank connector labels out of intermediate nodes", () => {
    const rendered = renderNativePonchiDiagram({
      title: "Vertical skip label",
      summary: "Top-to-bottom skip-rank label placement",
      longDescription: "Verifies that labels on vertical skip-rank connectors fit in the side gutter instead of overlapping the intermediate node.",
      direction: "TB",
      nodes: [
        { id: "a", label: "A", kind: "system" },
        { id: "b", label: "B", kind: "system" },
        { id: "c", label: "C", kind: "system" }
      ],
      arrows: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "a", to: "c", label: "enforce AllowedExtensions governance lane" }
      ]
    });
    const intermediateNode = rendered.elements.find((element) => element.type === "shape" && element.id === "native-diagram-node-b-1");
    const skipLabelBackground = rendered.elements.find((element) => element.type === "shape" && element.id === "native-diagram-connector-label-bg-2");

    expect(intermediateNode?.type).toBe("shape");
    expect(skipLabelBackground?.type).toBe("shape");
    if (intermediateNode?.type === "shape" && skipLabelBackground?.type === "shape") {
      expect(overlaps(intermediateNode, skipLabelBackground)).toBe(false);
    }
  });

  it("uses the opposite gutter for edge-adjacent left-to-right hand-placed skip labels", () => {
    const rendered = renderNativePonchiDiagram({
      title: "Top edge skip label",
      summary: "Hand-placed skip label near top edge",
      longDescription: "Verifies that a top-edge hand-placed diagram uses the lower gutter when the upper gutter would be clamped into the node band.",
      direction: "LR",
      width: 760,
      height: 360,
      nodes: [
        { id: "a", label: "A", x: 40, y: 10, w: 176, h: 92, kind: "system" },
        { id: "b", label: "B", x: 292, y: 10, w: 176, h: 92, kind: "system" },
        { id: "c", label: "C", x: 544, y: 10, w: 176, h: 92, kind: "system" }
      ],
      arrows: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "a", to: "c", label: "edge-safe lower governance lane" }
      ]
    });
    const intermediateNode = rendered.elements.find((element) => element.type === "shape" && element.id === "native-diagram-node-b-1");
    const skipLabelBackground = rendered.elements.find((element) => element.type === "shape" && element.id === "native-diagram-connector-label-bg-2");

    expect(intermediateNode?.type).toBe("shape");
    expect(skipLabelBackground?.type).toBe("shape");
    if (intermediateNode?.type === "shape" && skipLabelBackground?.type === "shape") {
      expect(overlaps(intermediateNode, skipLabelBackground)).toBe(false);
    }
  });

  it("uses the opposite gutter for edge-adjacent top-to-bottom hand-placed skip labels", () => {
    const rendered = renderNativePonchiDiagram({
      title: "Right edge skip label",
      summary: "Hand-placed vertical skip label near right edge",
      longDescription: "Verifies that a right-edge hand-placed diagram uses the left gutter when the right gutter would be clamped into the node band.",
      direction: "TB",
      width: 820,
      height: 520,
      nodes: [
        { id: "a", label: "A", x: 620, y: 40, w: 176, h: 92, kind: "system" },
        { id: "b", label: "B", x: 620, y: 200, w: 176, h: 92, kind: "system" },
        { id: "c", label: "C", x: 620, y: 360, w: 176, h: 92, kind: "system" }
      ],
      arrows: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "a", to: "c", label: "edge-safe left governance lane" }
      ]
    });
    const intermediateNode = rendered.elements.find((element) => element.type === "shape" && element.id === "native-diagram-node-b-1");
    const skipLabelBackground = rendered.elements.find((element) => element.type === "shape" && element.id === "native-diagram-connector-label-bg-2");

    expect(intermediateNode?.type).toBe("shape");
    expect(skipLabelBackground?.type).toBe("shape");
    if (intermediateNode?.type === "shape" && skipLabelBackground?.type === "shape") {
      expect(overlaps(intermediateNode, skipLabelBackground)).toBe(false);
    }
  });

  it("keeps generated objects inside the requested frame", () => {
    const frame = { x: 0.6, y: 1.4, w: 12.1, h: 5.5 };
    const rendered = renderNativePonchiDiagram(
      {
        title: "Architecture",
        summary: "Dense architecture flow",
        longDescription: "A dense but still bounded native diagram used to verify frame fitting and aspect-ratio preservation.",
        direction: "LR",
        nodes: [
          { id: "a", label: "申請", kind: "actor" },
          { id: "b", label: "審査", kind: "process" },
          { id: "c", label: "署名", kind: "process" },
          { id: "d", label: "Marketplace", kind: "cloud" },
          { id: "e", label: "Client", kind: "system" }
        ],
        arrows: [
          { from: "a", to: "b" },
          { from: "b", to: "c" },
          { from: "c", to: "d" },
          { from: "d", to: "e" }
        ]
      },
      { frame }
    );

    for (const element of rendered.elements) {
      expect(element.x).toBeGreaterThanOrEqual(frame.x - 0.001);
      expect(element.y).toBeGreaterThanOrEqual(frame.y - 0.001);
      expect(element.x + element.w).toBeLessThanOrEqual(frame.x + frame.w + 0.001);
      expect(element.y + element.h).toBeLessThanOrEqual(frame.y + frame.h + 0.001);
    }
  });
});

describe("schematic diagram rendering", () => {
  it("renders safe Slideland-style schematic presets", () => {
    for (const kind of SCHEMATIC_KINDS) {
      const rendered = renderSchematicDiagram({
        kind,
        title: `${kind} schematic`,
        summary: `${kind} visual`,
        longDescription: `This ${kind} schematic is generated from a safe preset for PowerPoint slide use.`,
        items: ["現状 40", "課題 30", "施策 20", "効果 10", "運用", "改善"],
        secondaryItems: ["目標 100", "Before 60", "After 80", "Q1", "Q2", "Q3"],
        axisX: "Maturity",
        axisY: "Impact",
        tone: "minimal"
      });

      expect(rendered.svg).toContain("<svg");
      expect(rendered.svg).toContain("<title>");
      expect(rendered.svg.match(/<text\b/gu)?.length ?? 0).toBeGreaterThan(0);
      expect(rendered.svg).not.toContain("NaN");
      expect(rendered.svg).not.toContain("undefined");
      expect(rendered.svg).not.toContain("<script");
    }
  });

  it("renders every schematic kind as editable native PowerPoint elements", () => {
    for (const kind of SCHEMATIC_KINDS) {
      const rendered = renderNativeSchematicDiagram(
        {
          kind,
          title: `${kind} schematic`,
          summary: `${kind} native visual`,
          longDescription: `This ${kind} schematic is generated as editable PowerPoint shapes and text.`,
          items: ["現状 40", "課題 30", "施策 20", "効果 10", "運用", "改善"],
          secondaryItems: ["目標 100", "Before 60", "After 80", "Q1", "Q2", "Q3"],
          axisX: "Maturity",
          axisY: "Impact",
          tone: "minimal"
        },
        { frame: { x: 0.5, y: 1.5, w: 12.2, h: 5.7 }, idPrefix: `native-${kind.replace(/[^a-z0-9]+/gi, "-")}` }
      );

      expect(rendered.elements.length).toBeGreaterThan(3);
      expect(rendered.elements.every((element) => element.type === "shape" || element.type === "text")).toBe(true);
      expect(rendered.elements.some((element) => element.type === "text")).toBe(true);
      expect(JSON.stringify(rendered)).not.toContain("\"type\":\"svg\"");
      expect(JSON.stringify(rendered)).not.toContain("\"type\":\"image\"");
      expect(rendered.elements.every((element) => element.w > 0 && element.h >= 0)).toBe(true);
    }
  });

  it("does not render native schematic cards with repeated vertical accent bars", () => {
    const rendered = renderNativeSchematicDiagram(
      {
        kind: "flow",
        title: "Flow without accent bars",
        summary: "No repeated accent-bar cards",
        longDescription: "Verifies that generated schematic cards do not use the AI-looking repeated colored vertical accent-bar card style.",
        items: ["目的", "申請", "確認", "予約"],
        tone: "minimal"
      },
      { frame: { x: 0.5, y: 1.5, w: 12.2, h: 5.7 }, idPrefix: "no-accent-bars" }
    );
    const verticalAccentBars = rendered.elements.filter(
      (element) =>
        element.type === "shape" &&
        element.shape === "rect" &&
        /-accent$/u.test(element.id) &&
        element.w <= 0.12 &&
        element.h >= 0.5
    );

    expect(verticalAccentBars).toEqual([]);
  });

  it("does not truncate native schematic labels with ellipsis", () => {
    const rendered = renderNativeSchematicDiagram(
      {
        kind: "list-horizontal",
        title: "Long labels",
        summary: "No truncation",
        longDescription: "Verifies that native schematic text fitting wraps or resizes labels instead of silently replacing content with ellipsis.",
        items: ["対象月齢と自治体要件", "母子同室または別室", "ミルクおむつ追加費用", "キャンセル料と持ち物"],
        tone: "minimal"
      },
      { frame: { x: 0.5, y: 1.5, w: 12.2, h: 5.7 }, idPrefix: "no-ellipsis" }
    );
    const text = rendered.elements.filter((element) => element.type === "text").map((element) => element.text).join("\n");

    expect(text).not.toContain("…");
  });

  it("emits valid DeckSpec elements for native table schematics without secondary items", () => {
    const rendered = renderNativeSchematicDiagram({
      kind: "table",
      title: "Table without right column",
      summary: "Native table without right column",
      longDescription: "This native table schematic intentionally omits secondary items to verify optional cells are not emitted as empty text.",
      items: ["Header", "Row A", "Row B"],
      tone: "minimal"
    });
    const emptyText = rendered.elements.filter((element) => element.type === "text" && element.text.length === 0);

    expect(emptyText).toHaveLength(0);
    expect(
      DeckSpecSchema.safeParse({
        version: "0.1",
        title: "Native table",
        locale: "ja-JP",
        template: "modern-simple",
        slides: [
          {
            id: "s1",
            title: "Native table",
            elements: rendered.elements
          }
        ],
        metadata: { keywords: [], sources: [] }
      }).success
    ).toBe(true);
  });

  it("emits only horizontal or vertical native schematic connector segments", () => {
    for (const kind of ["tree", "cycle", "correlation", "step"] as const) {
      const rendered = renderNativeSchematicDiagram(
        {
          kind,
          title: `${kind} native schematic`,
          summary: `${kind} native schematic`,
          longDescription: `This ${kind} native schematic verifies connector segments are safe horizontal or vertical lines.`,
          items: ["Root", "A", "B", "C", "D", "E"],
          secondaryItems: ["one", "two", "three"],
          tone: "minimal"
        },
        { frame: { x: 0.5, y: 1.5, w: 12.2, h: 5.7 }, idPrefix: `native-${kind}` }
      );
      const lines = rendered.elements.filter((element) => element.type === "shape" && element.shape === "line");

      expect(lines.length).toBeGreaterThan(0);
      expect(lines.every((line) => line.type === "shape" && (line.w <= 0.01 || line.h <= 0.01))).toBe(true);
    }
  });

  it("uses kind-specific SmartArt-like native layouts for the five core schematics", () => {
    const base = {
      title: "Core schematic",
      summary: "Core schematic",
      longDescription: "This native schematic verifies a kind-specific SmartArt-like visual contract.",
      items: ["Root", "A", "B", "C", "D", "E"],
      secondaryItems: ["Q1", "Q2", "Q3", "Q4"],
      axisX: "Effort",
      axisY: "Impact",
      tone: "minimal" as const
    };
    const render = (kind: "tree" | "cycle" | "correlation" | "matrix" | "gantt") =>
      renderNativeSchematicDiagram({ ...base, kind }, { frame: { x: 0.5, y: 1.5, w: 12.2, h: 5.7 }, idPrefix: `core-${kind}` });

    const tree = render("tree").elements;
    const treeRoot = tree.find((element) => element.type === "shape" && element.id === "core-tree-root-shape");
    const treeBus = tree.find((element) => element.type === "shape" && element.id === "core-tree-tree-bus");
    const treeChildren = tree.filter((element) => element.type === "shape" && /core-tree-child-\d-shape/.test(element.id));
    expect(treeRoot?.type).toBe("shape");
    expect(treeBus?.type).toBe("shape");
    expect(treeChildren.length).toBeGreaterThan(1);
    if (treeRoot?.type === "shape") {
      expect(treeChildren.every((child) => child.type === "shape" && child.y > treeRoot.y + treeRoot.h)).toBe(true);
    }

    const cycle = render("cycle").elements;
    expect(cycle.some((element) => element.type === "shape" && element.id === "core-cycle-cycle-ring")).toBe(true);
    expect(cycle.some((element) => element.type === "shape" && element.id === "core-cycle-cycle-core")).toBe(true);
    expect(cycle.filter((element) => element.type === "shape" && /core-cycle-cycle-node-\d/.test(element.id))).toHaveLength(6);
    expect(cycle.some((element) => element.type === "shape" && /core-cycle-cycle-\d-card/.test(element.id))).toBe(false);

    const correlation = render("correlation").elements;
    expect(correlation.some((element) => element.type === "shape" && element.id === "core-correlation-hub")).toBe(true);
    expect(correlation.filter((element) => element.type === "shape" && /core-correlation-leaf-\d-shape/.test(element.id)).length).toBeGreaterThan(2);

    const matrix = render("matrix").elements;
    expect(matrix.filter((element) => element.type === "shape" && /core-matrix-matrix-/.test(element.id))).toHaveLength(4);
    expect(matrix.some((element) => element.type === "shape" && element.id === "core-matrix-axis-x-line")).toBe(true);
    expect(matrix.some((element) => element.type === "shape" && element.id === "core-matrix-axis-y-line")).toBe(true);

    const gantt = render("gantt").elements;
    expect(gantt.some((element) => element.type === "shape" && element.id === "core-gantt-gantt-head")).toBe(true);
    expect(gantt.filter((element) => element.type === "shape" && /core-gantt-bar-\d/.test(element.id)).length).toBeGreaterThan(2);
    expect(gantt.filter((element) => element.type === "shape" && /core-gantt-gantt-v-/.test(element.id)).length).toBeGreaterThan(2);
  });

  it("provides complete mode-aware schematic preset sets", () => {
    for (const [styleProfile, preset] of Object.entries(SCHEMATIC_STYLE_PRESETS)) {
      expect(schematicToneForStyleProfile(styleProfile)).toBe(preset.tone);
      expect(new Set(schematicKindsForStyleProfile(styleProfile))).toEqual(new Set(SCHEMATIC_KINDS));
      expect(preset.primaryKinds.every((kind) => preset.kinds.includes(kind))).toBe(true);
      expect(Object.keys(schematicTemplatesForStyleProfile(styleProfile)).sort()).toEqual([...SCHEMATIC_KINDS].sort());
    }
    expect(schematicToneForStyleProfile("unknown")).toBe("minimal");
    expect(Object.keys(SCHEMATIC_KIND_CATALOG).sort()).toEqual([...SCHEMATIC_KINDS].sort());
    expect(Object.keys(SCHEMATIC_MODE_TEMPLATES).sort()).toEqual(["minimal", "presentation", "report", "stylish", "technical"]);
  });

  it("renders every mode-specific schematic template", () => {
    for (const [styleProfile, templates] of Object.entries(SCHEMATIC_MODE_TEMPLATES)) {
      for (const template of Object.values(templates)) {
        const rendered = renderSchematicDiagram({
          kind: template.kind,
          title: template.titleJa,
          summary: template.summary,
          longDescription: template.longDescription,
          items: [...template.items],
          secondaryItems: [...(template.secondaryItems ?? [])],
          axisX: template.axisX,
          axisY: template.axisY,
          tone: template.tone
        });

        expect(rendered.svg).toContain("<svg");
        expect(rendered.svg).toContain(template.titleJa);
        expect(template.styleProfile).toBe(styleProfile);
        expect(rendered.svg).not.toContain("NaN");
      }
    }
  });

  it("keeps scale comparison radii finite for negative numeric labels", () => {
    const rendered = renderSchematicDiagram({
      kind: "scale-contrast",
      title: "Scale comparison",
      summary: "Scale comparison",
      longDescription: "This schematic verifies numeric scale values are clamped before radius calculation.",
      items: ["A", "B"],
      secondaryItems: ["-10", "20"],
      tone: "minimal"
    });

    expect(rendered.svg).not.toContain("NaN");
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

describe("diagram intent rendering", () => {
  it("renders the Enterprise Access Model as editable native elements with required granularity", () => {
    const rendered = renderDiagramIntent({
      kind: "access-plane-map",
      title: "Enterprise Access Model の意図した全体像",
      subtitle: "平面を分けるだけでなく、上位の制御面へ昇格できる経路を閉じる",
      summary: "Enterprise Access Model intended concept diagram",
      longDescription:
        "Enterprise Access Model showing control, management, data workload, user access, app access, and privileged access as protected paths with blocked upward escalation.",
      controlPlane: {
        label: "Control Plane",
        items: ["AD DS", "Microsoft Entra ID", "PKI", "Sync", "Federation", "Policy", "Conditional Access"]
      },
      managementPlane: { label: "Management Plane", items: ["Intune", "Defender", "admin tools", "monitoring", "IT operations"] },
      dataPlane: { label: "Data / Workload Plane", items: ["apps", "data", "Azure", "SaaS", "IaaS", "business systems"] },
      userAccess: { label: "User Access", sublabel: "社員 / 外部 / 顧客" },
      appAccess: { label: "App Access", sublabel: "API / 自動化 / 同意" },
      privilegedAccess: { label: "Privileged Access", sublabel: "管理 / 開発 / 運用 / break glass" },
      blockedEscalationLabel: "blocked upward escalation paths",
      designMessage: "下位の経路が上位の Control Plane を奪えないよう、特権経路を分離・承認・監視する"
    });

    expect(rendered.elements.every((element) => element.type === "shape" || element.type === "text")).toBe(true);
    expect(JSON.stringify(rendered)).not.toContain("\"svg\"");
    expect(JSON.stringify(rendered)).not.toContain("\"image\"");
    for (const required of ["Control Plane", "Management Plane", "Data / Workload Plane", "User Access", "App Access", "Privileged Access", "blocked upward escalation paths"]) {
      expect(JSON.stringify(rendered.elements)).toContain(required);
    }
  });

  it("renders a closed privileged path as two panels with concrete sources and approved steps", () => {
    const rendered = renderDiagramIntent({
      kind: "closed-privileged-path",
      title: "ゼロトラストで閉じた特権経路",
      subtitle: "管理面へ行く道を一本化し、他の道は閉じる",
      summary: "Zero Trust closed privileged path intended concept diagram",
      longDescription:
        "Comparison between uncontrolled privileged access and a closed zero trust privileged access path with identity, PAW, conditional access, PIM, admin interface, logging, and emergency access.",
      avoid: {
        title: "避けたい状態: 到達経路が多すぎる",
        description: "通常端末、共有管理者、汎用 VPN、直接 RDP、未管理端末が管理面へ届く。",
        sources: [
          { label: "通常端末", sublabel: "メール / Web" },
          { label: "共有管理者", sublabel: "例外運用" },
          { label: "汎用 VPN", sublabel: "管理面へ直行" },
          { label: "直接 RDP", sublabel: "未監視経路" }
        ],
        target: { label: "管理対象", sublabel: "AD / Entra / Azure" }
      },
      approved: {
        title: "目標状態: 承認済み経路だけ通す",
        description: "ID、端末、昇格、管理操作、監査が一つの制御列として連動する。",
        steps: [
          { label: "専用管理 ID", sublabel: "no mail" },
          { label: "PAW / SAW", sublabel: "compliant" },
          { label: "CA", sublabel: "verified" },
          { label: "PIM", sublabel: "JIT / approval" },
          { label: "Admin", sublabel: "interface" },
          { label: "Logs", sublabel: "SIEM" }
        ],
        denyLabel: "deny all other privileged paths"
      },
      designMessage: "検証、承認、昇格、監査、失効を一つの経路にして、例外は小さく監視する"
    });

    const texts = rendered.elements.filter((element) => element.type === "text").map((element) => element.text);
    expect(texts).toEqual(expect.arrayContaining(["通常端末\nメール / Web", "共有管理者\n例外運用", "PIM\nJIT / approval", "Admin\ninterface", "Logs\nSIEM"]));
    expect(texts.some((text) => text.includes("deny all other privileged paths"))).toBe(true);
    expect(rendered.elements.filter((element) => element.type === "shape" && element.shape === "line").length).toBeGreaterThanOrEqual(8);
  });

  it("does not draw closed-path connectors to missing approved steps", () => {
    const rendered = renderDiagramIntent({
      kind: "closed-privileged-path",
      title: "Short path",
      subtitle: "Only three approved steps",
      summary: "Short path",
      longDescription: "A short closed privileged path used to verify optional connector rendering.",
      avoid: {
        title: "Avoid",
        description: "Too many paths.",
        sources: [{ label: "端末" }, { label: "VPN" }],
        target: { label: "管理対象" }
      },
      approved: {
        title: "Approved",
        description: "Only three controls.",
        steps: [{ label: "ID" }, { label: "PAW" }, { label: "CA" }],
        denyLabel: "deny all others"
      },
      designMessage: "Keep only approved paths."
    });

    const ids = rendered.elements.map((element) => element.id).join(" ");
    expect(ids).toContain("diagram-intent-approved-0-1");
    expect(ids).toContain("diagram-intent-approved-1-2");
    expect(ids).not.toContain("diagram-intent-approved-2-3");
    expect(ids).not.toContain("diagram-intent-approved-3-4");
  });

  it("handles maximum avoid sources without zero-length connector artifacts", () => {
    const rendered = renderDiagramIntent({
      kind: "closed-privileged-path",
      title: "Max avoid paths",
      subtitle: "Six denied sources",
      summary: "Max avoid sources",
      longDescription: "A closed privileged path with the maximum avoid source count to verify connector routing.",
      avoid: {
        title: "Avoid",
        description: "Too many paths.",
        sources: [{ label: "端末" }, { label: "共有管理者" }, { label: "VPN" }, { label: "RDP" }, { label: "未管理端末" }, { label: "例外" }],
        target: { label: "管理対象" }
      },
      approved: {
        title: "Approved",
        description: "Approved controls.",
        steps: [{ label: "ID" }, { label: "PAW" }, { label: "CA" }, { label: "PIM" }, { label: "Admin" }, { label: "Logs" }],
        denyLabel: "deny all others"
      },
      designMessage: "Keep only approved paths."
    });

    const lines = rendered.elements.filter((element) => element.type === "shape" && element.shape === "line");
    const sourceCards = rendered.elements.filter(
      (element) => element.type === "shape" && element.shape === "roundRect" && /avoid-source-\d-card$/u.test(element.id)
    );
    expect(lines.every((line) => line.w >= 0.001 || line.h >= 0.001)).toBe(true);
    for (let i = 0; i < sourceCards.length; i += 1) {
      for (let j = i + 1; j < sourceCards.length; j += 1) {
        expect(overlaps(sourceCards[i], sourceCards[j])).toBe(false);
      }
    }
  });

  it("rejects unsupported seven-step closed privileged paths", () => {
    expect(() =>
      renderDiagramIntent({
        kind: "closed-privileged-path",
        title: "Too many steps",
        subtitle: "Seven steps",
        summary: "Too many approved steps",
        longDescription: "This intent intentionally exceeds the approved path layout capacity.",
        avoid: {
          title: "Avoid",
          description: "Too many paths.",
          sources: [{ label: "端末" }, { label: "VPN" }],
          target: { label: "管理対象" }
        },
        approved: {
          title: "Approved",
          description: "Too many controls.",
          steps: [{ label: "1" }, { label: "2" }, { label: "3" }, { label: "4" }, { label: "5" }, { label: "6" }, { label: "7" }],
          denyLabel: "deny all others"
        },
        designMessage: "Keep only approved paths."
      })
    ).toThrow();
  });

  it("emits only horizontal or vertical native lines for Diagram Intent", () => {
    const rendered = renderDiagramIntent({
      kind: "access-plane-map",
      title: "Access",
      subtitle: "Intent",
      summary: "Access map",
      longDescription: "Access map line safety test with all required planes and paths included.",
      controlPlane: { label: "Control Plane", items: ["AD", "Entra"] },
      managementPlane: { label: "Management Plane", items: ["Intune"] },
      dataPlane: { label: "Data Plane", items: ["Apps"] },
      userAccess: { label: "User Access" },
      appAccess: { label: "App Access" },
      privilegedAccess: { label: "Privileged Access" },
      designMessage: "Protected privileged paths"
    });

    const lines = rendered.elements.filter((element) => element.type === "shape" && element.shape === "line");
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => line.w <= 0.01 || line.h <= 0.01)).toBe(true);
  });

  it("keeps diagram intent elements inside the requested frame", () => {
    const frame = { x: 0.7, y: 0.8, w: 11.9, h: 5.9 };
    const rendered = renderDiagramIntent(
      {
        kind: "access-plane-map",
        title: "Access",
        subtitle: "Intent",
        summary: "Access map",
        longDescription: "Access map frame test with all required planes and paths included.",
        controlPlane: { label: "Control Plane", items: ["AD", "Entra"] },
        managementPlane: { label: "Management Plane", items: ["Intune"] },
        dataPlane: { label: "Data Plane", items: ["Apps"] },
        userAccess: { label: "User Access" },
        appAccess: { label: "App Access" },
        privilegedAccess: { label: "Privileged Access" },
        designMessage: "Protected privileged paths"
      },
      { frame }
    );

    for (const element of rendered.elements) {
      expect(element.x).toBeGreaterThanOrEqual(frame.x - 0.001);
      expect(element.y).toBeGreaterThanOrEqual(frame.y - 0.001);
      expect(element.x + element.w).toBeLessThanOrEqual(frame.x + frame.w + 0.001);
      expect(element.y + element.h).toBeLessThanOrEqual(frame.y + frame.h + 0.001);
    }
  });

  it("renders a lifecycle as numbered stage cards with a continuous-improvement loop", () => {
    const rendered = renderDiagramIntent({
      kind: "lifecycle",
      title: "ID ライフサイクル",
      subtitle: "入社から退職まで一貫管理",
      summary: "Identity lifecycle",
      longDescription: "Identity lifecycle stages from join to leave handled as one continuous governance loop.",
      stages: [
        { label: "参加", sublabel: "Joiner" },
        { label: "異動", sublabel: "Mover" },
        { label: "退職", sublabel: "Leaver" },
        { label: "棚卸し", sublabel: "Review" }
      ],
      loopLabel: "継続的なアクセスレビュー",
      designMessage: "ライフサイクル全体を自動化と証跡で閉じる"
    });

    const texts = rendered.elements.filter((element) => element.type === "text");
    expect(texts.some((element) => element.type === "text" && element.text === "1")).toBe(true);
    expect(texts.some((element) => element.type === "text" && element.text === "4")).toBe(true);
    expect(texts.some((element) => element.type === "text" && element.text === "継続的なアクセスレビュー")).toBe(true);
    const lines = rendered.elements.filter((element) => element.type === "shape" && element.shape === "line");
    expect(lines.length).toBeGreaterThanOrEqual(3 + 3);
  });

  it("renders a maturity ladder with ascending levels and Lv badges", () => {
    const rendered = renderDiagramIntent({
      kind: "maturity-ladder",
      title: "ガバナンス成熟度",
      subtitle: "段階的に高度化する",
      summary: "Governance maturity",
      longDescription: "Governance maturity climbs from manual handling to fully automated assured operations.",
      levels: [
        { label: "手動", description: "属人的な運用" },
        { label: "標準化", description: "ポリシー整備" },
        { label: "自動化", description: "アクセスレビュー自動化" }
      ],
      axisLabel: "成熟度",
      designMessage: "上位レベルほど自動化と保証が進む"
    });

    const findCard = (token: string) =>
      rendered.elements.find((element) => element.type === "shape" && element.id.endsWith(token)) as
        | { y: number }
        | undefined;
    const first = findCard("level-0-card");
    const last = findCard("level-2-card");
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    expect((last as { y: number }).y).toBeLessThan((first as { y: number }).y);
    const texts = rendered.elements.filter((element) => element.type === "text");
    expect(texts.some((element) => element.type === "text" && element.text === "Lv.1")).toBe(true);
    expect(texts.some((element) => element.type === "text" && element.text === "Lv.3")).toBe(true);
  });

  it("renders before/after panels with a transition arrow", () => {
    const rendered = renderDiagramIntent({
      kind: "before-after",
      title: "移行の効果",
      subtitle: "現状から目標へ",
      summary: "Before and after",
      longDescription: "Before and after comparison of manual access management versus automated governance.",
      before: { title: "現状", points: ["手動申請", "棚卸しが属人的", "証跡が分散"] },
      after: { title: "目標", points: ["自動承認", "定期レビュー", "一元的な監査証跡"] },
      transitionLabel: "自動化",
      designMessage: "手動運用から保証された自動運用へ"
    });

    const texts = rendered.elements.filter((element) => element.type === "text");
    expect(texts.some((element) => element.type === "text" && element.text === "現状")).toBe(true);
    expect(texts.some((element) => element.type === "text" && element.text === "目標")).toBe(true);
    expect(texts.some((element) => element.type === "text" && element.text === "自動化")).toBe(true);
    const lines = rendered.elements.filter((element) => element.type === "shape" && element.shape === "line");
    expect(lines.length).toBeGreaterThan(0);
  });

  it("renders a relationship map as a hub with connected nodes", () => {
    const rendered = renderDiagramIntent({
      kind: "relationship-map",
      title: "ガバナンス関係図",
      subtitle: "中核と関係者",
      summary: "Governance relationship map",
      longDescription: "Hub and spoke relationship map between the governance core and surrounding stakeholders.",
      center: { label: "ID ガバナンス", sublabel: "中核機能" },
      nodes: [
        { label: "アクセスレビュー", relationship: "定期確認" },
        { label: "資格管理", relationship: "付与/失効" },
        { label: "ライフサイクル", relationship: "自動化" },
        { label: "監査", relationship: "証跡提供" }
      ],
      designMessage: "中核機能が各関係者をつなぐ"
    });

    const texts = rendered.elements.filter((element) => element.type === "text");
    expect(texts.some((element) => element.type === "text" && element.text === "ID ガバナンス")).toBe(true);
    expect(texts.some((element) => element.type === "text" && element.text === "アクセスレビュー")).toBe(true);
    const lines = rendered.elements.filter((element) => element.type === "shape" && element.shape === "line");
    expect(lines.length).toBeGreaterThan(0);
  });

  it("keeps all expanded diagram intent presets inside a custom frame", () => {
    const frame = { x: 0.7, y: 0.8, w: 11.9, h: 5.9 };
    const intents = [
      {
        kind: "lifecycle" as const,
        title: "L",
        subtitle: "S",
        summary: "lifecycle",
        longDescription: "Lifecycle bounds test with enough stages to fill the row inside the frame.",
        stages: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }, { label: "E" }, { label: "F" }],
        designMessage: "loop"
      },
      {
        kind: "maturity-ladder" as const,
        title: "M",
        subtitle: "S",
        summary: "maturity",
        longDescription: "Maturity bounds test with the maximum number of ascending levels inside the frame.",
        levels: [{ label: "1" }, { label: "2" }, { label: "3" }, { label: "4" }, { label: "5" }],
        designMessage: "rise"
      },
      {
        kind: "before-after" as const,
        title: "B",
        subtitle: "S",
        summary: "before-after",
        longDescription: "Before after bounds test with the maximum number of points in each panel inside the frame.",
        before: { title: "Before", points: ["1", "2", "3", "4", "5", "6"] },
        after: { title: "After", points: ["1", "2", "3", "4", "5", "6"] },
        designMessage: "shift"
      },
      {
        kind: "relationship-map" as const,
        title: "R",
        subtitle: "S",
        summary: "relationship",
        longDescription: "Relationship bounds test with the maximum number of nodes around the hub inside the frame.",
        center: { label: "Hub" },
        nodes: [
          { label: "1" },
          { label: "2" },
          { label: "3" },
          { label: "4" },
          { label: "5" },
          { label: "6" }
        ],
        designMessage: "connect"
      }
    ];

    for (const intent of intents) {
      const rendered = renderDiagramIntent(intent, { frame });
      for (const element of rendered.elements) {
        expect(element.x).toBeGreaterThanOrEqual(frame.x - 0.001);
        expect(element.y).toBeGreaterThanOrEqual(frame.y - 0.001);
        expect(element.x + element.w).toBeLessThanOrEqual(frame.x + frame.w + 0.001);
        expect(element.y + element.h).toBeLessThanOrEqual(frame.y + frame.h + 0.001);
      }
    }
  });
});
