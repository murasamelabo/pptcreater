import { z } from "zod";
import { defaultTokens } from "./color.js";
import { DesignTokensSchema, LocaleSchema } from "./schema.js";

export const TemplateLayoutSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  placeholders: z.array(z.string().min(1)).default([])
});

export const TemplateManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  locale: LocaleSchema,
  description: z.string().min(1),
  tokens: DesignTokensSchema,
  layouts: z.array(TemplateLayoutSchema).min(1),
  accessibility: z.object({
    minimumBodyFontSize: z.number().min(12),
    minimumContrast: z.number().min(1),
    requiresSlideTitles: z.boolean(),
    requiresReadingOrder: z.boolean(),
    requiresAltText: z.boolean()
  }),
  tags: z.array(z.string()).default([])
});

export type TemplateManifest = z.infer<typeof TemplateManifestSchema>;

export const BUILTIN_TEMPLATES: TemplateManifest[] = [
  {
    id: "minimal-consulting",
    name: "Minimal Consulting",
    locale: "ja-JP",
    description: "Executive-ready slides with strong whitespace, assertion titles, and restrained blue accents.",
    tokens: defaultTokens("ja-JP"),
    layouts: [
      {
        id: "title-content",
        name: "Title and content",
        description: "Assertion title, concise body, and one optional visual.",
        placeholders: ["title", "body", "visual"]
      },
      {
        id: "section-divider",
        name: "Section divider",
        description: "High-contrast section transition with one key message.",
        placeholders: ["title", "subtitle"]
      }
    ],
    accessibility: {
      minimumBodyFontSize: 20,
      minimumContrast: 4.5,
      requiresSlideTitles: true,
      requiresReadingOrder: true,
      requiresAltText: true
    },
    tags: ["consulting", "minimal", "japanese", "accessible"]
  },
  {
    id: "technical-architecture",
    name: "Technical Architecture",
    locale: "en-US",
    description: "Calm technical layouts for architecture diagrams, flows, and implementation plans.",
    tokens: {
      ...defaultTokens("en-US"),
      colors: {
        background: "#0f172a",
        surface: "#1e293b",
        text: "#f8fafc",
        mutedText: "#cbd5e1",
        accent: "#38bdf8",
        danger: "#f87171",
        success: "#34d399"
      }
    },
    layouts: [
      {
        id: "architecture-diagram",
        name: "Architecture diagram",
        description: "Large diagram area with explanatory notes and reading-order-safe labels.",
        placeholders: ["title", "diagram", "notes"]
      },
      {
        id: "comparison",
        name: "Comparison",
        description: "Two-column tradeoff layout with explicit labels beyond color.",
        placeholders: ["title", "left", "right"]
      }
    ],
    accessibility: {
      minimumBodyFontSize: 20,
      minimumContrast: 4.5,
      requiresSlideTitles: true,
      requiresReadingOrder: true,
      requiresAltText: true
    },
    tags: ["technical", "architecture", "dark", "accessible"]
  }
];

export function listTemplates(): TemplateManifest[] {
  return BUILTIN_TEMPLATES.map((template) => TemplateManifestSchema.parse(template));
}

export function getTemplate(id: string): TemplateManifest | undefined {
  return listTemplates().find((template) => template.id === id);
}
