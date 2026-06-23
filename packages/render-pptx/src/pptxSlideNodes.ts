export interface PptxSlideNodeGroup {
  id: string;
  axis: "x" | "y";
  layout?: "tree" | "linear-x" | "linear-y" | "staircase-x" | "radial";
  parentText?: string;
  members: string[];
  connectorBetween?: boolean;
  renumber?: boolean;
  minBoxEmu?: number;
}

export type PptxSlideNodeOperation =
  | { op: "remove"; target: string }
  | { op: "add"; group: string; label: string; cloneFrom?: string; at?: number };

const TOL = 4000;
const DEFAULT_MIN_BOX_EMU = 228600; // ~0.25 inch — only a hard floor; fit-to-footprint dominates

interface ShapeBlock {
  raw: string;
  tag: string;
  prst: string;
  off: { x: number; y: number };
  ext: { cx: number; cy: number };
  text: string;
  removed: boolean;
}

interface Endpoint {
  x: number;
  y: number;
}

function readInt(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseShapeBlock(raw: string, tag: string): ShapeBlock {
  const prst = (/<a:prstGeom\b[^>]*prst="([^"]+)"/.exec(raw) || [])[1] ?? "";
  const off = /<a:off\b[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"/.exec(raw);
  const ext = /<a:ext\b[^>]*cx="(-?\d+)"[^>]*cy="(-?\d+)"/.exec(raw);
  const text = [...raw.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXmlText(m[1])).join("");
  return {
    raw,
    tag,
    prst,
    off: { x: readInt(off?.[1]), y: readInt(off?.[2]) },
    ext: { cx: readInt(ext?.[1]), cy: readInt(ext?.[2]) },
    text,
    removed: false
  };
}

/**
 * Splits the spTree children string into top-level shape blocks. Returns null when the
 * structure contains group shapes or graphic frames (nested shape trees that the simple
 * tokenizer cannot safely edit), signalling callers to skip node operations.
 */
function tokenizeShapes(children: string): ShapeBlock[] | null {
  if (/<p:(grpSp|graphicFrame)\b/.test(children)) {
    return null;
  }
  const blocks: ShapeBlock[] = [];
  const re = /<p:(sp|cxnSp|pic)\b[\s\S]*?<\/p:\1>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(children))) {
    const between = children.slice(lastIndex, match.index);
    if (between.trim().length > 0) {
      blocks.push({ raw: between, tag: "", prst: "", off: { x: 0, y: 0 }, ext: { cx: 0, cy: 0 }, text: "", removed: false });
    }
    blocks.push(parseShapeBlock(match[0], match[1]));
    lastIndex = re.lastIndex;
  }
  const tail = children.slice(lastIndex);
  if (tail.trim().length > 0) {
    blocks.push({ raw: tail, tag: "", prst: "", off: { x: 0, y: 0 }, ext: { cx: 0, cy: 0 }, text: "", removed: false });
  }
  return blocks;
}

function setOff(raw: string, x: number, y: number): string {
  return raw.replace(/<a:off\b[^>]*\/>/, `<a:off x="${Math.round(x)}" y="${Math.round(y)}"/>`);
}

function setExt(raw: string, cx: number, cy: number): string {
  return raw.replace(/<a:ext\b[^>]*\/>/, `<a:ext cx="${Math.round(cx)}" cy="${Math.round(cy)}"/>`);
}

function setBlockGeometry(block: ShapeBlock, x: number, y: number, cx: number, cy: number): void {
  block.raw = setExt(setOff(block.raw, x, y), cx, cy);
  block.off = { x, y };
  block.ext = { cx, cy };
}

function setLabelText(raw: string, label: string): string {
  let replaced = false;
  return raw.replace(/<a:t>[\s\S]*?<\/a:t>/g, () => {
    if (replaced) {
      return "<a:t></a:t>";
    }
    replaced = true;
    return `<a:t>${escapeXmlText(label)}</a:t>`;
  });
}

function isLine(block: ShapeBlock): boolean {
  return block.prst === "line" || block.tag === "cxnSp";
}

function lineEndpoints(block: ShapeBlock): [Endpoint, Endpoint] {
  return [
    { x: block.off.x, y: block.off.y },
    { x: block.off.x + block.ext.cx, y: block.off.y + block.ext.cy }
  ];
}

function near(a: number, b: number, tol = TOL): boolean {
  return Math.abs(a - b) <= tol;
}

function pointNear(p: Endpoint, x: number, y: number, tol = TOL): boolean {
  return near(p.x, x, tol) && near(p.y, y, tol);
}

interface MemberNode {
  text: string;
  box: ShapeBlock;
  label: ShapeBlock;
  drop?: ShapeBlock;
}

interface ResolvedGroup {
  axis: "x" | "y";
  members: MemberNode[];
  bus?: ShapeBlock;
  parentConnector?: ShapeBlock;
  minBox: number;
  footStart: number;
  footEnd: number;
  gap: number;
  boxLen: number;
  crossOff: number;
  crossLen: number;
}

function findLabelByText(blocks: ShapeBlock[], text: string): ShapeBlock | undefined {
  return blocks.find((b) => !b.removed && b.tag === "sp" && b.prst !== "line" && b.text === text);
}

function findBoxForLabel(blocks: ShapeBlock[], label: ShapeBlock): ShapeBlock | undefined {
  return blocks.find(
    (b) =>
      !b.removed &&
      b !== label &&
      b.tag === "sp" &&
      b.prst !== "line" &&
      b.prst !== "" &&
      near(b.off.x, label.off.x, 2000) &&
      near(b.off.y, label.off.y, 2000) &&
      near(b.ext.cx, label.ext.cx, 2000) &&
      near(b.ext.cy, label.ext.cy, 2000)
  );
}

function boxParentSideCenter(box: ShapeBlock, axis: "x" | "y"): Endpoint {
  if (axis === "x") {
    return { x: box.off.x + box.ext.cx / 2, y: box.off.y };
  }
  return { x: box.off.x, y: box.off.y + box.ext.cy / 2 };
}

function findDropForBox(blocks: ShapeBlock[], box: ShapeBlock, axis: "x" | "y"): ShapeBlock | undefined {
  const center = boxParentSideCenter(box, axis);
  return blocks.find((b) => {
    if (b.removed || !isLine(b)) return false;
    const [a, c] = lineEndpoints(b);
    return pointNear(a, center.x, center.y) || pointNear(c, center.x, center.y);
  });
}

function findBus(blocks: ShapeBlock[], members: MemberNode[], axis: "x" | "y"): ShapeBlock | undefined {
  const drops = members.map((m) => m.drop).filter((d): d is ShapeBlock => Boolean(d));
  if (drops.length === 0) return undefined;
  // The bus is the perpendicular line that the drop's far endpoint sits on.
  const busPoints: Endpoint[] = [];
  for (const drop of drops) {
    const [a, c] = lineEndpoints(drop);
    // far endpoint = the one NOT at the box parent-side center
    busPoints.push(a, c);
  }
  return blocks.find((b) => {
    if (b.removed || !isLine(b) || members.some((m) => m.drop === b)) return false;
    const [a, c] = lineEndpoints(b);
    if (axis === "x") {
      if (Math.abs(b.ext.cy) > TOL) return false; // bus must be horizontal
    } else if (Math.abs(b.ext.cx) > TOL) {
      return false; // bus must be vertical
    }
    return busPoints.some((p) => pointNear(p, a.x, a.y) || pointNear(p, c.x, c.y));
  });
}

function findParentConnector(blocks: ShapeBlock[], bus: ShapeBlock | undefined, axis: "x" | "y", used: Set<ShapeBlock>): ShapeBlock | undefined {
  if (!bus) return undefined;
  const [a, c] = lineEndpoints(bus);
  const busCenter: Endpoint = axis === "x"
    ? { x: (a.x + c.x) / 2, y: a.y }
    : { x: a.x, y: (a.y + c.y) / 2 };
  return blocks.find((b) => {
    if (b.removed || !isLine(b) || used.has(b) || b === bus) return false;
    const [p, q] = lineEndpoints(b);
    return pointNear(p, busCenter.x, busCenter.y) || pointNear(q, busCenter.x, busCenter.y);
  });
}

function resolveGroup(blocks: ShapeBlock[], group: PptxSlideNodeGroup): ResolvedGroup | undefined {
  const members: MemberNode[] = [];
  for (const text of group.members) {
    const label = findLabelByText(blocks, text);
    if (!label) return undefined;
    const box = findBoxForLabel(blocks, label);
    if (!box) return undefined;
    members.push({ text, box, label });
  }
  for (const member of members) {
    member.drop = findDropForBox(blocks, member.box, group.axis);
  }
  const bus = findBus(blocks, members, group.axis);
  const used = new Set<ShapeBlock>();
  for (const member of members) {
    if (member.drop) used.add(member.drop);
  }
  if (bus) used.add(bus);
  const parentConnector = findParentConnector(blocks, bus, group.axis, used);

  const along = (b: ShapeBlock) => (group.axis === "x" ? b.off.x : b.off.y);
  const lenOf = (b: ShapeBlock) => (group.axis === "x" ? b.ext.cx : b.ext.cy);
  const sorted = [...members].sort((a, b) => along(a.box) - along(b.box));
  const footStart = Math.min(...members.map((m) => along(m.box)));
  const footEnd = Math.max(...members.map((m) => along(m.box) + lenOf(m.box)));
  const boxLen = lenOf(sorted[0].box);
  let gap = 0;
  if (sorted.length >= 2) {
    gap = along(sorted[1].box) - (along(sorted[0].box) + lenOf(sorted[0].box));
  }
  if (gap <= 0) gap = Math.round((footEnd - footStart) * 0.08);
  const crossOff = group.axis === "x" ? members[0].box.off.y : members[0].box.off.x;
  const crossLen = group.axis === "x" ? members[0].box.ext.cy : members[0].box.ext.cx;

  return {
    axis: group.axis,
    members,
    bus,
    parentConnector,
    minBox: group.minBoxEmu ?? DEFAULT_MIN_BOX_EMU,
    footStart,
    footEnd,
    gap,
    boxLen,
    crossOff,
    crossLen
  };
}

function cloneBlock(source: ShapeBlock): ShapeBlock {
  return {
    raw: source.raw,
    tag: source.tag,
    prst: source.prst,
    off: { ...source.off },
    ext: { ...source.ext },
    text: source.text,
    removed: false
  };
}

function relayoutGroup(resolved: ResolvedGroup): void {
  const { axis, members } = resolved;
  const active = members.filter((m) => !m.box.removed);
  if (active.length === 0) {
    if (resolved.bus) resolved.bus.removed = true;
    if (resolved.parentConnector) resolved.parentConnector.removed = true;
    for (const m of members) {
      if (m.drop) m.drop.removed = true;
    }
    return;
  }

  const { footStart, footEnd, crossOff, crossLen } = resolved;
  const span = footEnd - footStart;
  const n = active.length;

  // Single child: center one original-width box, drop the bus, stretch the parent connector.
  if (n === 1) {
    const only = active[0];
    const center = footStart + span / 2;
    const boxLen = Math.min(resolved.boxLen, span);
    const start = center - boxLen / 2;
    if (axis === "x") {
      setBlockGeometry(only.box, start, crossOff, boxLen, crossLen);
      setBlockGeometry(only.label, start, crossOff, boxLen, crossLen);
    } else {
      setBlockGeometry(only.box, crossOff, start, crossLen, boxLen);
      setBlockGeometry(only.label, crossOff, start, crossLen, boxLen);
    }
    if (resolved.bus) resolved.bus.removed = true;
    for (const m of members) {
      if (m.drop && m !== only) m.drop.removed = true;
    }
    if (only.drop) {
      if (axis === "x") {
        setBlockGeometry(only.drop, center, only.drop.off.y, 0, only.drop.ext.cy);
      } else {
        setBlockGeometry(only.drop, only.drop.off.x, center, only.drop.ext.cx, 0);
      }
    }
    if (resolved.parentConnector) {
      const pc = resolved.parentConnector;
      if (axis === "x") {
        setBlockGeometry(pc, center, pc.off.y, 0, pc.ext.cy);
      } else {
        setBlockGeometry(pc, pc.off.x, center, pc.ext.cx, 0);
      }
    }
    return;
  }

  // Fit N boxes within the original footprint, preserving the original gap:box ratio so
  // boxes and gaps shrink/grow together. minBox is only a hard floor.
  const gapRatio = resolved.boxLen > 0 ? resolved.gap / resolved.boxLen : 0.1;
  let boxLen = span / (n + (n - 1) * gapRatio);
  let gap = boxLen * gapRatio;
  if (boxLen < resolved.minBox) {
    boxLen = resolved.minBox;
    gap = (span - n * boxLen) / (n - 1);
    if (gap < 0) gap = Math.round(boxLen * 0.06); // last resort: minor overflow over overlap
  }

  let cursor = footStart;
  const centers: number[] = [];
  for (const member of active) {
    if (axis === "x") {
      setBlockGeometry(member.box, cursor, crossOff, boxLen, crossLen);
      setBlockGeometry(member.label, cursor, crossOff, boxLen, crossLen);
    } else {
      setBlockGeometry(member.box, crossOff, cursor, crossLen, boxLen);
      setBlockGeometry(member.label, crossOff, cursor, crossLen, boxLen);
    }
    centers.push(cursor + boxLen / 2);
    cursor += boxLen + gap;
  }

  active.forEach((member, index) => {
    if (!member.drop) return;
    const center = centers[index];
    if (axis === "x") {
      setBlockGeometry(member.drop, center, member.drop.off.y, 0, member.drop.ext.cy);
    } else {
      setBlockGeometry(member.drop, member.drop.off.x, center, member.drop.ext.cx, 0);
    }
  });

  for (const member of members) {
    if (member.box.removed && member.drop) member.drop.removed = true;
  }

  if (resolved.bus) {
    const first = centers[0];
    const last = centers[centers.length - 1];
    if (axis === "x") {
      setBlockGeometry(resolved.bus, first, resolved.bus.off.y, last - first, 0);
    } else {
      setBlockGeometry(resolved.bus, resolved.bus.off.x, first, 0, last - first);
    }
  }
}

/* ----------------------------------------------------------------------------
 * Generic cluster engine (linear-x, linear-y, staircase-x, radial)
 *
 * A "cluster" is a member's full visual unit: a frame shape (the card/panel/bar
 * background) plus every shape whose center falls inside that frame (number badge,
 * title, caption, accent bar, …). Clusters are repositioned along an axis; "between"
 * connectors (arrows/chevrons that sit in the gaps) are regenerated per gap. This
 * lets non-tree figures (flow, list, step, gantt, cycle, …) gain add/remove support
 * without bespoke code per figure.
 * -------------------------------------------------------------------------- */

const CANVAS_W = 12192000;
const CANVAS_H = 6858000;

type ClusterLayout = "linear-x" | "linear-y" | "staircase-x" | "radial";

interface Cluster {
  text: string;
  anchor: ShapeBlock;
  frame: ShapeBlock;
  shapes: ShapeBlock[];
  removed: boolean;
  oFrameStart: number;
  oFrameLen: number;
  oFrameCrossStart: number;
  oFrameCrossLen: number;
  oCenterX: number;
  oCenterY: number;
}

interface ResolvedClusterGroup {
  kind: "cluster";
  layout: ClusterLayout;
  axis: "x" | "y";
  renumber: boolean;
  clusters: Cluster[];
  betweens: ShapeBlock[];
  bus?: ShapeBlock;
  regenerated: ShapeBlock[];
  footStart: number;
  footEnd: number;
  gap: number;
  clusterLen: number;
  baseline: number;
  hMin: number;
  hMax: number;
  center: Endpoint;
  radius: number;
  startAngle: number;
}

function shapeArea(b: ShapeBlock): number {
  return Math.abs(b.ext.cx) * Math.abs(b.ext.cy);
}

function shapeCenter(b: ShapeBlock): Endpoint {
  return { x: b.off.x + b.ext.cx / 2, y: b.off.y + b.ext.cy / 2 };
}

function frameContainsCenter(frame: ShapeBlock, shape: ShapeBlock): boolean {
  const c = shapeCenter(shape);
  return (
    c.x >= frame.off.x - TOL &&
    c.x <= frame.off.x + frame.ext.cx + TOL &&
    c.y >= frame.off.y - TOL &&
    c.y <= frame.off.y + frame.ext.cy + TOL
  );
}

function isArrowLike(b: ShapeBlock): boolean {
  return /arrow|chevron/i.test(b.prst);
}

function findClusterFrame(blocks: ShapeBlock[], anchor: ShapeBlock): ShapeBlock {
  const aCenter = shapeCenter(anchor);
  const anchorArea = shapeArea(anchor);
  const candidates = blocks.filter(
    (b) =>
      !b.removed &&
      b !== anchor &&
      b.tag === "sp" &&
      shapeArea(b) >= anchorArea &&
      aCenter.x >= b.off.x - TOL &&
      aCenter.x <= b.off.x + b.ext.cx + TOL &&
      aCenter.y >= b.off.y - TOL &&
      aCenter.y <= b.off.y + b.ext.cy + TOL
  );
  // Largest containing shape = the card/panel; fall back to the anchor itself.
  candidates.sort((a, b) => shapeArea(b) - shapeArea(a));
  return candidates[0] ?? anchor;
}

function resolveClusterGroup(blocks: ShapeBlock[], group: PptxSlideNodeGroup): ResolvedClusterGroup | undefined {
  const layout = (group.layout ?? "linear-x") as ClusterLayout;
  const axis = group.axis;
  const clusters: Cluster[] = [];
  const usedFrames = new Set<ShapeBlock>();

  for (const text of group.members) {
    const anchor = blocks.find(
      (b) => !b.removed && b.tag === "sp" && b.text === text && !usedFrames.has(b)
    );
    if (!anchor) return undefined;
    const frame = findClusterFrame(blocks, anchor);
    usedFrames.add(frame);
    clusters.push({
      text,
      anchor,
      frame,
      shapes: [],
      removed: false,
      oFrameStart: 0,
      oFrameLen: 0,
      oFrameCrossStart: 0,
      oFrameCrossLen: 0,
      oCenterX: 0,
      oCenterY: 0
    });
  }

  // Capture original geometry per cluster (needed for band partitioning).
  for (const cluster of clusters) {
    cluster.oFrameStart = axis === "x" ? cluster.frame.off.x : cluster.frame.off.y;
    cluster.oFrameLen = axis === "x" ? cluster.frame.ext.cx : cluster.frame.ext.cy;
    cluster.oFrameCrossStart = axis === "x" ? cluster.frame.off.y : cluster.frame.off.x;
    cluster.oFrameCrossLen = axis === "x" ? cluster.frame.ext.cy : cluster.frame.ext.cx;
    const c = shapeCenter(cluster.frame);
    cluster.oCenterX = c.x;
    cluster.oCenterY = c.y;
  }

  // Radial hubs: a member sitting at the ring centroid (e.g. a "PDCA" hub) must not be
  // treated as an editable ring node. Detect and drop it from the member set so it is
  // preserved untouched while the ring is re-laid-out. Its shapes are protected so they
  // are not absorbed into (and cloned with) a neighboring ring cluster.
  const hubShapes = new Set<ShapeBlock>();
  if (layout === "radial" && clusters.length >= 3) {
    const cx = clusters.reduce((s, c) => s + c.oCenterX, 0) / clusters.length;
    const cy = clusters.reduce((s, c) => s + c.oCenterY, 0) / clusters.length;
    const dists = clusters.map((c) => Math.hypot(c.oCenterX - cx, c.oCenterY - cy));
    const sortedDist = [...dists].sort((a, b) => a - b);
    const median = sortedDist[Math.floor(sortedDist.length / 2)];
    for (let i = clusters.length - 1; i >= 0; i--) {
      if (median > 0 && dists[i] < median * 0.45) {
        hubShapes.add(clusters[i].frame);
        hubShapes.add(clusters[i].anchor);
        clusters.splice(i, 1);
      }
    }
  }

  const sorted = [...clusters].sort((a, b) => a.oFrameStart - b.oFrameStart);
  const footStart = Math.min(...clusters.map((c) => c.oFrameStart));
  const footEnd = Math.max(...clusters.map((c) => c.oFrameStart + c.oFrameLen));
  const clusterLen = sorted[0].oFrameLen;
  let gap = 0;
  if (sorted.length >= 2) {
    gap = sorted[1].oFrameStart - (sorted[0].oFrameStart + sorted[0].oFrameLen);
  }
  if (gap <= 0) gap = Math.round(clusterLen * 0.12);

  const crossMinFrame = Math.min(...clusters.map((c) => c.oFrameCrossStart));
  const crossMaxFrame = Math.max(...clusters.map((c) => c.oFrameCrossStart + c.oFrameCrossLen));
  const crossExpand = 0.6 * Math.max(...clusters.map((c) => c.oFrameCrossLen));
  const alongOf = (b: ShapeBlock) => (axis === "x" ? b.off.x + b.ext.cx / 2 : b.off.y + b.ext.cy / 2);
  const crossOf = (b: ShapeBlock) => (axis === "x" ? b.off.y + b.ext.cy / 2 : b.off.x + b.ext.cx / 2);
  const alongExtentOf = (b: ShapeBlock) => (axis === "x" ? Math.abs(b.ext.cx) : Math.abs(b.ext.cy));

  // Band boundaries between consecutive frames (sorted along axis).
  const boundaries: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    boundaries.push((sorted[i].oFrameStart + sorted[i].oFrameLen + sorted[i + 1].oFrameStart) / 2);
  }
  const bandIndexFor = (along: number): number => {
    let idx = 0;
    while (idx < boundaries.length && along > boundaries[idx]) idx++;
    return idx;
  };
  const clusterBySortIndex = sorted;

  // Assign in-band shapes to clusters; detect a spanning bus line and between-connectors.
  const assigned = new Set<ShapeBlock>();
  let bus: ShapeBlock | undefined;
  const betweensCollected: ShapeBlock[] = [];
  for (const block of blocks) {
    if (block.removed || block.tag !== "sp") continue;
    if (hubShapes.has(block)) {
      assigned.add(block);
      continue;
    }
    if (clusters.some((c) => c.frame === block || c.anchor === block)) {
      const owner = clusters.find((c) => c.frame === block) ?? clusters.find((c) => c.anchor === block)!;
      owner.shapes.push(block);
      assigned.add(block);
      continue;
    }
    const along = alongOf(block);
    const cross = crossOf(block);
    const inAlong = along >= footStart - gap && along <= footEnd + gap;
    const inCross = cross >= crossMinFrame - crossExpand && cross <= crossMaxFrame + crossExpand;
    if (!inAlong || !inCross) continue;
    // Spanning bus: a long line covering most of the footprint.
    if (isLine(block) && alongExtentOf(block) > clusterLen * 1.4) {
      if (!bus) bus = block;
      continue;
    }
    // Arrow-like connectors that are not inside any frame are between-connectors.
    if (isArrowLike(block) && !clusters.some((c) => frameContainsCenter(c.frame, block))) {
      betweensCollected.push(block);
      continue;
    }
    const band = bandIndexFor(along);
    clusterBySortIndex[Math.min(band, clusterBySortIndex.length - 1)].shapes.push(block);
    assigned.add(block);
  }
  for (const cluster of clusters) {
    if (!cluster.shapes.includes(cluster.frame)) cluster.shapes.push(cluster.frame);
    if (!cluster.shapes.includes(cluster.anchor)) cluster.shapes.push(cluster.anchor);
  }


  // Between-connectors: arrow-like leftovers collected during assignment. For radial,
  // also include any arrow-like shape anywhere on the slide (rotated ring arrows).
  const betweens: ShapeBlock[] = [...betweensCollected];
  if (layout === "radial") {
    for (const block of blocks) {
      if (block.removed || assigned.has(block) || betweens.includes(block) || !isArrowLike(block)) continue;
      betweens.push(block);
    }
  }

  // Staircase metrics (cross size ramp, shared bottom baseline).
  const baseline = Math.max(...clusters.map((c) => c.oFrameCrossStart + c.oFrameCrossLen));
  const crossLens = clusters.map((c) => c.oFrameCrossLen);
  const hMin = Math.min(...crossLens);
  const hMax = Math.max(...crossLens);

  // Radial metrics (center + radius + start angle).
  const center: Endpoint = { x: CANVAS_W / 2, y: 0 };
  // center y = average of cluster centers; better: centroid of frame centers.
  center.y = clusters.reduce((sum, c) => sum + c.oCenterY, 0) / clusters.length;
  center.x = clusters.reduce((sum, c) => sum + c.oCenterX, 0) / clusters.length;
  const radius = clusters.reduce((sum, c) => sum + Math.hypot(c.oCenterX - center.x, c.oCenterY - center.y), 0) / clusters.length;
  const startAngle = Math.atan2(clusters[0].oCenterY - center.y, clusters[0].oCenterX - center.x);

  return {
    kind: "cluster",
    layout,
    axis,
    renumber: group.renumber ?? false,
    clusters,
    betweens,
    bus,
    regenerated: [],
    footStart,
    footEnd,
    gap,
    clusterLen,
    baseline,
    hMin,
    hMax,
    center,
    radius,
    startAngle
  };
}

function translateScaleClusterAxis(cluster: Cluster, newStart: number, scale: number, axis: "x" | "y"): void {
  for (const shape of cluster.shapes) {
    if (axis === "x") {
      const nx = newStart + (shape.off.x - cluster.oFrameStart) * scale;
      const ncx = shape.ext.cx * scale;
      setBlockGeometry(shape, nx, shape.off.y, ncx, shape.ext.cy);
    } else {
      const ny = newStart + (shape.off.y - cluster.oFrameStart) * scale;
      const ncy = shape.ext.cy * scale;
      setBlockGeometry(shape, shape.off.x, ny, shape.ext.cx, ncy);
    }
  }
}

function translateClusterCross(cluster: Cluster, newCrossStart: number, newCrossLen: number, axis: "x" | "y"): void {
  // Move the cluster along the cross axis and resize the frame's cross length, keeping
  // inner shapes anchored to the frame's cross start (top for x-axis layouts).
  const oldCrossStart = cluster.oFrameCrossStart;
  const delta = newCrossStart - oldCrossStart;
  for (const shape of cluster.shapes) {
    if (axis === "x") {
      setBlockGeometry(shape, shape.off.x, shape.off.y + delta, shape.ext.cx, shape.ext.cy);
    } else {
      setBlockGeometry(shape, shape.off.x + delta, shape.off.y, shape.ext.cx, shape.ext.cy);
    }
  }
  // Resize only the frame's cross length (e.g. staircase height).
  if (axis === "x") {
    setBlockGeometry(cluster.frame, cluster.frame.off.x, newCrossStart, cluster.frame.ext.cx, newCrossLen);
  } else {
    setBlockGeometry(cluster.frame, newCrossStart, cluster.frame.off.y, newCrossLen, cluster.frame.ext.cy);
  }
}

function translateClusterTo(cluster: Cluster, newCenter: Endpoint): void {
  const dx = newCenter.x - cluster.oCenterX;
  const dy = newCenter.y - cluster.oCenterY;
  for (const shape of cluster.shapes) {
    setBlockGeometry(shape, shape.off.x + dx, shape.off.y + dy, shape.ext.cx, shape.ext.cy);
  }
}

function renumberClusters(active: Cluster[]): void {
  active.forEach((cluster, index) => {
    // Find a badge shape whose text is a small integer (the step number) and renumber it.
    const badge = cluster.shapes.find((s) => s !== cluster.anchor && /^\d{1,2}$/.test(s.text.trim()));
    if (badge) {
      const next = String(index + 1);
      badge.raw = setLabelText(badge.raw, next);
      badge.text = next;
    }
  });
}

function relayoutClusterGroup(resolved: ResolvedClusterGroup): void {
  const active = resolved.clusters.filter((c) => !c.removed);
  // Remove all between-connectors; survivors are regenerated below.
  for (const between of resolved.betweens) between.removed = true;
  if (active.length === 0) return;
  if (resolved.renumber) renumberClusters(active);

  if (resolved.layout === "radial") {
    relayoutRadial(resolved, active);
    return;
  }

  const { axis, footStart, footEnd } = resolved;
  const span = footEnd - footStart;
  const n = active.length;
  const ratio = resolved.clusterLen > 0 ? resolved.gap / resolved.clusterLen : 0.12;
  let clusterLen = span / (n + (n - 1) * ratio);
  let gap = clusterLen * ratio;
  const minLen = 228600;
  if (clusterLen < minLen) {
    clusterLen = minLen;
    gap = n > 1 ? (span - n * clusterLen) / (n - 1) : 0;
    if (gap < 0) gap = Math.round(clusterLen * 0.04);
  }
  const scale = resolved.clusterLen > 0 ? clusterLen / resolved.clusterLen : 1;

  // Staircase cross-size ramp.
  const ramp = (index: number): number => {
    if (n === 1) return resolved.hMax;
    return resolved.hMin + ((resolved.hMax - resolved.hMin) * index) / (n - 1);
  };

  let cursor = footStart;
  const centersAlong: number[] = [];
  active.forEach((cluster, index) => {
    if (resolved.layout === "staircase-x") {
      const h = ramp(index);
      const top = resolved.baseline - h;
      translateClusterCross(cluster, top, h, axis);
      // recapture cross start so axis translate uses updated positions consistently
      cluster.oFrameCrossStart = top;
    }
    translateScaleClusterAxis(cluster, cursor, scale, axis);
    centersAlong.push(cursor + clusterLen / 2);
    cursor += clusterLen + gap;
  });

  // Regenerate between-connectors, one per gap, from the first original template.
  const template = resolved.betweens[0];
  if (template && n > 1) {
    const tplAlongLen = axis === "x" ? template.ext.cx : template.ext.cy;
    const tplCrossStart = axis === "x" ? template.off.y : template.off.x;
    const tplCrossLen = axis === "x" ? template.ext.cy : template.ext.cx;
    for (let i = 0; i < n - 1; i++) {
      const gapCenter = (centersAlong[i] + clusterLen / 2 + (centersAlong[i + 1] - clusterLen / 2)) / 2;
      const clone = cloneBlock(template);
      clone.removed = false;
      const alongStart = gapCenter - tplAlongLen / 2;
      if (axis === "x") {
        setBlockGeometry(clone, alongStart, tplCrossStart, tplAlongLen, tplCrossLen);
      } else {
        setBlockGeometry(clone, tplCrossStart, alongStart, tplCrossLen, tplAlongLen);
      }
      resolved.regenerated.push(clone);
    }
  }

  // Resize a spanning bus (e.g. vertical timeline spine) to cover first..last cluster centers.
  if (resolved.bus && n > 1) {
    const first = centersAlong[0];
    const last = centersAlong[centersAlong.length - 1];
    if (axis === "x") {
      setBlockGeometry(resolved.bus, first, resolved.bus.off.y, last - first, resolved.bus.ext.cy);
    } else {
      setBlockGeometry(resolved.bus, resolved.bus.off.x, first, resolved.bus.ext.cx, last - first);
    }
  } else if (resolved.bus && n === 1) {
    resolved.bus.removed = true;
  }
}

function relayoutRadial(resolved: ResolvedClusterGroup, active: Cluster[]): void {
  const n = active.length;
  const { center, radius, startAngle } = resolved;
  active.forEach((cluster, index) => {
    const angle = startAngle + (index * 2 * Math.PI) / n;
    translateClusterTo(cluster, {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle)
    });
  });

  // Regenerate arrows in the gap arcs between consecutive nodes, tangent (clockwise), from
  // the first template so they sit between nodes rather than overlapping them.
  const template = resolved.betweens[0];
  if (template && n > 1) {
    const tplCx = template.ext.cx;
    const tplCy = template.ext.cy;
    const step = (2 * Math.PI) / n;
    for (let i = 0; i < n; i++) {
      const midAngle = startAngle + (i + 0.5) * step;
      const cx = center.x + radius * Math.cos(midAngle);
      const cy = center.y + radius * Math.sin(midAngle);
      const tangentDeg = (midAngle * 180) / Math.PI + 90; // clockwise tangent
      let rot = Math.round(tangentDeg * 60000);
      rot = ((rot % 21600000) + 21600000) % 21600000;
      const clone = cloneBlock(template);
      clone.removed = false;
      clone.raw = setRotation(clone.raw, rot);
      setBlockGeometry(clone, cx - tplCx / 2, cy - tplCy / 2, tplCx, tplCy);
      resolved.regenerated.push(clone);
    }
  }
}

function setRotation(raw: string, rot: number): string {
  if (/<a:xfrm\b[^>]*\brot="/.test(raw)) {
    return raw.replace(/(<a:xfrm\b[^>]*\brot=")(-?\d+)(")/, `$1${rot}$3`);
  }
  return raw.replace(/<a:xfrm\b/, `<a:xfrm rot="${rot}"`);
}

function isClusterLayout(group: PptxSlideNodeGroup): boolean {
  return group.layout !== undefined && group.layout !== "tree";
}

function cloneClusterAt(
  blocks: ShapeBlock[],
  resolved: ResolvedClusterGroup,
  template: Cluster,
  label: string,
  at: number | undefined
): void {
  const newShapes = template.shapes.map((shape) => cloneBlock(shape));
  const anchorIndex = template.shapes.indexOf(template.anchor);
  const frameIndex = template.shapes.indexOf(template.frame);
  const newAnchor = newShapes[anchorIndex] ?? newShapes[0];
  const newFrame = newShapes[frameIndex] ?? newAnchor;
  newAnchor.raw = setLabelText(newAnchor.raw, label);
  newAnchor.text = label;
  for (const shape of newShapes) blocks.push(shape);
  const cluster: Cluster = {
    text: label,
    anchor: newAnchor,
    frame: newFrame,
    shapes: newShapes,
    removed: false,
    oFrameStart: template.oFrameStart,
    oFrameLen: template.oFrameLen,
    oFrameCrossStart: template.oFrameCrossStart,
    oFrameCrossLen: template.oFrameCrossLen,
    oCenterX: template.oCenterX,
    oCenterY: template.oCenterY
  };
  const insertAt = at !== undefined ? Math.min(at, resolved.clusters.length) : resolved.clusters.length;
  resolved.clusters.splice(insertAt, 0, cluster);
}

/**
 * Applies declarative add/remove node operations to curated slide spTree children.
 * Tree groups use the hierarchy relayout; cluster groups (linear/staircase/radial)
 * reposition full visual clusters. Returns the original children unchanged when the
 * structure is unsupported (e.g. group shapes) or a referenced group/member is missing.
 */
export function applyPptxSlideNodeOperations(
  children: string,
  nodeGroups: ReadonlyArray<PptxSlideNodeGroup> | undefined,
  operations: ReadonlyArray<PptxSlideNodeOperation> | undefined
): string {
  if (!nodeGroups || nodeGroups.length === 0 || !operations || operations.length === 0) {
    return children;
  }
  const blocks = tokenizeShapes(children);
  if (!blocks) {
    return children;
  }

  const groupById = new Map(nodeGroups.map((g) => [g.id, g]));
  const treeResolved = new Map<string, ResolvedGroup>();
  const clusterResolved = new Map<string, ResolvedClusterGroup>();

  const resolveTree = (groupId: string): ResolvedGroup | undefined => {
    if (treeResolved.has(groupId)) return treeResolved.get(groupId);
    const group = groupById.get(groupId);
    if (!group) return undefined;
    const resolved = resolveGroup(blocks, group);
    if (resolved) treeResolved.set(groupId, resolved);
    return resolved;
  };
  const resolveCluster = (groupId: string): ResolvedClusterGroup | undefined => {
    if (clusterResolved.has(groupId)) return clusterResolved.get(groupId);
    const group = groupById.get(groupId);
    if (!group) return undefined;
    const resolved = resolveClusterGroup(blocks, group);
    if (resolved) clusterResolved.set(groupId, resolved);
    return resolved;
  };

  const touchedTree = new Set<string>();
  const touchedCluster = new Set<string>();

  for (const operation of operations) {
    if (operation.op === "remove") {
      for (const group of nodeGroups) {
        if (!group.members.includes(operation.target)) continue;
        if (isClusterLayout(group)) {
          const resolved = resolveCluster(group.id);
          if (!resolved) continue;
          const cluster = resolved.clusters.find((c) => c.text === operation.target);
          if (!cluster) continue;
          cluster.removed = true;
          for (const shape of cluster.shapes) shape.removed = true;
          touchedCluster.add(group.id);
          break;
        }
        const resolved = resolveTree(group.id);
        if (!resolved) continue;
        const member = resolved.members.find((m) => m.text === operation.target);
        if (!member) continue;
        member.box.removed = true;
        member.label.removed = true;
        touchedTree.add(group.id);
        break;
      }
    } else {
      const group = groupById.get(operation.group);
      if (!group) continue;
      if (isClusterLayout(group)) {
        const resolved = resolveCluster(operation.group);
        if (!resolved || resolved.clusters.length === 0) continue;
        const template =
          (operation.cloneFrom && resolved.clusters.find((c) => c.text === operation.cloneFrom)) ||
          resolved.clusters.find((c) => !c.removed) ||
          resolved.clusters[0];
        cloneClusterAt(blocks, resolved, template, operation.label, operation.at);
        touchedCluster.add(operation.group);
        continue;
      }
      const resolved = resolveTree(operation.group);
      if (!resolved || resolved.members.length === 0) continue;
      const template =
        (operation.cloneFrom && resolved.members.find((m) => m.text === operation.cloneFrom)) ||
        resolved.members.find((m) => !m.box.removed) ||
        resolved.members[0];
      const newBox = cloneBlock(template.box);
      const newLabel = cloneBlock(template.label);
      newLabel.raw = setLabelText(newLabel.raw, operation.label);
      newLabel.text = operation.label;
      const newMember: MemberNode = { text: operation.label, box: newBox, label: newLabel };
      if (template.drop) {
        const newDrop = cloneBlock(template.drop);
        newMember.drop = newDrop;
        blocks.push(newDrop);
      }
      blocks.push(newBox, newLabel);
      const insertAt = operation.at !== undefined ? Math.min(operation.at, resolved.members.length) : resolved.members.length;
      resolved.members.splice(insertAt, 0, newMember);
      touchedTree.add(operation.group);
    }
  }

  for (const groupId of touchedTree) {
    const resolved = treeResolved.get(groupId);
    if (resolved) relayoutGroup(resolved);
  }
  for (const groupId of touchedCluster) {
    const resolved = clusterResolved.get(groupId);
    if (resolved) {
      relayoutClusterGroup(resolved);
      for (const shape of resolved.regenerated) blocks.push(shape);
    }
  }

  return blocks
    .filter((b) => !b.removed)
    .map((b) => b.raw)
    .join("");
}
