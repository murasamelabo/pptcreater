import { z } from "zod";

export const LocaleSchema = z.enum(["ja-JP", "en-US"]);
export const ContentModeSchema = z.enum(["presentation", "report", "technical", "handout", "decision"]);

export const HexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/, "Expected a hex color such as #123abc");

export const ExternalHyperlinkSchema = z.string().url().refine(
  (value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  },
  { message: "Expected an http(s) URL" }
);

export const TypographyTokensSchema = z.object({
  headingFont: z.string().min(1),
  bodyFont: z.string().min(1),
  fallbackFonts: z.array(z.string().min(1)).default([]),
  titleSize: z.number().min(24).default(36),
  bodySize: z.number().min(16).default(24),
  captionSize: z.number().min(10).default(14)
});

export const ColorTokensSchema = z.object({
  background: HexColorSchema,
  surface: HexColorSchema,
  text: HexColorSchema,
  mutedText: HexColorSchema,
  accent: HexColorSchema,
  danger: HexColorSchema,
  success: HexColorSchema
});

export const SpacingTokensSchema = z.object({
  margin: z.number().positive().default(0.5),
  gutter: z.number().positive().default(0.24),
  radius: z.number().nonnegative().default(0.08)
});

export const DesignTokensSchema = z.object({
  colors: ColorTokensSchema,
  typography: TypographyTokensSchema,
  spacing: SpacingTokensSchema
});

export const SlideSizeSchema = z.object({
  widthInches: z.number().positive(),
  heightInches: z.number().positive(),
  aspect: z.string().optional()
});

export const HeaderFooterSchema = z.object({
  showFooter: z.boolean().default(false),
  footerText: z.string().optional(),
  showSlideNumber: z.boolean().default(false),
  showDate: z.boolean().default(false),
  dateText: z.string().optional()
});

export const SlideBackgroundSchema = z
  .object({
    color: HexColorSchema.optional(),
    imageDataUri: z.string().min(1).optional()
  })
  .refine((value) => Boolean(value.color || value.imageDataUri), {
    message: "Slide background requires color or imageDataUri"
  });

export const ScaffoldTextBoxSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  w: z.number().positive(),
  h: z.number().positive(),
  fontSize: z.number().positive().optional(),
  color: HexColorSchema.optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  bold: z.boolean().optional()
});

export const ScaffoldImageSchema = z.object({
  dataUri: z.string().min(1),
  x: z.number().min(0),
  y: z.number().min(0),
  w: z.number().positive(),
  h: z.number().positive(),
  altText: z.string().optional()
});

export const TemplateScaffoldSlideSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  background: SlideBackgroundSchema.optional(),
  logos: z.array(ScaffoldImageSchema).default([]),
  titleBox: ScaffoldTextBoxSchema.optional(),
  subtitleBox: ScaffoldTextBoxSchema.optional()
});

export type SlideSize = z.infer<typeof SlideSizeSchema>;
export type HeaderFooter = z.infer<typeof HeaderFooterSchema>;
export type SlideBackground = z.infer<typeof SlideBackgroundSchema>;
export type ScaffoldTextBox = z.infer<typeof ScaffoldTextBoxSchema>;
export type ScaffoldImage = z.infer<typeof ScaffoldImageSchema>;
export type TemplateScaffoldSlide = z.infer<typeof TemplateScaffoldSlideSchema>;

export const PowerPointTemplatePackageSchema = z.object({
  extension: z.enum([".pptx", ".potx", ".pptm", ".potm"]),
  dataUri: z.string().min(1),
  titleLayoutPath: z.string().min(1).optional(),
  contentLayoutPath: z.string().min(1).optional(),
  closingLayoutPath: z.string().min(1).optional()
});

export type PowerPointTemplatePackage = z.infer<typeof PowerPointTemplatePackageSchema>;

export const AccessibilityMetadataSchema = z.object({
  title: z.string().min(1),
  language: LocaleSchema,
  readingOrder: z.array(z.string().min(1)).default([]),
  longDescription: z.string().optional()
});

const ElementBaseSchema = z.object({
  id: z.string().min(1),
  x: z.number().min(0),
  y: z.number().min(0),
  w: z.number().positive(),
  h: z.number().nonnegative(),
  readingOrder: z.number().int().nonnegative().optional(),
  decorative: z.boolean().default(false),
  altText: z.string().optional(),
  sourceId: z.string().optional(),
  citation: z.string().optional(),
  hyperlink: ExternalHyperlinkSchema.optional()
});

export const TextElementSchema = ElementBaseSchema.extend({
  type: z.literal("text"),
  h: z.number().positive(),
  role: z.enum(["title", "subtitle", "body", "caption", "callout"]).default("body"),
  text: z.string().min(1),
  fontSize: z.number().positive().optional(),
  color: HexColorSchema.optional(),
  contrastBackground: HexColorSchema.optional(),
  bold: z.boolean().default(false),
  characterSpacing: z.number().min(-10).max(20).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  valign: z.enum(["top", "middle", "bottom"]).optional()
});

export const ShapeElementSchema = ElementBaseSchema.extend({
  type: z.literal("shape"),
  decorative: z.boolean().default(true),
  shape: z.enum(["rect", "roundRect", "roundedRect", "ellipse", "oval", "line", "rightArrow", "arrow"]).default("rect"),
  fill: z.union([HexColorSchema, z.literal("none")]).default("none"),
  fillOpacity: z.number().min(0).max(1).optional(),
  line: z
    .object({
      color: HexColorSchema.optional(),
      width: z.number().positive().optional(),
      dash: z.enum(["solid", "dash", "dashDot"]).optional(),
      beginArrowType: z.enum(["none", "arrow", "diamond", "oval", "stealth", "triangle"]).optional(),
      endArrowType: z.enum(["none", "arrow", "diamond", "oval", "stealth", "triangle"]).optional()
    })
    .optional(),
  radius: z.number().nonnegative().optional()
}).superRefine((element, context) => {
  if (element.shape !== "line" && element.h <= 0) {
    context.addIssue({
      code: "custom",
      message: "Only line shapes may use h = 0. Non-line shapes require positive height.",
      path: ["h"]
    });
  }
});

export const SvgElementSchema = ElementBaseSchema.extend({
  type: z.literal("svg"),
  h: z.number().positive(),
  svg: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional()
});

export const ImageElementSchema = ElementBaseSchema.extend({
  type: z.literal("image"),
  h: z.number().positive(),
  path: z.string().optional(),
  dataUri: z.string().optional(),
  description: z.string().optional()
}).refine((value) => value.path || value.dataUri, {
  message: "Image elements require either path or dataUri"
});

export const DiagramElementSchema = ElementBaseSchema.extend({
  type: z.literal("diagram"),
  h: z.number().positive(),
  svg: z.string().min(1),
  summary: z.string().min(1),
  longDescription: z.string().min(1)
});

export const SmartArtElementSchema = ElementBaseSchema.extend({
  type: z.literal("smartart"),
  h: z.number().positive(),
  templatePath: z.string().min(1).optional(),
  templateDataUri: z.string().min(1).optional(),
  sourceSlideIndex: z.number().int().positive().default(1),
  summary: z.string().min(1),
  longDescription: z.string().min(1)
}).refine((value) => value.templatePath || value.templateDataUri, {
  message: "SmartArt elements require templatePath or templateDataUri"
});

export const PptxSlideTextReplacementSchema = z.union([
  z.object({
    match: z.string().min(1),
    to: z.string()
  }),
  z.object({
    at: z.number().int().min(0),
    to: z.string()
  })
]);

export const PptxSlideNodeGroupSchema = z.object({
  id: z.string().min(1),
  axis: z.enum(["x", "y"]),
  layout: z.enum(["tree", "linear-x", "linear-y", "staircase-x", "radial"]).optional(),
  parentText: z.string().optional(),
  members: z.array(z.string().min(1)).min(1),
  connectorBetween: z.boolean().optional(),
  renumber: z.boolean().optional(),
  minBoxEmu: z.number().int().positive().optional()
});

export const PptxSlideNodeOperationSchema = z.union([
  z.object({
    op: z.literal("remove"),
    target: z.string().min(1)
  }),
  z.object({
    op: z.literal("add"),
    group: z.string().min(1),
    label: z.string().min(1),
    cloneFrom: z.string().min(1).optional(),
    at: z.number().int().min(0).optional()
  })
]);

/**
 * Remap a baked color inside a transplanted PowerPoint slide so a curated figure can be re-toned to
 * fit the deck (e.g. lighten a dark catalog title for a dark deck). `scope` limits where the remap
 * applies: `text` only recolors run/paragraph text colors, `fill` only recolors shape fills, and
 * `all` (default) recolors every matching color. Use `text`/`fill` to avoid collisions when the same
 * hex is used both as a fill and as text on a contrasting surface.
 */
export const PptxSlideColorReplacementSchema = z.object({
  from: z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/),
  to: z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/),
  scope: z.enum(["all", "text", "fill"]).default("all")
});

export const PptxSlideElementSchema = ElementBaseSchema.extend({
  type: z.literal("pptxSlide"),
  h: z.number().positive(),
  templatePath: z.string().min(1).optional(),
  templateDataUri: z.string().min(1).optional(),
  sourceSlideIndex: z.number().int().positive().default(1),
  textReplacements: z.array(PptxSlideTextReplacementSchema).optional(),
  nodeGroups: z.array(PptxSlideNodeGroupSchema).optional(),
  nodeOperations: z.array(PptxSlideNodeOperationSchema).optional(),
  recolor: z.array(PptxSlideColorReplacementSchema).optional(),
  summary: z.string().min(1),
  longDescription: z.string().min(1)
}).refine((value) => value.templatePath || value.templateDataUri, {
  message: "pptxSlide elements require templatePath or templateDataUri"
});

export const SlideElementSchema = z.discriminatedUnion("type", [
  TextElementSchema,
  ShapeElementSchema,
  SvgElementSchema,
  ImageElementSchema,
  DiagramElementSchema,
  SmartArtElementSchema,
  PptxSlideElementSchema
]);

export const SlideSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  layout: z.string().default("title-content"),
  speakerNotes: z.string().optional(),
  background: SlideBackgroundSchema.optional(),
  elements: z.array(SlideElementSchema).min(1)
});

export const SlideVisualTypeSchema = z.enum([
  "section",
  "summary",
  "table",
  "contrast",
  "matrix",
  "flow",
  "before-after",
  "step",
  "cycle",
  "map",
  "ponchi-e",
  "native-diagram",
  "detail",
  "visual-scaffold",
  "image",
  "cards"
]);

export const SlideVisualAssetSchema = z
  .object({
    type: z.enum(["image", "svg"]).default("image"),
    path: z.string().min(1).optional(),
    dataUri: z.string().min(1).optional(),
    svg: z.string().min(1).optional(),
    altText: z.string().min(1),
    placement: z.enum(["left", "right"]).default("left"),
    caption: z.string().min(1).optional(),
    sourceId: z.string().min(1).optional(),
    citation: z.string().min(1).optional()
  })
  .superRefine((asset, context) => {
    if (asset.type === "image" && !asset.path && !asset.dataUri) {
      context.addIssue({
        code: "custom",
        message: "Image visualAsset requires path or dataUri.",
        path: ["path"]
      });
    }

    if (asset.type === "svg" && !asset.svg) {
      context.addIssue({
        code: "custom",
        message: "SVG visualAsset requires svg.",
        path: ["svg"]
      });
    }
  });

export const SlideIntentDiagramNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  sublabel: z.string().optional(),
  kind: z.enum(["actor", "system", "process", "data", "note", "cloud"]).optional(),
  emphasis: z.boolean().optional()
});

export const SlideIntentDiagramEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional(),
  dashed: z.boolean().optional(),
  bidirectional: z.boolean().optional()
});

export const SlideIntentDiagramGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  nodeIds: z.array(z.string().min(1)).min(1)
});

/**
 * Optional explicit figure authored on a SlideIntent. When present (and a diagram renderer is
 * available), the narrative pipeline renders it as an editable native diagram (nodes, labeled
 * connectors, and dashed group panels) instead of a hand-composed shape approximation. This lets a
 * message map author precise sequence flows, trust-domain boundaries, and control-plane maps.
 */
export const SlideIntentDiagramSchema = z.object({
  direction: z.enum(["LR", "TB"]).default("LR"),
  nodes: z.array(SlideIntentDiagramNodeSchema).min(2),
  edges: z.array(SlideIntentDiagramEdgeSchema).default([]),
  groups: z.array(SlideIntentDiagramGroupSchema).default([])
});

export const SlideIntentSchema = z.object({
  slideId: z.string().min(1),
  title: z.string().min(1),
  message: z.string().min(1),
  evidence: z.array(z.string().min(1)).default([]),
  visualType: SlideVisualTypeSchema,
  emphasis: z.string().min(1).optional(),
  quietInfo: z.array(z.string().min(1)).default([]),
  visualAsset: SlideVisualAssetSchema.optional(),
  diagram: SlideIntentDiagramSchema.optional()
});

export const DeckMessageMapSchema = z.object({
  objective: z.string().optional(),
  audience: z.string().optional(),
  desiredAction: z.string().optional(),
  intents: z.array(SlideIntentSchema).default([])
});

export const DeckSpecSchema = z.object({
  version: z.literal("0.1"),
  title: z.string().min(1),
  locale: LocaleSchema,
  template: z.string().min(1),
  skillPack: z.string().optional(),
  tokens: DesignTokensSchema.optional(),
  slideSize: SlideSizeSchema.optional(),
  headerFooter: HeaderFooterSchema.optional(),
  slides: z.array(SlideSchema).min(1),
  metadata: z
    .object({
      author: z.string().optional(),
      subject: z.string().optional(),
      keywords: z.array(z.string()).default([]),
      contentMode: ContentModeSchema.optional(),
      messageMap: DeckMessageMapSchema.optional(),
      sources: z
        .array(
          z.object({
            id: z.string().min(1),
            title: z.string().min(1),
            url: z.string().url().optional(),
            usage: z.enum(["quote", "recreate", "inspiration"]),
            attribution: z.string().optional(),
            notes: z.string().optional()
          })
        )
        .default([])
    })
    .default({ keywords: [], sources: [] })
});

export type Locale = z.infer<typeof LocaleSchema>;
export type ContentMode = z.infer<typeof ContentModeSchema>;
export type DesignTokens = z.infer<typeof DesignTokensSchema>;
export type SlideElement = z.infer<typeof SlideElementSchema>;
export type TextElement = z.infer<typeof TextElementSchema>;
export type ShapeElement = z.infer<typeof ShapeElementSchema>;
export type SvgElement = z.infer<typeof SvgElementSchema>;
export type ImageElement = z.infer<typeof ImageElementSchema>;
export type DiagramElement = z.infer<typeof DiagramElementSchema>;
export type SmartArtElement = z.infer<typeof SmartArtElementSchema>;
export type PptxSlideElement = z.infer<typeof PptxSlideElementSchema>;
export type PptxSlideTextReplacement = z.infer<typeof PptxSlideTextReplacementSchema>;
export type PptxSlideNodeGroup = z.infer<typeof PptxSlideNodeGroupSchema>;
export type PptxSlideNodeOperation = z.infer<typeof PptxSlideNodeOperationSchema>;
export type PptxSlideColorReplacement = z.infer<typeof PptxSlideColorReplacementSchema>;
export type Slide = z.infer<typeof SlideSchema>;
export type DeckSpec = z.infer<typeof DeckSpecSchema>;
export type SlideVisualType = z.infer<typeof SlideVisualTypeSchema>;
export type SlideIntent = z.infer<typeof SlideIntentSchema>;
export type SlideIntentDiagram = z.infer<typeof SlideIntentDiagramSchema>;
export type SlideIntentDiagramNode = z.infer<typeof SlideIntentDiagramNodeSchema>;
export type SlideIntentDiagramEdge = z.infer<typeof SlideIntentDiagramEdgeSchema>;
export type SlideIntentDiagramGroup = z.infer<typeof SlideIntentDiagramGroupSchema>;
export type DeckMessageMap = z.infer<typeof DeckMessageMapSchema>;
export type SlideVisualAsset = z.infer<typeof SlideVisualAssetSchema>;

export function slideCraftSkillPackForLocale(locale: Locale): string {
  return locale === "ja-JP" ? "slide-craft-ja" : "slide-craft-en";
}

export function ensureSlideCraftSkillPack(deck: DeckSpec): DeckSpec {
  const requiredSkillPack = slideCraftSkillPackForLocale(deck.locale);
  if (deck.skillPack === requiredSkillPack) {
    return deck;
  }

  return {
    ...deck,
    skillPack: requiredSkillPack
  };
}

export function parseDeckSpec(input: unknown): DeckSpec {
  return ensureSlideCraftSkillPack(DeckSpecSchema.parse(input));
}
