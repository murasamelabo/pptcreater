import { describe, expect, it } from "vitest";
import { applyPptxSlideNodeOperations, type PptxSlideNodeGroup } from "./pptxSlideNodes.js";

function box(id: number, x: number, y: number, cx: number, cy: number, prst: string): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`;
}

function label(id: number, x: number, y: number, cx: number, cy: number, text: string): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr/><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
}

function line(id: number, x: number, y: number, cx: number, cy: number): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Line ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom></p:spPr></p:sp>`;
}

// Axis-x group: two children A (x=1000) and B (x=4000), width 2000, gap 1000.
// bus horizontal at y=4500 spanning centers 2000..5000; drops at 2000 and 5000;
// parent connector at the bus center x=3500.
function buildRowGroup(): string {
  return [
    box(2, 1000, 5000, 2000, 600, "roundRect"),
    label(3, 1000, 5000, 2000, 600, "A"),
    box(4, 4000, 5000, 2000, 600, "roundRect"),
    label(5, 4000, 5000, 2000, 600, "B"),
    line(6, 3500, 4000, 0, 500), // parent connector -> bus
    line(7, 2000, 4500, 3000, 0), // bus
    line(8, 2000, 4500, 0, 500), // drop A
    line(9, 5000, 4500, 0, 500) // drop B
  ].join("");
}

const rowGroup: PptxSlideNodeGroup = { id: "g", axis: "x", members: ["A", "B"], minBoxEmu: 100 };

function boxes(xml: string): Array<{ x: number; cx: number }> {
  const result: Array<{ x: number; cx: number }> = [];
  const re = /<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(-?\d+)" cy="(-?\d+)"\/><\/a:xfrm><a:prstGeom prst="roundRect"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    result.push({ x: Number(m[1]), cx: Number(m[3]) });
  }
  return result;
}

function lineCount(xml: string): number {
  return (xml.match(/prst="line"/g) ?? []).length;
}

describe("applyPptxSlideNodeOperations", () => {
  it("returns input unchanged without groups or operations", () => {
    const xml = buildRowGroup();
    expect(applyPptxSlideNodeOperations(xml, undefined, [{ op: "remove", target: "A" }])).toBe(xml);
    expect(applyPptxSlideNodeOperations(xml, [rowGroup], undefined)).toBe(xml);
  });

  it("removes a node and re-centers the single remaining sibling", () => {
    const xml = buildRowGroup();
    const out = applyPptxSlideNodeOperations(xml, [rowGroup], [{ op: "remove", target: "B" }]);
    expect(out).toContain("<a:t>A</a:t>");
    expect(out).not.toContain("<a:t>B</a:t>");
    const remaining = boxes(out);
    expect(remaining).toHaveLength(1);
    // Single child centered in the original footprint (1000..6000 -> center 3500), original width 2000.
    expect(remaining[0].cx).toBe(2000);
    expect(remaining[0].x).toBe(2500);
    // Bus removed; only the parent connector + the single drop remain.
    expect(lineCount(out)).toBe(2);
  });

  it("adds a cloned node and fits all siblings within the original footprint", () => {
    const xml = buildRowGroup();
    const out = applyPptxSlideNodeOperations(xml, [rowGroup], [
      { op: "add", group: "g", cloneFrom: "A", label: "C" }
    ]);
    expect(out).toContain("<a:t>A</a:t>");
    expect(out).toContain("<a:t>B</a:t>");
    expect(out).toContain("<a:t>C</a:t>");
    const all = boxes(out);
    expect(all).toHaveLength(3);
    // All boxes stay inside the original footprint [1000, 6000].
    for (const b of all) {
      expect(b.x).toBeGreaterThanOrEqual(1000 - 2);
      expect(b.x + b.cx).toBeLessThanOrEqual(6000 + 2);
    }
    // Three boxes + two gaps fit the span, so each box is narrower than the original 2000.
    expect(all.every((b) => b.cx < 2000)).toBe(true);
    // Each child keeps a drop, plus the bus and parent connector.
    expect(lineCount(out)).toBe(5);
  });

  it("leaves the slide untouched when the structure contains group shapes", () => {
    const xml = `<p:grpSp>${buildRowGroup()}</p:grpSp>`;
    expect(applyPptxSlideNodeOperations(xml, [rowGroup], [{ op: "remove", target: "A" }])).toBe(xml);
  });

  it("ignores operations that reference unknown members or groups", () => {
    const xml = buildRowGroup();
    expect(applyPptxSlideNodeOperations(xml, [rowGroup], [{ op: "remove", target: "Z" }])).toBe(xml);
    expect(
      applyPptxSlideNodeOperations(xml, [rowGroup], [{ op: "add", group: "missing", label: "X" }])
    ).toBe(xml);
  });
});

// ── Generic cluster engine (linear-x) ──────────────────────────────────────
// Each node is a card cluster: a roundRect frame + a title label + a numeric badge,
// all sharing the frame's band. A rightArrow sits in the gap between cards.
// Coordinates are realistic EMU (millions) so the engine's positional tolerance
// (a few thousand EMU) does not blur small synthetic geometry.
function card(baseId: number, x: number, title: string, badge: string): string {
  return [
    box(baseId, x, 3000000, 2000000, 1500000, "roundRect"), // frame
    label(baseId + 1, x + 200000, 3500000, 1600000, 400000, title), // title (anchor)
    label(baseId + 2, x + 100000, 3100000, 400000, 400000, badge) // numeric badge
  ].join("");
}

function buildClusterRow(): string {
  return [
    card(2, 1000000, "A", "1"),
    card(5, 4000000, "B", "2"),
    // arrow in the gap between A (ends 3000000) and B (starts 4000000), center x=3500000.
    box(8, 3200000, 3600000, 600000, 400000, "rightArrow")
  ].join("");
}

const clusterGroup: PptxSlideNodeGroup = {
  id: "c",
  axis: "x",
  layout: "linear-x",
  connectorBetween: true,
  renumber: true,
  members: ["A", "B"],
  minBoxEmu: 100
};

function frames(xml: string): Array<{ x: number; cx: number }> {
  return boxes(xml);
}
function badges(xml: string): string[] {
  // badge labels are the numeric <a:t> values
  return [...xml.matchAll(/<a:t>(\d{1,2})<\/a:t>/g)].map((m) => m[1]);
}
function arrowCount(xml: string): number {
  return (xml.match(/prst="rightArrow"/g) ?? []).length;
}

describe("applyPptxSlideNodeOperations (cluster engine)", () => {
  it("adds a cloned cluster, fits all within the footprint, renumbers, and regenerates arrows", () => {
    const xml = buildClusterRow();
    const out = applyPptxSlideNodeOperations(xml, [clusterGroup], [
      { op: "add", group: "c", cloneFrom: "A", label: "C", at: 2 }
    ]);
    expect(out).toContain("<a:t>A</a:t>");
    expect(out).toContain("<a:t>B</a:t>");
    expect(out).toContain("<a:t>C</a:t>");
    const f = frames(out);
    expect(f).toHaveLength(3);
    // All frames stay inside the original footprint [1000000, 6000000].
    for (const b of f) {
      expect(b.x).toBeGreaterThanOrEqual(1000000 - 2000);
      expect(b.x + b.cx).toBeLessThanOrEqual(6000000 + 2000);
    }
    // Badges renumbered 1,2,3 in visual order.
    expect(badges(out).sort()).toEqual(["1", "2", "3"]);
    // Two gaps → two regenerated arrows.
    expect(arrowCount(out)).toBe(2);
  });

  it("removes a cluster (all its shapes) and regenerates a single-card layout", () => {
    const xml = buildClusterRow();
    const out = applyPptxSlideNodeOperations(xml, [clusterGroup], [{ op: "remove", target: "B" }]);
    expect(out).toContain("<a:t>A</a:t>");
    expect(out).not.toContain("<a:t>B</a:t>");
    expect(frames(out)).toHaveLength(1);
    // Single card → no between arrows.
    expect(arrowCount(out)).toBe(0);
    // Remaining badge keeps "1".
    expect(badges(out)).toEqual(["1"]);
  });

  it("clones the full cluster (frame + title + badge), not just the title", () => {
    const xml = buildClusterRow();
    const out = applyPptxSlideNodeOperations(xml, [clusterGroup], [
      { op: "add", group: "c", cloneFrom: "A", label: "C" }
    ]);
    // 3 frames (cards), 3 titles, 3 badges after the clone.
    expect(frames(out)).toHaveLength(3);
    expect((out.match(/<a:t>[A-C]<\/a:t>/g) ?? []).length).toBe(3);
    expect(badges(out)).toHaveLength(3);
  });
});

