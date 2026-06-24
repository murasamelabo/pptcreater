import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { defaultTokens } from "./color.js";
import { DeckSpecSchema, type DeckSpec, type PptxSlideTextReplacement, type PptxSlideNodeOperation, type PptxSlideColorReplacement } from "./schema.js";

/** Built-in color tones for design-component figures so a curated light figure can fit a dark deck. */
export type DesignComponentTone = "light" | "dark";

/**
 * Per-tone backdrop + recolor defaults. Curated design-pack figures are authored on a light
 * (`#F4F7FC`) slide background that is NOT carried when the figure is transplanted into another
 * deck, so the figure must bring its own backdrop to stay readable. The `dark` tone supplies a dark
 * backdrop and lightens the figure's dark catalog title/heading text (a collision-free hue in the
 * zukai/tree packs) so it reads on dark.
 */
const DESIGN_COMPONENT_TONES: Record<DesignComponentTone, { background: string; recolor: PptxSlideColorReplacement[] }> = {
  light: { background: "#F4F7FC", recolor: [] },
  dark: {
    background: "#0E2233",
    recolor: [
      { from: "#16243B", to: "#EAF1F8", scope: "all" },
      { from: "#1A1A1A", to: "#EAF1F8", scope: "text" },
      { from: "#111827", to: "#EAF1F8", scope: "text" },
      { from: "#000000", to: "#EAF1F8", scope: "text" }
    ]
  }
};


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
    /** Color tone for the figure backdrop + text re-tone. Defaults to "light". */
    tone?: DesignComponentTone;
    /** Explicit full-bleed backdrop color, or "none" to skip it (inherit the deck/template). Overrides the tone backdrop. */
    background?: string;
    /** Extra color remaps applied to the transplanted figure, merged after the tone defaults. */
    recolor?: Array<{ from: string; to: string; scope?: "all" | "text" | "fill" }>;
  } = {}
): Promise<DeckSpec> {
  const component = await getDesignComponent(componentId, { roots: options.roots });
  if (!component) {
    throw new Error(`Design component "${componentId}" was not found.`);
  }
  const tokens = defaultTokens("ja-JP");
  const tone = options.tone ?? "light";
  const toneDefaults = DESIGN_COMPONENT_TONES[tone];
  // The backdrop the figure sits on: an explicit `background` wins; "none" inherits the deck/template;
  // otherwise the tone backdrop. The figure's own slide background is not transplanted, so without a
  // backdrop element a light figure would render on whatever the deck template provides.
  const backdropColor =
    options.background === "none" ? undefined : (options.background ?? toneDefaults.background);
  // An explicitly provided `recolor` REPLACES the tone defaults (pass [] to disable re-coloring the
  // figure entirely, e.g. when the catalog title hue is also used for card-body text); when omitted,
  // the tone's default recolor is used.
  const recolor = options.recolor !== undefined ? options.recolor : toneDefaults.recolor;
  const isDark = tone === "dark";
  const slideTextColor = isDark ? "#f8fafc" : "#111827";
  const backdropElement = backdropColor
    ? [
        {
          id: `${component.id}-backdrop`,
          type: "shape" as const,
          shape: "rect" as const,
          x: 0,
          y: 0,
          w: 13.333,
          h: 7.5,
          fill: backdropColor,
          decorative: true,
          readingOrder: 0
        }
      ]
    : [];
  return DeckSpecSchema.parse({
    version: "0.1",
    title: options.title ?? component.name,
    locale: "ja-JP",
    template: "modern-simple",
    tokens: {
      ...tokens,
      colors: {
        ...tokens.colors,
        background: backdropColor ?? "#ffffff",
        surface: isDark ? "#13314a" : "#f8fafc",
        text: slideTextColor,
        mutedText: isDark ? "#c6d4e4" : "#334155",
        accent: "#2563eb"
      }
    },
    slideSize: { widthInches: 13.333, heightInches: 7.5, aspect: "16:9" },
    slides: [
      {
        id: component.id,
        title: options.title ?? component.name,
        layout: "design-component",
        ...(backdropColor ? { background: { color: backdropColor } } : {}),
        speakerNotes: `${component.name}: ${component.bestFor.join(" / ")}`,
        elements: [
          ...backdropElement,
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
            ...(recolor.length > 0 ? { recolor } : {}),
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
