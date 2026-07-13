import { createHash } from "node:crypto";
import { z } from "zod";

export { renderDirectAuthoringSpike, type DirectSpikeOptions } from "./directSpike.js";

export const SourceKindSchema = z.enum(["heading", "paragraph", "list-item", "table", "code", "quote", "image", "citation"]);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const SourceAnchorSchema = z.object({
  id: z.string().min(1),
  sourceUri: z.string().min(1),
  structuralPath: z.array(z.string().min(1)),
  kind: SourceKindSchema,
  normalizedContentHash: z.string().regex(/^[a-f0-9]{16}$/u),
  occurrence: z.number().int().nonnegative(),
  previousId: z.string().min(1).optional()
});
export type SourceAnchor = z.infer<typeof SourceAnchorSchema>;

function normalizeSourceContent(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function shortHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

export function createSourceAnchor(input: {
  sourceUri: string;
  structuralPath: string[];
  kind: SourceKind;
  content: string;
  occurrence?: number;
  previousId?: string;
}): SourceAnchor {
  const normalizedContentHash = shortHash(normalizeSourceContent(input.content));
  const occurrence = input.occurrence ?? 0;
  const identity = [input.sourceUri, input.structuralPath.join("/"), input.kind, normalizedContentHash, occurrence].join("\u001f");
  return SourceAnchorSchema.parse({
    id: `src_${shortHash(identity)}`,
    sourceUri: input.sourceUri,
    structuralPath: input.structuralPath,
    kind: input.kind,
    normalizedContentHash,
    occurrence,
    previousId: input.previousId
  });
}

export const FrameSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive()
});
export type Frame = z.infer<typeof FrameSchema>;

const CommandBaseSchema = z.object({
  id: z.string().min(1),
  frame: FrameSchema,
  sourceRefs: z.array(z.string().min(1)).default([])
});

export const DrawCommandSchema = z.discriminatedUnion("kind", [
  CommandBaseSchema.extend({ kind: z.literal("text"), text: z.string(), role: z.enum(["title", "message", "body", "label", "caption"]), style: z.record(z.string(), z.unknown()).default({}) }),
  CommandBaseSchema.extend({ kind: z.literal("shape"), shape: z.enum(["rect", "roundRect", "ellipse", "line", "arrow"]), style: z.record(z.string(), z.unknown()).default({}) }),
  CommandBaseSchema.extend({ kind: z.literal("image"), source: z.string().min(1), fit: z.enum(["contain", "cover"]).default("contain"), altText: z.string().min(1) }),
  CommandBaseSchema.extend({ kind: z.literal("connector"), from: z.string().min(1), to: z.string().min(1), label: z.string().optional(), style: z.record(z.string(), z.unknown()).default({}) }),
  CommandBaseSchema.extend({ kind: z.literal("group"), childIds: z.array(z.string().min(1)).min(1) }),
  CommandBaseSchema.extend({
    kind: z.literal("importPptxComponent"),
    componentId: z.string().min(1),
    replacements: z.record(z.string(), z.string()).default({}),
    operations: z.array(z.object({ op: z.enum(["add", "remove", "reorder"]), target: z.string().min(1), value: z.string().optional(), at: z.number().int().nonnegative().optional() })).default([])
  })
]);
export type DrawCommand = z.infer<typeof DrawCommandSchema>;

export const EditDescriptorSchema = z.object({
  id: z.string().min(1),
  commandIds: z.array(z.string().min(1)).min(1),
  capability: z.enum(["edit-text", "move", "resize", "recolor", "add-item", "remove-item", "reorder"]),
  groupId: z.string().optional()
});
export type EditDescriptor = z.infer<typeof EditDescriptorSchema>;

export const SlideFragmentSchema = z.object({
  id: z.string().min(1),
  commands: z.array(DrawCommandSchema).min(1),
  editModel: z.array(EditDescriptorSchema).default([]),
  bounds: FrameSchema,
  sourceRefs: z.array(z.string().min(1)).default([]),
  accessibility: z.object({ summary: z.string().min(1), longDescription: z.string().min(1), readingOrder: z.array(z.string().min(1)).default([]) }),
  constraints: z.object({ minItems: z.number().int().nonnegative().optional(), maxItems: z.number().int().positive().optional(), maxLabelChars: z.number().int().positive().optional() }).default({})
});
export type SlideFragment = z.infer<typeof SlideFragmentSchema>;

export const DesignBriefSchema = z.object({
  id: z.string().min(1),
  locale: z.enum(["ja-JP", "en-US"]),
  templateId: z.string().optional(),
  mood: z.array(z.string().min(1)).default([]),
  paletteRoles: z.record(z.string(), z.string()).default({}),
  typography: z.object({ headingFont: z.string().min(1), bodyFont: z.string().min(1), cjkFallbacks: z.array(z.string().min(1)).default([]) }),
  spacing: z.object({ gridInches: z.number().positive(), marginInches: z.number().positive(), whitespace: z.enum(["compact", "balanced", "generous"]) }),
  density: z.object({ targetVisibleChars: z.number().int().positive(), maxVisibleChars: z.number().int().positive() }),
  do: z.array(z.string()).default([]),
  dont: z.array(z.string()).default([]),
  referenceAssets: z.array(z.string()).default([])
});
export type DesignBrief = z.infer<typeof DesignBriefSchema>;

export const VisualDefectSchema = z.enum(["overlap", "truncation", "distortion", "contrast", "alignment", "bad-line-break", "missing-media", "semantic-figure-mismatch"]);
export type VisualDefect = z.infer<typeof VisualDefectSchema>;

export const CriticRequestSchema = z.object({
  manuscriptPath: z.string().min(1),
  programManifestPath: z.string().min(1),
  slidePngPaths: z.array(z.string().min(1)),
  pptxPath: z.string().min(1),
  sourceNotebookPath: z.string().min(1),
  designBrief: DesignBriefSchema
});
export type CriticRequest = z.infer<typeof CriticRequestSchema>;

export const CriticResponseSchema = z.object({
  defects: z.array(z.object({ type: VisualDefectSchema, slideId: z.string().min(1), severity: z.enum(["blocking", "advisory"]), evidence: z.string().min(1) })),
  scores: z.record(z.string(), z.number().min(0).max(100)),
  slideFindings: z.array(z.object({ slideId: z.string().min(1), findings: z.array(z.string().min(1)) })),
  revisionBriefs: z.array(z.object({ programSourceId: z.string().min(1), reason: z.string().min(1), requestedOutcome: z.string().min(1) })),
  humanReviewNeeded: z.boolean()
});
export type CriticResponse = z.infer<typeof CriticResponseSchema>;

export const BenchmarkScenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  source: z.object({ path: z.string().min(1), sha256: z.string().regex(/^[A-Fa-f0-9]{64}$/u).optional(), availability: z.enum(["repo", "external-required", "to-create"]) }),
  baselines: z.object({ legacy: z.string().optional(), direct: z.string().optional() }).default({}),
  dimensions: z.array(z.enum(["flow", "information-density", "clarity", "aesthetics", "source-fidelity", "figure-fit", "editability", "generation-time"])).min(1)
});

export const BenchmarkManifestSchema = z.object({
  version: z.literal("1.0"),
  scenarios: z.array(BenchmarkScenarioSchema).min(6),
  humanGate: z.object({ minimumRaters: z.number().int().min(5), pairwisePreferenceThreshold: z.number().min(0.5).max(1), agreementTarget: z.number().min(0).max(1) }),
  releaseGate: z.object({ minimumScenarioWins: z.number().int().positive(), blockingDefects: z.literal(0), sectionCoverage: z.literal(1), requiredTermCoverage: z.literal(1), unexplainedOmissions: z.literal(0) })
});
export type BenchmarkManifest = z.infer<typeof BenchmarkManifestSchema>;
