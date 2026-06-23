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
