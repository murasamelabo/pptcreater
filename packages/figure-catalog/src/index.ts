import { access, readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { SlideFragmentSchema, type Frame, type SlideFragment } from "@pptcreater/authoring-contracts";
import type { ComponentResolver } from "@pptcreater/pptx-component-transplant";
import { z } from "zod";

const EditableGroupSchema = z.object({ id: z.string().min(1), axis: z.enum(["x", "y"]), layout: z.enum(["tree", "linear-x", "linear-y", "staircase-x", "radial"]).optional(), parentText: z.string().optional(), members: z.array(z.string()).min(1), connectorBetween: z.boolean().optional(), renumber: z.boolean().optional(), minBoxEmu: z.number().positive().optional() });
const ManifestV1ComponentSchema = z.object({ id: z.string().min(1), kind: z.string().min(1), name: z.string().min(1), sourceSlideIndex: z.number().int().positive(), bestFor: z.array(z.string()).default([]), constraints: z.object({ minItems: z.number().int().nonnegative().optional(), maxItems: z.number().int().positive().optional(), maxLabelChars: z.number().int().positive().optional() }).default({}), editableGroups: z.array(EditableGroupSchema).default([]) });
const ManifestV1Schema = z.object({ id: z.string().min(1), name: z.string().min(1), description: z.string(), version: z.string(), sourcePptx: z.string().min(1), components: z.array(ManifestV1ComponentSchema) });

export const FigureDataShapeSchema = z.enum(["sequence", "comparison", "hierarchy", "relationship", "matrix", "cycle", "timeline", "list", "formula", "custom"]);
export type FigureDataShape = z.infer<typeof FigureDataShapeSchema>;

export const FigureCatalogEntrySchema = z.object({
  id: z.string().min(1), packId: z.string().min(1), packName: z.string().min(1), kind: z.string().min(1), name: z.string().min(1), sourcePptxPath: z.string().min(1), sourceSlideIndex: z.number().int().positive(), sourceVersion: z.string().min(1), bestFor: z.array(z.string()), avoidWhen: z.array(z.string()), dataShape: FigureDataShapeSchema, constraints: ManifestV1ComponentSchema.shape.constraints, editableGroups: z.array(EditableGroupSchema), editability: z.object({ text: z.boolean(), addRemove: z.boolean(), reorder: z.boolean(), recolor: z.boolean() }), toneSupport: z.enum(["light", "dark", "both"]), referencePreview: z.string().optional(), metadataConfidence: z.enum(["inferred", "reviewed"])
});
export type FigureCatalogEntry = z.infer<typeof FigureCatalogEntrySchema>;

function inferDataShape(kind: string): FigureDataShape {
  if (/flow|step/u.test(kind)) return "sequence";
  if (/comparison|before-after|contrast/u.test(kind)) return "comparison";
  if (/tree|layer|pyramid/u.test(kind)) return "hierarchy";
  if (/matrix|correlation|scale/u.test(kind)) return "matrix";
  if (/cycle/u.test(kind)) return "cycle";
  if (/gantt|timeline/u.test(kind)) return "timeline";
  if (/venn|relationship|map/u.test(kind)) return "relationship";
  if (/list|ranking/u.test(kind)) return "list";
  if (/formula/u.test(kind)) return "formula";
  return "custom";
}

function inferredAvoidWhen(shape: FigureDataShape): string[] {
  const common = ["long prose", "unknown relationship"];
  if (shape === "sequence") return [...common, "peer categories without order"];
  if (shape === "comparison") return [...common, "single option"];
  if (shape === "matrix") return [...common, "missing explicit axes"];
  if (shape === "hierarchy") return [...common, "flat list"];
  return common;
}

async function manifestPaths(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => resolve(root, entry.name, "manifest.json"));
  } catch { return []; }
}

export async function loadFigureCatalog(options: { roots?: string[] } = {}): Promise<FigureCatalogEntry[]> {
  const roots = options.roots ?? [resolve(process.cwd(), "design-packs")];
  const paths = (await Promise.all(roots.map(manifestPaths))).flat();
  const entries: FigureCatalogEntry[] = [];
  for (const manifestPath of paths) {
    try { await access(manifestPath); } catch { continue; }
    const manifest = ManifestV1Schema.parse(JSON.parse((await readFile(manifestPath, "utf8")).replace(/^\uFEFF/u, "")));
    const sourcePptxPath = resolve(dirname(manifestPath), manifest.sourcePptx);
    for (const component of manifest.components) {
      const dataShape = inferDataShape(component.kind);
      const editable = component.editableGroups.length > 0;
      entries.push(FigureCatalogEntrySchema.parse({ ...component, packId: manifest.id, packName: manifest.name, sourcePptxPath, sourceVersion: manifest.version, avoidWhen: inferredAvoidWhen(dataShape), dataShape, editability: { text: true, addRemove: editable, reorder: editable, recolor: true }, toneSupport: "both", metadataConfidence: "inferred" }));
    }
  }
  return entries.sort((a, b) => a.packId.localeCompare(b.packId) || a.sourceSlideIndex - b.sourceSlideIndex);
}

export type FigureSearchQuery = { semanticNeed?: string; dataShape?: FigureDataShape; itemCount?: number; tone?: "light" | "dark"; limit?: number };
export function searchFigures(catalog: FigureCatalogEntry[], query: FigureSearchQuery): FigureCatalogEntry[] {
  const terms = (query.semanticNeed ?? "").toLowerCase().split(/\s+|[、。・／/]/u).filter((term) => term.length >= 2);
  return catalog
    .filter((entry) => !query.dataShape || entry.dataShape === query.dataShape)
    .filter((entry) => query.itemCount === undefined || ((entry.constraints.minItems ?? 0) <= query.itemCount && (entry.constraints.maxItems ?? Number.POSITIVE_INFINITY) >= query.itemCount))
    .filter((entry) => !query.tone || entry.toneSupport === "both" || entry.toneSupport === query.tone)
    .map((entry) => {
      const searchable = [entry.name, entry.kind, ...entry.bestFor].join(" ").toLowerCase();
      return { entry, score: terms.reduce((score, term) => score + (searchable.includes(term) ? 1 : 0), 0) };
    })
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
    .slice(0, query.limit ?? 12)
    .map(({ entry }) => entry);
}

export type FigureInstanceContent = { labels: string[]; sourceRefs?: string[]; replacements?: Record<string, string> };
export function instantiateFigure(entryInput: FigureCatalogEntry, content: FigureInstanceContent, frame: Frame): SlideFragment {
  const entry = FigureCatalogEntrySchema.parse(entryInput);
  const count = content.labels.length;
  if (entry.constraints.minItems !== undefined && count < entry.constraints.minItems) throw new Error(`${entry.id} requires at least ${entry.constraints.minItems} items.`);
  if (entry.constraints.maxItems !== undefined && count > entry.constraints.maxItems) throw new Error(`${entry.id} supports at most ${entry.constraints.maxItems} items.`);
  if (entry.constraints.maxLabelChars !== undefined) {
    const tooLong = content.labels.find((label) => [...label].length > entry.constraints.maxLabelChars!);
    if (tooLong) throw new Error(`${entry.id} label exceeds ${entry.constraints.maxLabelChars} characters: ${tooLong}`);
  }
  const group = entry.editableGroups[0];
  const replacements = { ...(content.replacements ?? {}) };
  if (group) group.members.slice(0, count).forEach((member, index) => { replacements[member] = content.labels[index]; });
  const operations = group && count < group.members.length ? group.members.slice(count).map((member) => ({ op: "remove" as const, target: member })) : [];
  const command = { id: `${entry.id}-component`, kind: "importPptxComponent" as const, componentId: entry.id, frame, sourceRefs: content.sourceRefs ?? [], replacements, operations };
  return SlideFragmentSchema.parse({ id: `${entry.id}-fragment`, bounds: frame, commands: [command], editModel: [{ id: `${entry.id}-text`, commandIds: [command.id], capability: "edit-text" }, ...(entry.editability.reorder ? [{ id: `${entry.id}-order`, commandIds: [command.id], capability: "reorder" as const, groupId: group?.id }] : [])], sourceRefs: content.sourceRefs ?? [], accessibility: { summary: entry.name, longDescription: `${entry.name}: ${content.labels.join(" -> ")}`, readingOrder: [command.id] }, constraints: entry.constraints });
}

export function validateFigureInstance(fragmentInput: SlideFragment, entryInput: FigureCatalogEntry): string[] {
  const fragment = SlideFragmentSchema.parse(fragmentInput);
  const entry = FigureCatalogEntrySchema.parse(entryInput);
  const issues: string[] = [];
  if (fragment.commands.length !== 1 || fragment.commands[0].kind !== "importPptxComponent") issues.push("Catalog fragments must contain exactly one importPptxComponent command.");
  else if (fragment.commands[0].componentId !== entry.id) issues.push(`Fragment component ${fragment.commands[0].componentId} does not match ${entry.id}.`);
  if (!fragment.sourceRefs.length) issues.push("Figure instance has no source references.");
  return issues;
}

export function createCatalogComponentResolver(catalog: FigureCatalogEntry[]): ComponentResolver {
  const entries = new Map(catalog.map((entry) => [entry.id, entry]));
  return async (componentId) => {
    const entry = entries.get(componentId);
    return entry ? { componentId: entry.id, templatePath: entry.sourcePptxPath, sourceSlideIndex: entry.sourceSlideIndex } : undefined;
  };
}
