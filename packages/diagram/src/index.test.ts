import { describe, expect, it } from "vitest";
import { renderNativePonchiDiagram, renderPonchiDiagram, renderSchematicDiagram } from "./index.js";

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
