import { z } from "zod";

export const DiagramNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  sublabel: z.string().optional(),
  // Coordinates are OPTIONAL. Omit them (on every node) to let the engine place nodes
  // automatically with a layered layout so arrows always connect border-to-border. Supply
  // explicit x/y only when you need a bespoke layout (then every node must have both).
  x: z.number().min(0).optional(),
  y: z.number().min(0).optional(),
  w: z.number().positive().default(160),
  h: z.number().positive().default(72),
  // Auto-layout hints (ignored when explicit x/y are used):
  //  - layer: force a column (LR) / row (TB) index, overriding the arrow-derived layer.
  //  - lane: keep related nodes adjacent within a rank (sorted by lane name).
  layer: z.number().int().min(0).optional(),
  lane: z.string().optional(),
  kind: z.enum(["actor", "system", "process", "data", "note", "cloud"]).default("process"),
  icon: z.enum(["actor", "system", "process", "data", "note", "cloud", "none"]).optional(),
  accent: z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/).optional(),
  emphasis: z.boolean().default(false)
});

export const DiagramArrowSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional(),
  style: z.enum(["straight", "orthogonal"]).default("orthogonal"),
  dashed: z.boolean().default(false),
  bidirectional: z.boolean().default(false)
});

export const DiagramGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  nodeIds: z.array(z.string().min(1)).min(1)
});

export const PonchiDiagramSchema = z
  .object({
    title: z.string().min(1),
    summary: z.string().min(1),
    longDescription: z.string().min(20),
    width: z.number().positive().default(960),
    height: z.number().positive().default(540),
    // Flow direction for auto-layout: "LR" (left-to-right, default) or "TB" (top-to-bottom).
    direction: z.enum(["LR", "TB"]).default("LR"),
    nodes: z.array(DiagramNodeSchema).min(1),
    arrows: z.array(DiagramArrowSchema).default([]),
    groups: z.array(DiagramGroupSchema).default([])
  })
  .superRefine((diagram, context) => {
    const nodeIds = new Set<string>();

    diagram.nodes.forEach((node, index) => {
      if (nodeIds.has(node.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate node id "${node.id}".`,
          path: ["nodes", index, "id"]
        });
      }
      nodeIds.add(node.id);
    });

    diagram.arrows.forEach((arrow, index) => {
      if (!nodeIds.has(arrow.from)) {
        context.addIssue({
          code: "custom",
          message: `Arrow references unknown source node "${arrow.from}".`,
          path: ["arrows", index, "from"]
        });
      }

      if (!nodeIds.has(arrow.to)) {
        context.addIssue({
          code: "custom",
          message: `Arrow references unknown target node "${arrow.to}".`,
          path: ["arrows", index, "to"]
        });
      }
    });

    diagram.groups.forEach((group, groupIndex) => {
      group.nodeIds.forEach((nodeId, nodeIndex) => {
        if (!nodeIds.has(nodeId)) {
          context.addIssue({
            code: "custom",
            message: `Group references unknown node "${nodeId}".`,
            path: ["groups", groupIndex, "nodeIds", nodeIndex]
          });
        }
      });
    });

    // Coordinates are all-or-nothing: either every node is auto-laid-out (no x/y on any node) or
    // every node is hand-placed (both x and y on every node). A partial mix is ambiguous.
    const placedCount = diagram.nodes.filter((node) => node.x !== undefined && node.y !== undefined).length;
    if (placedCount !== 0 && placedCount !== diagram.nodes.length) {
      diagram.nodes.forEach((node, index) => {
        if (node.x === undefined || node.y === undefined) {
          context.addIssue({
            code: "custom",
            message:
              "Mix of auto-laid-out and hand-placed nodes. Either omit x/y on every node (recommended) or set both x and y on every node.",
            path: ["nodes", index, "x"]
          });
        }
      });
    }
  });

export type PonchiDiagram = z.infer<typeof PonchiDiagramSchema>;
export type PonchiNode = z.infer<typeof DiagramNodeSchema>;
// A node after layout resolution: x/y/w/h are all guaranteed present.
export type PlacedNode = PonchiNode & { x: number; y: number; w: number; h: number };

export const SchematicKindSchema = z.enum(["table", "tree", "flow", "vertical-flow", "list", "list-horizontal", "list-enumeration", "mockup"]);
export const SchematicToneSchema = z.enum(["minimal", "cool", "luxury", "report"]).default("minimal");

export const SchematicDiagramSchema = z.object({
  kind: SchematicKindSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  longDescription: z.string().min(20),
  items: z.array(z.string().min(1)).min(1).max(8),
  secondaryItems: z.array(z.string().min(1)).max(8).default([]),
  tone: SchematicToneSchema,
  width: z.number().min(960).default(960),
  height: z.number().min(540).default(540)
});

export type SchematicDiagram = z.infer<typeof SchematicDiagramSchema>;

type SchematicPalette = {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  accent: string;
  accentSoft: string;
  line: string;
};

const SCHEMATIC_PALETTES: Record<z.infer<typeof SchematicToneSchema>, SchematicPalette> = {
  minimal: {
    background: "#fbfaf7",
    surface: "#ffffff",
    surfaceAlt: "#f3f1ea",
    text: "#1f2933",
    muted: "#65707b",
    accent: "#315f9f",
    accentSoft: "#dfe8f5",
    line: "#d8d3c8"
  },
  cool: {
    background: "#0b1020",
    surface: "#151c2f",
    surfaceAlt: "#1c263c",
    text: "#f8fafc",
    muted: "#c6d0df",
    accent: "#2dd4bf",
    accentSoft: "#143a42",
    line: "#2a3751"
  },
  luxury: {
    background: "#14110d",
    surface: "#211b14",
    surfaceAlt: "#2b241b",
    text: "#f8f1e4",
    muted: "#d1bea4",
    accent: "#c8a15a",
    accentSoft: "#3b3020",
    line: "#4a3d2b"
  },
  report: {
    background: "#fbfaf7",
    surface: "#ffffff",
    surfaceAlt: "#f1eee7",
    text: "#24211d",
    muted: "#5f5a52",
    accent: "#8f3d35",
    accentSoft: "#f2ded9",
    line: "#d8d3c8"
  }
};

const NODE_COLORS: Record<PonchiDiagram["nodes"][number]["kind"], { fill: string; stroke: string; accent: string }> = {
  actor: { fill: "#eef2ff", stroke: "#c7d2fe", accent: "#4f46e5" },
  system: { fill: "#eff6ff", stroke: "#bfdbfe", accent: "#2563eb" },
  process: { fill: "#ffffff", stroke: "#d8dee9", accent: "#0f766e" },
  data: { fill: "#ecfdf5", stroke: "#bbf7d0", accent: "#059669" },
  note: { fill: "#fffbeb", stroke: "#fde68a", accent: "#b45309" },
  cloud: { fill: "#f5f3ff", stroke: "#ddd6fe", accent: "#7c3aed" }
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapLabel(value: string, maxChars = 14): string[] {
  const text = value.trim();
  if (text.length <= maxChars) {
    return [text];
  }

  // Word-aware wrapping for space-separated (Latin) labels so words are never split mid-word.
  if (/\s/.test(text)) {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      if (!line) {
        line = word;
      } else if ((line + " " + word).length <= maxChars) {
        line += ` ${word}`;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) {
      lines.push(line);
    }
    return lines.slice(0, 3);
  }

  // CJK labels have no spaces; fall back to a fixed character count per line.
  const lines: string[] = [];
  for (let index = 0; index < text.length; index += maxChars) {
    lines.push(text.slice(index, index + maxChars));
  }
  return lines.slice(0, 3);
}

function textBlock(lines: string[], x: number, y: number, options: { size?: number; color: string; weight?: number; anchor?: "start" | "middle" }): string {
  const size = options.size ?? 16;
  const anchor = options.anchor ?? "start";
  return lines
    .map((line, index) => `<text x="${x}" y="${y + index * (size * 1.35)}" text-anchor="${anchor}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${options.weight ?? 500}" fill="${options.color}">${escapeXml(line)}</text>`)
    .join("");
}

function roundedRect(x: number, y: number, w: number, h: number, rx: number, fill: string, stroke: string): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" />`;
}

function flowSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const count = Math.min(diagram.items.length, 5);
  const gap = 24;
  const cardW = (diagram.width - 96 - gap * (count - 1)) / count;
  const y = 210;
  return diagram.items
    .slice(0, count)
    .map((item, index) => {
      const x = 48 + index * (cardW + gap);
      const arrow = index < count - 1 ? `<path d="M${x + cardW + 8} ${y + 48}h${gap - 16}m-8-8 8 8-8 8" fill="none" stroke="${palette.accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />` : "";
      return [
        roundedRect(x, y, cardW, 96, 18, palette.surface, palette.line),
        `<circle cx="${x + 34}" cy="${y + 34}" r="14" fill="${palette.accentSoft}" stroke="${palette.accent}" />`,
        `<text x="${x + 34}" y="${y + 39}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="${palette.accent}">${index + 1}</text>`,
        textBlock(wrapLabel(item, 12), x + 60, y + 36, { color: palette.text, size: 15, weight: 700 }),
        arrow
      ].join("");
    })
    .join("");
}

function verticalFlowSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const count = Math.min(diagram.items.length, 5);
  const cardH = 62;
  const gap = 18;
  const startY = 120;
  const x = 190;
  const w = diagram.width - 380;
  return diagram.items
    .slice(0, count)
    .map((item, index) => {
      const y = startY + index * (cardH + gap);
      const arrow = index < count - 1 ? `<path d="M${diagram.width / 2} ${y + cardH + 4}v${gap - 8}m-7-7 7 7 7-7" fill="none" stroke="${palette.accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />` : "";
      return [
        roundedRect(x, y, w, cardH, 16, palette.surface, palette.line),
        `<rect x="${x}" y="${y}" width="7" height="${cardH}" rx="3.5" fill="${palette.accent}" />`,
        textBlock(wrapLabel(item, 26), x + 32, y + 26, { color: palette.text, size: 16, weight: 700 }),
        arrow
      ].join("");
    })
    .join("");
}

function tableSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const rows = Math.min(Math.max(diagram.items.length, diagram.secondaryItems.length), 5);
  const x = 72;
  const y = 126;
  const w = diagram.width - 144;
  const rowH = 58;
  const colW = w / 2;
  const header = [
    roundedRect(x, y, w, rowH, 18, palette.accentSoft, palette.accent),
    textBlock([diagram.items[0] ?? "Before"], x + 24, y + 36, { color: palette.text, size: 15, weight: 700 }),
    textBlock([diagram.secondaryItems[0] ?? "After"], x + colW + 24, y + 36, { color: palette.text, size: 15, weight: 700 }),
    `<path d="M${x + colW} ${y}v${rowH * (rows + 1)}" stroke="${palette.line}" />`
  ].join("");
  const body = Array.from({ length: rows }).map((_, index) => {
    const rowY = y + rowH * (index + 1);
    return [
      `<rect x="${x}" y="${rowY}" width="${w}" height="${rowH}" fill="${index % 2 === 0 ? palette.surface : palette.surfaceAlt}" stroke="${palette.line}" />`,
      textBlock(wrapLabel(diagram.items[index + 1] ?? diagram.items[index] ?? "", 26), x + 24, rowY + 34, { color: palette.text, size: 14, weight: 500 }),
      textBlock(wrapLabel(diagram.secondaryItems[index + 1] ?? diagram.secondaryItems[index] ?? "", 26), x + colW + 24, rowY + 34, { color: palette.muted, size: 14, weight: 500 })
    ].join("");
  });
  return [header, ...body].join("");
}

function treeSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const rootX = diagram.width / 2 - 110;
  const rootY = 120;
  const children = diagram.items.slice(1, 6);
  const childW = 150;
  const gap = 20;
  const totalW = children.length * childW + Math.max(0, children.length - 1) * gap;
  const childStartX = diagram.width / 2 - totalW / 2;
  const childY = 315;
  return [
    roundedRect(rootX, rootY, 220, 72, 20, palette.accentSoft, palette.accent),
    textBlock(wrapLabel(diagram.items[0] ?? diagram.title, 14), diagram.width / 2, rootY + 34, { color: palette.text, size: 16, weight: 700, anchor: "middle" }),
    `<path d="M${diagram.width / 2} ${rootY + 72}v70" stroke="${palette.line}" stroke-width="2" />`,
    ...children.map((item, index) => {
      const x = childStartX + index * (childW + gap);
      const cx = x + childW / 2;
      return [
        `<path d="M${diagram.width / 2} ${rootY + 142}H${cx}V${childY}" fill="none" stroke="${palette.line}" stroke-width="2" />`,
        roundedRect(x, childY, childW, 82, 18, palette.surface, palette.line),
        textBlock(wrapLabel(item, 10), cx, childY + 34, { color: palette.text, size: 14, weight: 700, anchor: "middle" })
      ].join("");
    })
  ].join("");
}

function listSchematic(diagram: SchematicDiagram, palette: SchematicPalette, horizontal = false, enumeration = false): string {
  const items = diagram.items.slice(0, horizontal ? 4 : 6);
  if (horizontal) {
    const gap = 18;
    const w = (diagram.width - 96 - gap * (items.length - 1)) / items.length;
    return items
      .map((item, index) => {
        const x = 48 + index * (w + gap);
        return [
          roundedRect(x, 205, w, 138, 22, palette.surface, palette.line),
          `<circle cx="${x + w / 2}" cy="184" r="18" fill="${palette.accent}" />`,
          `<text x="${x + w / 2}" y="190" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="${palette.background}">${index + 1}</text>`,
          textBlock(wrapLabel(item, 11), x + w / 2, 255, { color: palette.text, size: 15, weight: 700, anchor: "middle" })
        ].join("");
      })
      .join("");
  }

  return items
    .map((item, index) => {
      const y = 128 + index * 62;
      return [
        roundedRect(96, y, diagram.width - 192, 48, 14, palette.surface, palette.line),
        `<circle cx="124" cy="${y + 24}" r="12" fill="${palette.accentSoft}" stroke="${palette.accent}" />`,
        `<text x="124" y="${y + 29}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="${palette.accent}">${enumeration ? index + 1 : "✓"}</text>`,
        textBlock(wrapLabel(item, 42), 154, y + 30, { color: palette.text, size: 15, weight: 600 })
      ].join("");
    })
    .join("");
}

function mockupSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const x = 170;
  const y = 116;
  const w = diagram.width - 340;
  const h = 310;
  const bullets = diagram.items.slice(0, 4);
  return [
    roundedRect(x, y, w, h, 28, palette.surface, palette.line),
    `<rect x="${x}" y="${y}" width="${w}" height="46" rx="28" fill="${palette.surfaceAlt}" />`,
    `<circle cx="${x + 28}" cy="${y + 23}" r="5" fill="${palette.accent}" /><circle cx="${x + 46}" cy="${y + 23}" r="5" fill="${palette.line}" /><circle cx="${x + 64}" cy="${y + 23}" r="5" fill="${palette.line}" />`,
    roundedRect(x + 42, y + 82, w - 84, 64, 18, palette.accentSoft, palette.accent),
    ...bullets.map((item, index) => {
      const rowY = y + 178 + index * 38;
      return [
        `<circle cx="${x + 58}" cy="${rowY}" r="7" fill="${palette.accent}" />`,
        `<rect x="${x + 78}" y="${rowY - 7}" width="${w - 150 - index * 18}" height="14" rx="7" fill="${palette.surfaceAlt}" />`,
        textBlock([item], x + w - 40, rowY + 5, { color: palette.muted, size: 10, weight: 600, anchor: "middle" })
      ].join("");
    })
  ].join("");
}

export function renderSchematicDiagram(input: unknown): { svg: string; summary: string; longDescription: string } {
  const diagram = SchematicDiagramSchema.parse(input);
  const palette = SCHEMATIC_PALETTES[diagram.tone];
  const body =
    diagram.kind === "table"
      ? tableSchematic(diagram, palette)
      : diagram.kind === "tree"
        ? treeSchematic(diagram, palette)
        : diagram.kind === "flow"
          ? flowSchematic(diagram, palette)
          : diagram.kind === "vertical-flow"
            ? verticalFlowSchematic(diagram, palette)
            : diagram.kind === "list-horizontal"
              ? listSchematic(diagram, palette, true)
              : diagram.kind === "list-enumeration"
                ? listSchematic(diagram, palette, false, true)
                : diagram.kind === "mockup"
                  ? mockupSchematic(diagram, palette)
                  : listSchematic(diagram, palette);

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${diagram.width} ${diagram.height}" role="img">`,
    `<title>${escapeXml(diagram.title)}</title>`,
    `<desc>${escapeXml(diagram.longDescription)}</desc>`,
    `<rect width="${diagram.width}" height="${diagram.height}" fill="${palette.background}" />`,
    textBlock(wrapLabel(diagram.title, 28), 48, 58, { color: palette.text, size: 24, weight: 700 }),
    `<rect x="48" y="84" width="70" height="4" rx="2" fill="${palette.accent}" />`,
    body,
    "</svg>"
  ].join("");

  return {
    svg,
    summary: diagram.summary,
    longDescription: diagram.longDescription
  };
}


function centerOf(node: PlacedNode): { x: number; y: number } {
  return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
}

type Point = { x: number; y: number };

// Inline, PowerPoint-safe icon glyphs (stroke paths) drawn centered in a 24x24 box.
function nodeIconGlyph(kind: PonchiNode["kind"], cx: number, cy: number, color: string): string {
  const s = `stroke="${color}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  const g = (body: string): string => `<g transform="translate(${cx - 12} ${cy - 12})">${body}</g>`;
  switch (kind) {
    case "actor":
      return g(`<circle cx="12" cy="8" r="3.4" ${s} /><path d="M5.5 19c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" ${s} />`);
    case "system":
      return g(`<rect x="4" y="5" width="16" height="5" rx="1.6" ${s} /><rect x="4" y="13" width="16" height="5" rx="1.6" ${s} /><circle cx="7.5" cy="7.5" r="0.9" fill="${color}" /><circle cx="7.5" cy="15.5" r="0.9" fill="${color}" />`);
    case "data":
      return g(`<ellipse cx="12" cy="6.5" rx="7" ry="2.8" ${s} /><path d="M5 6.5v11c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-11" ${s} /><path d="M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8" ${s} />`);
    case "cloud":
      return g(`<path d="M7 17h10a3.4 3.4 0 0 0 .3-6.8A5 5 0 0 0 7.6 9.4 3.8 3.8 0 0 0 7 17z" ${s} />`);
    case "note":
      return g(`<path d="M6 4h8l4 4v12H6z" ${s} /><path d="M14 4v4h4" ${s} /><path d="M9 12h6M9 15h6" ${s} />`);
    default:
      return g(`<circle cx="12" cy="12" r="7.5" ${s} /><path d="M12 4.5v2M12 17.5v2M4.5 12h2M17.5 12h2" ${s} />`);
  }
}

// Point on the border of a node rectangle along the ray from its center toward (tx, ty).
function edgePoint(node: PlacedNode, tx: number, ty: number): Point {
  const c = centerOf(node);
  const dx = tx - c.x;
  const dy = ty - c.y;
  if (dx === 0 && dy === 0) {
    return c;
  }

  const scale = Math.min(
    dx !== 0 ? node.w / 2 / Math.abs(dx) : Number.POSITIVE_INFINITY,
    dy !== 0 ? node.h / 2 / Math.abs(dy) : Number.POSITIVE_INFINITY
  );
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}

function arrowHead(tip: Point, dir: Point, color: string, size = 11): string {
  const base = { x: tip.x - dir.x * size, y: tip.y - dir.y * size };
  const px = -dir.y;
  const py = dir.x;
  const half = size * 0.55;
  const a = `${(base.x + px * half).toFixed(1)} ${(base.y + py * half).toFixed(1)}`;
  const b = `${(base.x - px * half).toFixed(1)} ${(base.y - py * half).toFixed(1)}`;
  return `<polygon points="${tip.x.toFixed(1)} ${tip.y.toFixed(1)} ${a} ${b}" fill="${color}" />`;
}

// Build an orthogonal (elbow) or straight connector that starts and ends on the node borders, with
// an explicit arrowhead (PowerPoint renders SVG markers unreliably, so we draw the head as a polygon).
// When `bypass` is set the connector detours through a clear gutter so a skip-rank arrow visibly
// routes around the nodes it would otherwise pass straight through.
function connector(
  from: PlacedNode,
  to: PlacedNode,
  options: {
    color: string;
    dashed: boolean;
    bidirectional: boolean;
    orthogonal: boolean;
    label?: string;
    bypass?: { axis: "over" | "side"; gutter: number };
  }
): string {
  const a = centerOf(from);
  const b = centerOf(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const dash = options.dashed ? ` stroke-dasharray="7 5"` : "";
  const strokeWidth = 2.4;

  let start: Point;
  let end: Point;
  let endDir: Point;
  let startDir: Point;
  let path: string;

  if (options.bypass && options.bypass.axis === "over") {
    // Route over the top (or bottom) gutter: exit the from-edge nearest the gutter and enter the
    // matching to-edge, so the arrow clears every node stacked between the two ranks.
    const gutter = options.bypass.gutter;
    const sy = gutter <= from.y ? from.y : from.y + from.h;
    const ey = gutter <= to.y ? to.y : to.y + to.h;
    start = { x: a.x, y: sy };
    end = { x: b.x, y: ey };
    path = `M${start.x} ${start.y} V${gutter} H${end.x} V${end.y}`;
    endDir = { x: 0, y: gutter <= to.y ? 1 : -1 };
    startDir = { x: 0, y: gutter <= from.y ? -1 : 1 };
  } else if (options.bypass) {
    // Route through a side gutter (left/right of the node band) for top-to-bottom skip arrows.
    const gutter = options.bypass.gutter;
    const sx = gutter >= from.x + from.w ? from.x + from.w : from.x;
    const ex = gutter >= to.x + to.w ? to.x + to.w : to.x;
    start = { x: sx, y: a.y };
    end = { x: ex, y: b.y };
    path = `M${start.x} ${start.y} H${gutter} V${end.y} H${end.x}`;
    endDir = { x: gutter >= to.x + to.w ? -1 : 1, y: 0 };
    startDir = { x: gutter >= from.x + from.w ? 1 : -1, y: 0 };
  } else if (options.orthogonal && horizontal) {
    const sx = dx >= 0 ? from.x + from.w : from.x;
    const ex = dx >= 0 ? to.x : to.x + to.w;
    start = { x: sx, y: a.y };
    end = { x: ex, y: b.y };
    const midX = (sx + ex) / 2;
    path = `M${start.x} ${start.y} H${midX} V${end.y} H${end.x}`;
    endDir = { x: Math.sign(ex - midX) || (dx >= 0 ? 1 : -1), y: 0 };
    startDir = { x: dx >= 0 ? -1 : 1, y: 0 };
  } else if (options.orthogonal) {
    const sy = dy >= 0 ? from.y + from.h : from.y;
    const ey = dy >= 0 ? to.y : to.y + to.h;
    start = { x: a.x, y: sy };
    end = { x: b.x, y: ey };
    const midY = (sy + ey) / 2;
    path = `M${start.x} ${start.y} V${midY} H${end.x} V${end.y}`;
    endDir = { x: 0, y: Math.sign(ey - midY) || (dy >= 0 ? 1 : -1) };
    startDir = { x: 0, y: dy >= 0 ? -1 : 1 };
  } else {
    start = edgePoint(from, b.x, b.y);
    end = edgePoint(to, a.x, a.y);
    const len = Math.hypot(end.x - start.x, end.y - start.y) || 1;
    endDir = { x: (end.x - start.x) / len, y: (end.y - start.y) / len };
    startDir = { x: -endDir.x, y: -endDir.y };
    path = `M${start.x.toFixed(1)} ${start.y.toFixed(1)} L${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
  }

  const parts = [
    `<path d="${path}" fill="none" stroke="${options.color}" stroke-width="${strokeWidth}"${dash} stroke-linejoin="round" stroke-linecap="round" />`,
    arrowHead(end, endDir, options.color)
  ];
  if (options.bidirectional) {
    parts.push(arrowHead(start, startDir, options.color));
  }

  if (options.label) {
    const lx = (start.x + end.x) / 2;
    const ly = (start.y + end.y) / 2;
    const chipW = Math.min(220, options.label.length * 9 + 20);
    parts.push(
      `<rect x="${(lx - chipW / 2).toFixed(1)}" y="${(ly - 13).toFixed(1)}" width="${chipW}" height="22" rx="11" fill="#ffffff" stroke="${options.color}" stroke-opacity="0.35" />`,
      `<text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="600" fill="#334155">${escapeXml(options.label)}</text>`
    );
  }

  return parts.join("");
}

function ponchiNode(node: PlacedNode): string {
  const palette = NODE_COLORS[node.kind];
  const accent = node.accent ?? palette.accent;
  const c = centerOf(node);
  const icon = node.icon ?? node.kind;
  const hasIcon = icon !== "none";
  const labelLines = wrapLabel(node.label, Math.max(8, Math.floor(node.w / 11)));
  const sublabelLines = node.sublabel ? wrapLabel(node.sublabel, Math.max(10, Math.floor(node.w / 8))) : [];
  const iconTop = node.y + 18;
  const labelStartY = c.y - (labelLines.length - 1) * 9 + (hasIcon ? 12 : 0) - (sublabelLines.length ? 6 : 0);

  const parts = [
    // Soft shadow for depth (offset translucent rect; opacity renders reliably in PowerPoint).
    `<rect x="${node.x + 2}" y="${node.y + 4}" width="${node.w}" height="${node.h}" rx="16" fill="#0f172a" fill-opacity="0.06" />`,
    `<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="16" fill="${palette.fill}" stroke="${node.emphasis ? accent : palette.stroke}" stroke-width="${node.emphasis ? 2.4 : 1.4}" />`,
    `<rect x="${node.x}" y="${node.y}" width="${node.w}" height="6" rx="3" fill="${accent}" />`
  ];

  if (hasIcon) {
    parts.push(nodeIconGlyph(icon as PonchiNode["kind"], c.x, iconTop + 6, accent));
  }

  labelLines.forEach((line, index) => {
    parts.push(
      `<text x="${c.x}" y="${(labelStartY + index * 18).toFixed(1)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#0f172a">${escapeXml(line)}</text>`
    );
  });
  sublabelLines.forEach((line, index) => {
    parts.push(
      `<text x="${c.x}" y="${(labelStartY + labelLines.length * 18 + index * 15 + 2).toFixed(1)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="500" fill="#52606d">${escapeXml(line)}</text>`
    );
  });

  return parts.join("");
}

// ---------------------------------------------------------------------------
// Automatic layered layout. When nodes omit x/y, the engine places them so that
// arrows always connect cleanly border-to-border, even for branching (non-linear)
// graphs. This removes the need for agents to compute coordinates by hand (the
// source of dangling/penetrating arrows when a layout is not a simple row).
// ---------------------------------------------------------------------------
const AUTO_NODE_W = 176;
const AUTO_NODE_H = 92;
const AUTO_COL_GAP = 104;
const AUTO_ROW_GAP = 46;
const AUTO_MARGIN = 60;

// Longest-path layering from the arrow graph: sources sit at rank 0 and every target is pushed at
// least one rank past its deepest source. Cycles are bounded by the node count so this terminates.
function diagramRanks(diagram: PonchiDiagram): Map<string, number> {
  const rank = new Map<string, number>();
  for (const node of diagram.nodes) {
    rank.set(node.id, 0);
  }

  const edges = diagram.arrows.filter((arrow) => arrow.from !== arrow.to && rank.has(arrow.from) && rank.has(arrow.to));
  for (let iteration = 0; iteration < diagram.nodes.length; iteration += 1) {
    let changed = false;
    for (const edge of edges) {
      const source = rank.get(edge.from) ?? 0;
      const target = rank.get(edge.to) ?? 0;
      if (target < source + 1) {
        rank.set(edge.to, source + 1);
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }

  // Explicit layer hints win over the derived layering.
  for (const node of diagram.nodes) {
    if (typeof node.layer === "number") {
      rank.set(node.id, node.layer);
    }
  }

  return rank;
}

function placeRanks(ranks: PonchiNode[][], rowsMode: boolean): { nodes: PlacedNode[]; width: number; height: number } {
  const w = AUTO_NODE_W;
  const h = AUTO_NODE_H;
  const rankCount = ranks.length;
  const maxInRank = Math.max(1, ...ranks.map((rank) => rank.length));
  const placed: PlacedNode[] = [];

  if (rowsMode) {
    // Each rank is a row; nodes spread horizontally, ranks stack downward.
    const contentW = maxInRank * w + (maxInRank - 1) * AUTO_COL_GAP;
    const contentH = rankCount * h + (rankCount - 1) * AUTO_ROW_GAP;
    ranks.forEach((rank, rankIndex) => {
      const y = AUTO_MARGIN + rankIndex * (h + AUTO_ROW_GAP);
      const rowW = rank.length * w + (rank.length - 1) * AUTO_COL_GAP;
      const startX = AUTO_MARGIN + (contentW - rowW) / 2;
      rank.forEach((node, columnIndex) => {
        placed.push({ ...node, x: startX + columnIndex * (w + AUTO_COL_GAP), y, w, h });
      });
    });
    return { nodes: placed, width: contentW + 2 * AUTO_MARGIN, height: contentH + 2 * AUTO_MARGIN };
  }

  // Each rank is a column; nodes stack downward, ranks march rightward.
  const contentW = rankCount * w + (rankCount - 1) * AUTO_COL_GAP;
  const contentH = maxInRank * h + (maxInRank - 1) * AUTO_ROW_GAP;
  ranks.forEach((rank, rankIndex) => {
    const x = AUTO_MARGIN + rankIndex * (w + AUTO_COL_GAP);
    const colH = rank.length * h + (rank.length - 1) * AUTO_ROW_GAP;
    const startY = AUTO_MARGIN + (contentH - colH) / 2;
    rank.forEach((node, rowIndex) => {
      placed.push({ ...node, x, y: startY + rowIndex * (h + AUTO_ROW_GAP), w, h });
    });
  });
  return { nodes: placed, width: contentW + 2 * AUTO_MARGIN, height: contentH + 2 * AUTO_MARGIN };
}

function autoLayout(diagram: PonchiDiagram): { nodes: PlacedNode[]; width: number; height: number } {
  const orderIndex = new Map(diagram.nodes.map((node, index) => [node.id, index]));
  const orderWithinRank = (rank: PonchiNode[]): PonchiNode[] =>
    [...rank].sort((a, b) => {
      const laneCompare = (a.lane ?? "").localeCompare(b.lane ?? "");
      return laneCompare !== 0 ? laneCompare : (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0);
    });

  const hasArrows = diagram.arrows.some((arrow) => arrow.from !== arrow.to);
  if (!hasArrows) {
    // No connections: arrange in a near-square grid so a bag of cards reads cleanly.
    const columns = Math.max(1, Math.round(Math.sqrt(diagram.nodes.length)));
    const rows: PonchiNode[][] = [];
    for (let index = 0; index < diagram.nodes.length; index += columns) {
      rows.push(diagram.nodes.slice(index, index + columns));
    }
    return placeRanks(rows, true);
  }

  const rankOf = diagramRanks(diagram);
  const byRank = new Map<number, PonchiNode[]>();
  for (const node of diagram.nodes) {
    const value = rankOf.get(node.id) ?? 0;
    const bucket = byRank.get(value) ?? [];
    bucket.push(node);
    byRank.set(value, bucket);
  }

  const ranks = [...byRank.keys()].sort((a, b) => a - b).map((key) => orderWithinRank(byRank.get(key) ?? []));
  return placeRanks(ranks, diagram.direction === "TB");
}

// Resolve every node to absolute coordinates: hand-placed coordinates pass through unchanged,
// otherwise the auto-layout assigns them and reports the canvas size needed to frame the result.
function resolveLayout(diagram: PonchiDiagram): { nodes: PlacedNode[]; width: number; height: number } {
  const allPlaced = diagram.nodes.every((node) => node.x !== undefined && node.y !== undefined);
  if (allPlaced) {
    return {
      nodes: diagram.nodes.map((node) => ({ ...node, x: node.x ?? 0, y: node.y ?? 0, w: node.w, h: node.h })),
      width: diagram.width,
      height: diagram.height
    };
  }
  return autoLayout(diagram);
}

// Decide whether an arrow needs to detour around intermediate nodes, and through which gutter. A
// direct orthogonal elbow can pass straight through a node that sits between the two ranks (a
// skip-rank arrow); when that happens we route the connector through a clear gutter (over/under for
// left-to-right flows, to the side for top-to-bottom flows) so the connection stays legible. The
// gutter side is chosen to avoid the from/to node's own neighbours, so the detour never re-enters a
// node it just left.
function bypassFor(
  from: PlacedNode,
  to: PlacedNode,
  nodes: PlacedNode[],
  direction: "LR" | "TB",
  canvasWidth: number,
  canvasHeight: number
): { axis: "over" | "side"; gutter: number } | undefined {
  const horizontal = direction !== "TB";
  const fromCx = from.x + from.w / 2;
  const fromCy = from.y + from.h / 2;
  const toCx = to.x + to.w / 2;
  const toCy = to.y + to.h / 2;
  const tolerance = 2;
  const others = nodes.filter((node) => node.id !== from.id && node.id !== to.id);

  // A node "crosses" the elbow when its centre sits between the endpoints on the primary axis and it
  // covers either endpoint's lane on the cross axis (the elbow's two straight runs sit on those lanes).
  const crossingNodes = others.filter((node) => {
    const nodeCx = node.x + node.w / 2;
    const nodeCy = node.y + node.h / 2;
    if (horizontal) {
      const betweenX = nodeCx > Math.min(fromCx, toCx) + tolerance && nodeCx < Math.max(fromCx, toCx) - tolerance;
      const coversLane = (node.y < fromCy && node.y + node.h > fromCy) || (node.y < toCy && node.y + node.h > toCy);
      return betweenX && coversLane;
    }
    const betweenY = nodeCy > Math.min(fromCy, toCy) + tolerance && nodeCy < Math.max(fromCy, toCy) - tolerance;
    const coversLane = (node.x < fromCx && node.x + node.w > fromCx) || (node.x < toCx && node.x + node.w > toCx);
    return betweenY && coversLane;
  });

  if (crossingNodes.length === 0) {
    return undefined;
  }

  // Does `node` have a neighbour in the given direction that an exit toward that gutter would cross?
  const neighbour = (node: PlacedNode, side: "up" | "down" | "left" | "right"): boolean =>
    others.some((other) => {
      if (side === "up" || side === "down") {
        const xOverlap = other.x < node.x + node.w - tolerance && other.x + other.w > node.x + tolerance;
        if (!xOverlap) {
          return false;
        }
        return side === "up" ? other.y + other.h <= node.y + tolerance : other.y >= node.y + node.h - tolerance;
      }
      const yOverlap = other.y < node.y + node.h - tolerance && other.y + other.h > node.y + tolerance;
      if (!yOverlap) {
        return false;
      }
      return side === "left" ? other.x + other.w <= node.x + tolerance : other.x >= node.x + node.w - tolerance;
    });

  if (horizontal) {
    const overClear = !neighbour(from, "up") && !neighbour(to, "up");
    const underClear = !neighbour(from, "down") && !neighbour(to, "down");
    const spread = [from, to, ...crossingNodes];
    const preferOver = overClear || (!underClear && fromCy <= canvasHeight / 2);
    if (preferOver) {
      const gutter = Math.min(...spread.map((node) => node.y)) - AUTO_ROW_GAP * 0.55;
      return { axis: "over", gutter: Math.max(12, gutter) };
    }
    const gutter = Math.max(...spread.map((node) => node.y + node.h)) + AUTO_ROW_GAP * 0.55;
    return { axis: "over", gutter: Math.min(canvasHeight - 12, gutter) };
  }

  const rightClear = !neighbour(from, "right") && !neighbour(to, "right");
  const leftClear = !neighbour(from, "left") && !neighbour(to, "left");
  const spread = [from, to, ...crossingNodes];
  const preferRight = rightClear || (!leftClear && fromCx <= canvasWidth / 2);
  if (preferRight) {
    const gutter = Math.max(...spread.map((node) => node.x + node.w)) + AUTO_COL_GAP * 0.5;
    return { axis: "side", gutter: Math.min(canvasWidth - 12, gutter) };
  }
  const gutter = Math.min(...spread.map((node) => node.x)) - AUTO_COL_GAP * 0.5;
  return { axis: "side", gutter: Math.max(12, gutter) };
}

export function renderPonchiDiagram(input: unknown): { svg: string; summary: string; longDescription: string } {
  const diagram = PonchiDiagramSchema.parse(input);
  const layout = resolveLayout(diagram);
  const placedNodes = layout.nodes;
  const canvasWidth = layout.width;
  const canvasHeight = layout.height;
  const nodesById = new Map(placedNodes.map((node) => [node.id, node]));

  const groups = diagram.groups
    .map((group) => {
      const groupedNodes = group.nodeIds.map((id) => nodesById.get(id)).filter((node): node is PlacedNode => Boolean(node));
      if (groupedNodes.length === 0) {
        return "";
      }

      const minX = Math.min(...groupedNodes.map((node) => node.x)) - 20;
      const minY = Math.min(...groupedNodes.map((node) => node.y)) - 38;
      const maxX = Math.max(...groupedNodes.map((node) => node.x + node.w)) + 20;
      const maxY = Math.max(...groupedNodes.map((node) => node.y + node.h)) + 20;

      return [
        `<rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" rx="20" fill="#f8fafc" fill-opacity="0.7" stroke="#cbd5e1" stroke-dasharray="2 6" stroke-linecap="round" />`,
        `<text x="${minX + 18}" y="${minY + 24}" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#64748b">${escapeXml(group.label)}</text>`
      ].join("");
    })
    .join("");

  const arrows = diagram.arrows
    .map((arrow) => {
      const from = nodesById.get(arrow.from);
      const to = nodesById.get(arrow.to);
      if (!from || !to) {
        return "";
      }

      return connector(from, to, {
        color: "#475569",
        dashed: arrow.dashed,
        bidirectional: arrow.bidirectional,
        orthogonal: arrow.style === "orthogonal",
        label: arrow.label,
        bypass: arrow.style === "orthogonal" ? bypassFor(from, to, placedNodes, diagram.direction, canvasWidth, canvasHeight) : undefined
      });
    })
    .join("");

  const nodes = placedNodes.map((node) => ponchiNode(node)).join("");

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasWidth} ${canvasHeight}" role="img">`,
    `<title>${escapeXml(diagram.title)}</title>`,
    `<desc>${escapeXml(diagram.longDescription)}</desc>`,
    `<rect width="${canvasWidth}" height="${canvasHeight}" fill="#ffffff" />`,
    groups,
    arrows,
    nodes,
    "</svg>"
  ].join("");

  return {
    svg,
    summary: diagram.summary,
    longDescription: diagram.longDescription
  };
}
