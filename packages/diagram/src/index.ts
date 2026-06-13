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
