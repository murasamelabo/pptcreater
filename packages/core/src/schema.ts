import { z } from "zod";

export const LocaleSchema = z.enum(["ja-JP", "en-US"]);
export const ContentModeSchema = z.enum(["presentation", "report", "technical", "handout", "decision"]);

export const HexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/, "Expected a hex color such as #123abc");

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

export const TemplateScaffoldSlideSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional()
});

export type SlideSize = z.infer<typeof SlideSizeSchema>;
export type HeaderFooter = z.infer<typeof HeaderFooterSchema>;
export type TemplateScaffoldSlide = z.infer<typeof TemplateScaffoldSlideSchema>;

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
  citation: z.string().optional()
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

export const SlideElementSchema = z.discriminatedUnion("type", [
  TextElementSchema,
  ShapeElementSchema,
  SvgElementSchema,
  ImageElementSchema,
  DiagramElementSchema
]);

export const SlideSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  layout: z.string().default("title-content"),
  speakerNotes: z.string().optional(),
  elements: z.array(SlideElementSchema).min(1)
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
export type Slide = z.infer<typeof SlideSchema>;
export type DeckSpec = z.infer<typeof DeckSpecSchema>;

export function parseDeckSpec(input: unknown): DeckSpec {
  return DeckSpecSchema.parse(input);
}
