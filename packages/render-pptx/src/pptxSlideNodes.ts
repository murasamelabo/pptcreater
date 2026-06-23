export interface PptxSlideNodeGroup {
  id: string;
  axis: "x" | "y";
  parentText?: string;
  members: string[];
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

/**
 * Applies declarative add/remove node operations to curated tree slide spTree children.
 * Returns the original children unchanged when the structure is unsupported (e.g. groups)
 * or when a referenced group/member cannot be resolved.
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
  const resolvedById = new Map<string, ResolvedGroup>();
  const resolveOnce = (groupId: string): ResolvedGroup | undefined => {
    if (resolvedById.has(groupId)) return resolvedById.get(groupId);
    const group = groupById.get(groupId);
    if (!group) return undefined;
    const resolved = resolveGroup(blocks, group);
    if (resolved) resolvedById.set(groupId, resolved);
    return resolved;
  };

  const touchedGroups = new Set<string>();

  for (const operation of operations) {
    if (operation.op === "remove") {
      // Find which group owns this member text.
      for (const group of nodeGroups) {
        if (!group.members.includes(operation.target)) continue;
        const resolved = resolveOnce(group.id);
        if (!resolved) continue;
        const member = resolved.members.find((m) => m.text === operation.target);
        if (!member) continue;
        member.box.removed = true;
        member.label.removed = true;
        touchedGroups.add(group.id);
        break;
      }
    } else {
      const resolved = resolveOnce(operation.group);
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
      touchedGroups.add(operation.group);
    }
  }

  for (const groupId of touchedGroups) {
    const resolved = resolvedById.get(groupId);
    if (resolved) relayoutGroup(resolved);
  }

  return blocks
    .filter((b) => !b.removed)
    .map((b) => b.raw)
    .join("");
}
