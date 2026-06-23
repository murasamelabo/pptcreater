import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { defaultTokens } from "./color.js";
import { DeckSpecSchema, type DeckSpec, type PptxSlideTextReplacement, type PptxSlideNodeOperation } from "./schema.js";

export const DesignComponentConstraintsSchema = z.object({
  minItems: z.number().int().min(0).optional(),
  maxItems: z.number().int().min(1).optional(),
  maxLabelChars: z.number().int().min(1).optional()
});

export const DesignComponentEditableGroupSchema = z.object({
  id: z.string().min(1),
  axis: z.enum(["x", "y"]),
  layout: z.enum(["tree", "linear-x", "linear-y", "staircase-x", "radial"]).optional(),
  parentText: z.string().optional(),
  members: z.array(z.string().min(1)).min(1),
  connectorBetween: z.boolean().optional(),
  renumber: z.boolean().optional(),
  minBoxEmu: z.number().int().positive().optional()
});

export const DesignComponentSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  name: z.string().min(1),
  sourceSlideIndex: z.number().int().positive(),
  bestFor: z.array(z.string().min(1)).default([]),
  constraints: DesignComponentConstraintsSchema.default({}),
  editableGroups: z.array(DesignComponentEditableGroupSchema).default([])
});

export const DesignAssetPackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  version: z.string().min(1),
  sourcePptx: z.string().min(1),
  components: z.array(DesignComponentSchema).min(1)
});

export type DesignAssetPack = z.infer<typeof DesignAssetPackSchema>;
export type DesignComponent = z.infer<typeof DesignComponentSchema> & {
  packId: string;
  packName: string;
  sourcePptxPath: string;
  manifestPath: string;
};

function defaultDesignPackRoots(): string[] {
  return [resolve(process.cwd(), "design-packs")];
}

async function readDesignPack(manifestPath: string): Promise<DesignComponent[]> {
  const pack = DesignAssetPackSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  const sourcePptxPath = resolve(dirname(manifestPath), pack.sourcePptx);
  return pack.components.map((component) => ({
    ...component,
    packId: pack.id,
    packName: pack.name,
    sourcePptxPath,
    manifestPath
  }));
}

async function discoverManifestPaths(root: string): Promise<string[]> {
  let entries: Array<{ name: string; isDirectory: () => boolean }>; 
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(root, entry.name, "manifest.json"))
    .filter((path) => existsSync(path));
}

export async function listDesignComponents(options: { kind?: string; roots?: string[] } = {}): Promise<DesignComponent[]> {
  const roots = options.roots ?? defaultDesignPackRoots();
  const manifestLists = await Promise.all(roots.map((root) => discoverManifestPaths(root)));
  const manifests = manifestLists.flat();
  const components = (await Promise.all(manifests.map((manifest) => readDesignPack(manifest)))).flat();
  return options.kind ? components.filter((component) => component.kind === options.kind) : components;
}

export async function getDesignComponent(componentId: string, options: { roots?: string[] } = {}): Promise<DesignComponent | undefined> {
  return (await listDesignComponents(options)).find((component) => component.id === componentId);
}

export async function renderDesignComponentDeck(
  componentId: string,
  options: {
    title?: string;
    roots?: string[];
    textReplacements?: PptxSlideTextReplacement[];
    nodeOperations?: PptxSlideNodeOperation[];
  } = {}
): Promise<DeckSpec> {
  const component = await getDesignComponent(componentId, { roots: options.roots });
  if (!component) {
    throw new Error(`Design component "${componentId}" was not found.`);
  }
  const tokens = defaultTokens("ja-JP");
  return DeckSpecSchema.parse({
    version: "0.1",
    title: options.title ?? component.name,
    locale: "ja-JP",
    template: "modern-simple",
    tokens: {
      ...tokens,
      colors: {
        ...tokens.colors,
        background: "#ffffff",
        surface: "#f8fafc",
        text: "#111827",
        mutedText: "#334155",
        accent: "#2563eb"
      }
    },
    slideSize: { widthInches: 13.333, heightInches: 7.5, aspect: "16:9" },
    slides: [
      {
        id: component.id,
        title: options.title ?? component.name,
        layout: "design-component",
        background: { color: "#ffffff" },
        speakerNotes: `${component.name}: ${component.bestFor.join(" / ")}`,
        elements: [
          {
            id: `${component.id}-slide`,
            type: "pptxSlide",
            templatePath: component.sourcePptxPath,
            sourceSlideIndex: component.sourceSlideIndex,
            ...(options.textReplacements && options.textReplacements.length > 0
              ? { textReplacements: options.textReplacements }
              : {}),
            ...(component.editableGroups.length > 0 ? { nodeGroups: component.editableGroups } : {}),
            ...(options.nodeOperations && options.nodeOperations.length > 0
              ? { nodeOperations: options.nodeOperations }
              : {}),
            x: 0,
            y: 0,
            w: 13.333,
            h: 7.5,
            decorative: false,
            summary: component.name,
            longDescription: `A curated tree diagram slide component from ${component.packName}. Best for: ${component.bestFor.join(", ")}.`,
            altText: component.name,
            readingOrder: 1
          }
        ]
      }
    ],
    metadata: {
      contentMode: "presentation",
      keywords: [component.kind, component.id, component.packId],
      sources: []
    }
  });
}
