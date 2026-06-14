import { z } from "zod";

export const DiagramNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  x: z.number().min(0),
  y: z.number().min(0),
  w: z.number().positive().default(160),
  h: z.number().positive().default(72),
  kind: z.enum(["actor", "system", "process", "data", "note"]).default("process")
});

export const DiagramArrowSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional()
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
  });

export type PonchiDiagram = z.infer<typeof PonchiDiagramSchema>;

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

const NODE_COLORS: Record<PonchiDiagram["nodes"][number]["kind"], string> = {
  actor: "#dbeafe",
  system: "#e0f2fe",
  process: "#ffffff",
  data: "#dcfce7",
  note: "#fef9c3"
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapLabel(value: string, maxChars = 14): string[] {
  if (value.length <= maxChars) {
    return [value];
  }

  const lines: string[] = [];
  for (let index = 0; index < value.length; index += maxChars) {
    lines.push(value.slice(index, index + maxChars));
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


function centerOf(node: PonchiDiagram["nodes"][number]): { x: number; y: number } {
  return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
}

export function renderPonchiDiagram(input: unknown): { svg: string; summary: string; longDescription: string } {
  const diagram = PonchiDiagramSchema.parse(input);
  const nodesById = new Map(diagram.nodes.map((node) => [node.id, node]));

  const defs = [
    "<defs>",
    "<marker id=\"arrow\" markerWidth=\"12\" markerHeight=\"12\" refX=\"10\" refY=\"6\" orient=\"auto\">",
    "<path d=\"M2,2 L10,6 L2,10 z\" fill=\"#334155\" />",
    "</marker>",
    "</defs>"
  ].join("");

  const groups = diagram.groups
    .map((group) => {
      const groupedNodes = group.nodeIds.map((id) => nodesById.get(id)).filter((node): node is NonNullable<typeof node> => Boolean(node));
      if (groupedNodes.length === 0) {
        return "";
      }

      const minX = Math.min(...groupedNodes.map((node) => node.x)) - 16;
      const minY = Math.min(...groupedNodes.map((node) => node.y)) - 30;
      const maxX = Math.max(...groupedNodes.map((node) => node.x + node.w)) + 16;
      const maxY = Math.max(...groupedNodes.map((node) => node.y + node.h)) + 16;

      return [
        `<rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" rx="16" fill="#f8fafc" stroke="#cbd5e1" stroke-dasharray="6 4" />`,
        `<text x="${minX + 12}" y="${minY + 20}" font-family="Arial, sans-serif" font-size="14" fill="#334155">${escapeXml(group.label)}</text>`
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

      const start = centerOf(from);
      const end = centerOf(to);
      const labelX = (start.x + end.x) / 2;
      const labelY = (start.y + end.y) / 2 - 8;

      return [
        `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="#334155" stroke-width="2" marker-end="url(#arrow)" />`,
        arrow.label
          ? `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="#334155">${escapeXml(arrow.label)}</text>`
          : ""
      ].join("");
    })
    .join("");

  const nodes = diagram.nodes
    .map((node) => {
      return [
        `<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="14" fill="${NODE_COLORS[node.kind]}" stroke="#64748b" />`,
        `<text x="${node.x + node.w / 2}" y="${node.y + node.h / 2 + 5}" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#0f172a">${escapeXml(node.label)}</text>`
      ].join("");
    })
    .join("");

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${diagram.width} ${diagram.height}" role="img">`,
    `<title>${escapeXml(diagram.title)}</title>`,
    `<desc>${escapeXml(diagram.longDescription)}</desc>`,
    `<rect width="${diagram.width}" height="${diagram.height}" fill="#ffffff" />`,
    defs,
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
