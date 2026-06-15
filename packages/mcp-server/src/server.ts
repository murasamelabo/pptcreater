import type { Stats } from "node:fs";
import { lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BUILTIN_ICON_NAMES, createSimpleIconSvg, getDefaultSvgRegistryPath, listIconSourceCatalogs, registerSvgAsset, searchAllSvgAssets } from "@pptcreater/assets-svg";
import { renderPonchiDiagram, renderSchematicDiagram } from "@pptcreater/diagram";
import {
  createSampleDeck,
  DeckSpecSchema,
  getDefaultTemplateRegistryPath,
  listSkillPacks,
  lintDeckSpec,
  LocaleSchema,
  localizeLintReport,
  normalizeDeckLayout,
  parseDeckSpec,
  planSourceVisualStrategy,
  recommendTemplateForContentMode,
  registerTemplateManifest,
  searchTemplates,
  STYLE_PROFILES,
  TemplateManifestSchema,
  type DeckSpec
} from "@pptcreater/core";
import { renderDeckToPptx } from "@pptcreater/render-pptx";
import { renderStudioHtml } from "@pptcreater/studio";

function jsonText(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

type McpOutputPath = {
  outputRoot: string;
  resolvedOutputPath: string;
};

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function isPathInside(child: string, parent: string): boolean {
  const childRelative = relative(parent, child);
  return childRelative === "" || (!childRelative.startsWith("..") && !isAbsolute(childRelative));
}

function normalizeMcpOutputPathInput(outputPath: string): string {
  return outputPath.trim();
}

function assertSafeRelativeOutputSegments(outputPath: string): void {
  const segments = outputPath.split(/[\\/]+/).filter(Boolean);
  segments.forEach((segment) => {
    if (segment.includes(":")) {
      throw new Error("outputPath cannot contain ':' characters.");
    }

    if (segment.endsWith(".") || segment.endsWith(" ")) {
      throw new Error("outputPath segments cannot end with spaces or dots.");
    }

    if (WINDOWS_RESERVED_NAMES.test(segment)) {
      throw new Error(`outputPath uses a reserved Windows device name: ${segment}`);
    }
  });
}

function resolveMcpOutputPath(outputPath: string): McpOutputPath {
  const normalizedOutputPath = normalizeMcpOutputPathInput(outputPath);
  if (normalizedOutputPath.includes("\0")) {
    throw new Error("outputPath cannot contain null bytes.");
  }

  assertSafeRelativeOutputSegments(normalizedOutputPath);

  if (isAbsolute(normalizedOutputPath)) {
    throw new Error("MCP outputPath must be relative (for example, deck.pptx). Files are written under the generated directory.");
  }

  const extension = extname(normalizedOutputPath).toLowerCase();
  if (extension !== ".pptx" && extension !== ".html") {
    throw new Error("outputPath must end with .pptx or .html.");
  }

  const outputRoot = resolve(process.cwd(), "generated");
  const resolvedOutputPath = resolve(outputRoot, normalizedOutputPath);
  const relativePath = relative(outputRoot, resolvedOutputPath);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("outputPath must stay inside the generated directory.");
  }

  return { outputRoot, resolvedOutputPath };
}

async function assertNoSymlinkComponents(outputRoot: string, targetDirectory: string, resolvedOutputPath: string): Promise<void> {
  const rootStat = await lstat(outputRoot);
  if (rootStat.isSymbolicLink()) {
    throw new Error("generated output root cannot be a symbolic link.");
  }

  const directoryParts = relative(outputRoot, targetDirectory).split(/[\\/]+/).filter(Boolean);
  let current = outputRoot;
  for (const part of directoryParts) {
    current = resolve(current, part);
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) {
      throw new Error("generated output path cannot contain symbolic links.");
    }
  }

  const outputStat = await getPathStats(resolvedOutputPath);
  if (outputStat?.isSymbolicLink()) {
    throw new Error("Refusing to write through a symbolic link output file.");
  }
}

async function getPathStats(path: string): Promise<Stats | undefined> {
  try {
    return await lstat(path);
  } catch (error) {
    const nodeError = error as Error & { code?: string };
    if (nodeError.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

async function ensureSafeDirectoryPath(outputRoot: string, targetDirectory: string): Promise<void> {
  const rootStats = await getPathStats(outputRoot);
  if (rootStats) {
    if (rootStats.isSymbolicLink()) {
      throw new Error("generated output root cannot be a symbolic link.");
    }

    if (!rootStats.isDirectory()) {
      throw new Error("generated output root must be a directory.");
    }
  } else {
    await mkdir(outputRoot);
  }

  const realRoot = await realpath(outputRoot);
  const directoryParts = relative(outputRoot, targetDirectory).split(/[\\/]+/).filter(Boolean);
  let current = outputRoot;

  for (const part of directoryParts) {
    current = resolve(current, part);
    const stats = await getPathStats(current);

    if (stats) {
      if (stats.isSymbolicLink()) {
        throw new Error("generated output path cannot contain symbolic links.");
      }

      if (!stats.isDirectory()) {
        throw new Error("generated output path component must be a directory.");
      }
    } else {
      await mkdir(current);
    }

    const realCurrent = await realpath(current);
    if (!isPathInside(realCurrent, realRoot)) {
      throw new Error("generated output path resolves outside the generated directory.");
    }
  }
}

async function prepareMcpOutputPath(outputPath: string, overwrite: boolean): Promise<string> {
  const { outputRoot, resolvedOutputPath } = resolveMcpOutputPath(outputPath);
  const targetDirectory = dirname(resolvedOutputPath);

  await ensureSafeDirectoryPath(outputRoot, targetDirectory);
  await assertNoSymlinkComponents(outputRoot, targetDirectory, resolvedOutputPath);

  const [realRoot, realDirectory] = await Promise.all([realpath(outputRoot), realpath(targetDirectory)]);
  if (!isPathInside(realDirectory, realRoot)) {
    throw new Error("outputPath resolves outside the generated directory.");
  }

  const outputStats = await getPathStats(resolvedOutputPath);
  if (outputStats?.isSymbolicLink()) {
    throw new Error("Refusing to write through a symbolic link output file.");
  }

  if (outputStats && !overwrite) {
    throw new Error("Refusing to overwrite existing PPTX. Set overwrite to true to replace it.");
  }

  return resolvedOutputPath;
}

function rejectLocalImagePaths(deck: DeckSpec): void {
  deck.slides.forEach((slide, slideIndex) => {
    slide.elements.forEach((element, elementIndex) => {
      if (element.type === "image" && element.path) {
        throw new Error(
          `MCP render_pptx does not accept local image.path values at slides.${slideIndex}.elements.${elementIndex}. Use dataUri or registered assets.`
        );
      }
    });
  });
}

export function createPptcreaterMcpServer(): McpServer {
  const server = new McpServer({
    name: "pptcreater",
    version: "0.1.0"
  });

  server.registerTool(
    "create_deck",
    {
      title: "Create sample DeckSpec",
      description: "Create a starter visual DeckSpec. The content mode selects a styled template (presentation/report/technical), or pass styleProfile to force a style.",
      inputSchema: {
        locale: z.enum(["ja-JP", "en-US"]).default("ja-JP"),
        purpose: z.string().optional(),
        audience: z.string().optional(),
        slideCount: z.number().int().min(1).max(4).optional(),
        contentMode: z.enum(["presentation", "report", "technical", "handout", "decision"]).optional(),
        styleProfile: z.enum(STYLE_PROFILES).optional()
      }
    },
    async ({ locale, purpose, audience, slideCount, contentMode, styleProfile }) =>
      jsonText(createSampleDeck(locale, { purpose, audience, slideCount, contentMode, styleProfile }))
  );

  server.registerTool(
    "create_pptx",
    {
      title: "Create and render PowerPoint",
      description:
        "One-shot safe workflow: create a styled DeckSpec with built-in layout, icons, and visual backgrounds, lint it, then render it to .pptx. Use this when the user asks to create a PPTX directly.",
      inputSchema: {
        locale: z.enum(["ja-JP", "en-US"]).default("ja-JP"),
        purpose: z.string().optional(),
        audience: z.string().optional(),
        slideCount: z.number().int().min(1).max(4).optional(),
        contentMode: z.enum(["presentation", "report", "technical", "handout", "decision"]).optional(),
        styleProfile: z.enum(STYLE_PROFILES).optional(),
        outputPath: z.string().min(1),
        overwrite: z.boolean().default(false)
      }
    },
    async ({ locale, purpose, audience, slideCount, contentMode, styleProfile, outputPath, overwrite }) => {
      const deck = createSampleDeck(locale, { purpose, audience, slideCount, contentMode, styleProfile });
      const lint = localizeLintReport(lintDeckSpec(deck), locale);
      const resolvedOutputPath = await prepareMcpOutputPath(outputPath, overwrite);
      if (extname(resolvedOutputPath).toLowerCase() !== ".pptx") {
        throw new Error("create_pptx outputPath must end with .pptx.");
      }
      const render = await renderDeckToPptx(deck, resolvedOutputPath, { polishLayout: true });
      return jsonText({ deck, lint, render });
    }
  );

  server.registerTool(
    "recommend_template",
    {
      title: "Recommend a styled template",
      description: "Recommend a built-in styled template and style profile for a content mode (presentation, report, technical, handout, decision).",
      inputSchema: {
        contentMode: z.enum(["presentation", "report", "technical", "handout", "decision"]).default("presentation")
      }
    },
    async ({ contentMode }) => jsonText(recommendTemplateForContentMode(contentMode))
  );

  server.registerTool(
    "lint_deck",
    {
      title: "Lint DeckSpec",
      description: "Validate and lint a DeckSpec for design and accessibility issues.",
      inputSchema: {
        deck: DeckSpecSchema,
        locale: LocaleSchema.optional()
      }
    },
    async ({ deck, locale }) => {
      const parsedDeck = parseDeckSpec(deck);
      return jsonText(localizeLintReport(lintDeckSpec(parsedDeck), locale ?? parsedDeck.locale));
    }
  );

  server.registerTool(
    "polish_deck_layout",
    {
      title: "Polish DeckSpec layout",
      description: "Normalize slide bounds and text fitting before rendering to reduce overflow and misalignment.",
      inputSchema: {
        deck: DeckSpecSchema,
        locale: LocaleSchema.optional()
      }
    },
    async ({ deck, locale }) => {
      const polished = normalizeDeckLayout(parseDeckSpec(deck));
      return jsonText({
        deck: polished,
        lint: localizeLintReport(lintDeckSpec(polished), locale ?? polished.locale)
      });
    }
  );

  server.registerTool(
    "render_pptx",
    {
      title: "Render PowerPoint",
      description: "Render a DeckSpec to a local .pptx path.",
      inputSchema: {
        deck: DeckSpecSchema,
        outputPath: z.string().min(1),
        overwrite: z.boolean().default(false),
        polishLayout: z.boolean().default(false)
      }
    },
    async ({ deck, outputPath, overwrite, polishLayout }) => {
      const parsedDeck = parseDeckSpec(deck);
      rejectLocalImagePaths(parsedDeck);
      const resolvedOutputPath = await prepareMcpOutputPath(outputPath, overwrite);
      if (extname(resolvedOutputPath).toLowerCase() !== ".pptx") {
        throw new Error("render_pptx outputPath must end with .pptx.");
      }
      return jsonText(await renderDeckToPptx(parsedDeck, resolvedOutputPath, { polishLayout }));
    }
  );

  server.registerTool(
    "render_studio",
    {
      title: "Render Studio HTML",
      description: "Render a static local Studio HTML preview for a DeckSpec.",
      inputSchema: {
        deck: DeckSpecSchema,
        outputPath: z.string().min(1),
        locale: LocaleSchema.optional(),
        overwrite: z.boolean().default(false)
      }
    },
    async ({ deck, outputPath, locale, overwrite }) => {
      const parsedDeck = parseDeckSpec(deck);
      const resolvedOutputPath = await prepareMcpOutputPath(outputPath, overwrite);
      if (extname(resolvedOutputPath).toLowerCase() !== ".html") {
        throw new Error("render_studio outputPath must end with .html.");
      }

      await writeFile(resolvedOutputPath, renderStudioHtml(parsedDeck, locale ?? parsedDeck.locale), "utf8");
      return jsonText({ outputPath: resolvedOutputPath });
    }
  );

  server.registerTool(
    "plan_source_visual",
    {
      title: "Plan source visual usage",
      description: "Help an agent choose whether to quote an original source figure, recreate it as editable objects, or use it only as inspiration.",
      inputSchema: {
        sourceTitle: z.string().min(1),
        sourceUrl: z.string().url().optional(),
        visualDescription: z.string().min(1),
        hasPermission: z.boolean().optional(),
        needsExactFidelity: z.boolean().optional()
      }
    },
    async (input) => jsonText(planSourceVisualStrategy(input))
  );

  server.registerTool(
    "search_templates",
    {
      title: "Search templates",
      description: "List built-in accessible slide templates.",
      inputSchema: {
        query: z.string().default("")
      }
    },
    async ({ query }) => {
      return jsonText(await searchTemplates(query));
    }
  );

  server.registerTool(
    "register_template",
    {
      title: "Register template",
      description: "Register a validated template manifest as a reusable pptcreater template.",
      inputSchema: {
        template: TemplateManifestSchema,
        overwrite: z.boolean().default(false)
      }
    },
    async ({ template, overwrite }) => jsonText(await registerTemplateManifest(template, { overwrite }))
  );

  server.registerTool(
    "search_assets",
    {
      title: "Search SVG assets",
      description: "Search registered SVG icons and visual assets.",
      inputSchema: {
        query: z.string().default("")
      }
    },
    async ({ query }) => jsonText(await searchAllSvgAssets(query))
  );

  server.registerTool(
    "register_svg_asset",
    {
      title: "Register reusable SVG asset",
      description: "Sanitize and register an SVG icon or illustration for repeated use by search_assets and future decks.",
      inputSchema: {
        id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/),
        title: z.string().min(1),
        description: z.string().min(1),
        tags: z.array(z.string()).default([]),
        license: z.string().default("custom"),
        decorative: z.boolean().default(false),
        altText: z.string().optional(),
        svg: z.string().min(1).max(200_000),
        overwrite: z.boolean().default(false)
      }
    },
    async ({ overwrite, ...asset }) => jsonText(await registerSvgAsset(asset, { overwrite }))
  );

  server.registerTool(
    "generate_svg",
    {
      title: "Generate SVG icon",
      description: "Generate a simple safe SVG icon asset.",
      inputSchema: {
        name: z.enum(BUILTIN_ICON_NAMES).default("info"),
        color: z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/).default("#1d4ed8")
      }
    },
    async ({ name, color }) => jsonText(createSimpleIconSvg(name, color))
  );

  server.registerTool(
    "generate_diagram",
    {
      title: "Generate ponchi-e diagram",
      description: "Render a declarative ponchi-e diagram to accessible SVG.",
      inputSchema: {
        diagram: z.unknown()
      }
    },
    async ({ diagram }) => jsonText(renderPonchiDiagram(diagram))
  );

  server.registerTool(
    "generate_schematic",
    {
      title: "Generate Slideland-style schematic",
      description:
        "Generate a safe, presentation-ready schematic SVG from a preset kind. Prefer this over freehand SVG when creating tables, trees, horizontal/vertical flows, lists, or mockup-style visuals.",
      inputSchema: {
        schematic: z.object({
          kind: z.enum(["table", "tree", "flow", "vertical-flow", "list", "list-horizontal", "list-enumeration", "mockup"]),
          title: z.string().min(1),
          summary: z.string().min(1),
          longDescription: z.string().min(20),
          items: z.array(z.string().min(1)).min(1).max(8),
          secondaryItems: z.array(z.string().min(1)).max(8).default([]),
          tone: z.enum(["minimal", "cool", "luxury", "report"]).default("minimal"),
          width: z.number().min(960).default(960),
          height: z.number().min(540).default(540)
        })
      }
    },
    async ({ schematic }) => jsonText(renderSchematicDiagram(schematic))
  );

  server.registerTool(
    "list_skills",
    {
      title: "List skill packs",
      description: "List built-in slide design skill packs.",
      inputSchema: {}
    },
    async () => jsonText(listSkillPacks())
  );

  server.registerResource(
    "icon-source-catalogs",
    "asset://icon-sources",
    {
      title: "Icon source catalogs",
      description: "Free or publicly documented icon catalogs that agents may use after checking each source's license and brand terms.",
      mimeType: "application/json"
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(listIconSourceCatalogs(), null, 2)
        }
      ]
    })
  );

  server.registerResource(
    "asset-registration-guide",
    "asset://registration-guide",
    {
      title: "Asset registration guide",
      description: "How AI agents should register reusable SVG assets and templates in pptcreater.",
      mimeType: "text/markdown"
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: [
            "# pptcreater asset registration",
            "",
            "Use `register_svg_asset` when the user provides or asks you to create an SVG that should be reused in future decks.",
            "",
            "Required SVG fields: `id`, `title`, `description`, and `svg`.",
            "Recommended fields: `tags`, `license`, `decorative`, and `altText`.",
            "The server sanitizes SVG markup before writing it to the registry.",
            `Default SVG registry: ${getDefaultSvgRegistryPath()}`,
            "",
            "Use `search_assets` before creating a duplicate asset.",
            "Use `asset://icon-sources` to discover upstream icon catalogs and their license/brand guidance notes.",
            "",
            "Use `register_template` for reusable slide template manifests. A template manifest must include design tokens, layouts, locale, tags, and accessibility constraints.",
            `Default template registry: ${getDefaultTemplateRegistryPath()}`,
            "",
            "After registration, use `search_assets` or `search_templates` to discover the new reusable item."
          ].join("\n")
        }
      ]
    })
  );

  server.registerResource(
    "modern-slide-principles",
    "design://modern-slide-principles",
    {
      title: "Modern slide design principles",
      description: "Design principles distilled from modern slide galleries without copying any specific design.",
      mimeType: "text/markdown"
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: [
            "# Modern slide design principles",
            "",
            "Use these as style guidance, not as a license to copy specific third-party slides.",
            "",
            "- Lead with a strong assertion title, not a topic label.",
            "- Use a modular grid: cards, bands, large numerals, timelines, and process blocks.",
            "- Build one memorable visual scene per slide.",
            "- Keep typography bold, sparse, and hierarchical.",
            "- Use generous whitespace and one intentional accent color.",
            "- Prefer editable PowerPoint shapes/text over flattened images.",
            "- For report decks, use more structure and evidence blocks.",
            "- For presentation decks, use fewer words and more visual contrast.",
            "- For technical decks, use architecture, concept, boundary, and flow diagrams.",
            "- Run `polish_deck_layout` and `lint_deck` before rendering."
          ].join("\n")
        }
      ]
    })
  );

  server.registerResource(
    "source-visual-guide",
    "source://visual-use-guide",
    {
      title: "Source visual usage guide",
      description: "How to decide between quoting a source figure and recreating it as editable PowerPoint objects.",
      mimeType: "text/markdown"
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: [
            "# Source visual usage guide",
            "",
            "When a deck summarizes a source document or URL, first decide whether each source visual should be quoted, recreated, or used only as inspiration.",
            "",
            "- Quote: only when exact fidelity is required and usage rights are clear. Add `metadata.sources[].usage = quote`, `sourceId`, and `citation`.",
            "- Recreate: preferred for explanatory slides because PowerPoint objects remain editable and can be localized/simplified.",
            "- Inspiration: use when rights are unclear or the original is too detailed; do not copy the original visual.",
            "",
            "Use the `plan_source_visual` tool to present these choices to the agent/user before rendering."
          ].join("\n")
        }
      ]
    })
  );

  server.registerResource(
    "deckspec-schema",
    "deckspec://schema",
    {
      title: "DeckSpec schema",
      description: "Current DeckSpec schema guidance for agent use.",
      mimeType: "application/json"
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              version: "0.1",
              description: "Use create_pptx for direct PPTX requests. Use create_deck for examples and lint_deck before render_pptx when manually editing a DeckSpec.",
              templateField: "DeckSpec.template must be the id of a template returned by search_templates. Register reusable custom templates with register_template.",
              assetFlow: "Use search_assets to find registered SVG assets. Use generate_schematic for table/tree/flow/list/mockup visuals, and register_svg_asset for reusable SVGs before referencing their sanitized SVG in DeckSpec elements.",
              shapeFlow: "DeckSpec supports native shape elements: rect, roundRect, ellipse, line, and rightArrow. Prefer native shape/text for editable cards, arrows, and simple diagrams; use generate_schematic for complex but safe SVG diagrams.",
              layoutGuardrails: "render_pptx always applies layout polish and reading-order normalization before drawing. layout.text-overflow-risk, layout.text-overlap, and layout.bad-line-break are blocking issues: shorten copy, split the slide, rebalance lines, or choose a schematic/table/list layout instead of forcing a broken PPTX. Treat layout.enumeration-hierarchy as a strong design warning.",
              cognitiveLoad: "Use one visual grammar per slide. Prefer table for comparisons, tree for hierarchy, flow/vertical-flow for processes, and list/list-horizontal for 3-4 key points. Avoid many custom text boxes with uneven manual line breaks or body-only enumerations.",
              sourceVisuals: "Use metadata.sources plus element.sourceId/citation when quoting, recreating, or using source visuals as inspiration. Prefer editable shape/text objects for recreated visuals.",
              requiredVisualAccessibility: "Non-decorative SVG, image, and diagram elements require altText. Diagram elements also require summary and longDescription.",
              recommendedWorkflow: ["create_pptx for direct output", "search_templates", "search_assets", "generate_schematic for structured visuals", "create_deck or custom DeckSpec", "lint_deck", "render_pptx or render_studio"]
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerPrompt(
    "interview_slide_brief",
    {
      title: "Interview slide brief",
      description: "Ask the minimum useful questions before creating a visual slide deck.",
      argsSchema: {
        locale: z.enum(["ja-JP", "en-US"]).default("ja-JP")
      }
    },
    ({ locale }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              locale === "ja-JP"
                ? [
                    "スライド作成前に、以下を1つずつユーザーへ確認してから、図解中心のDeckSpecを作成してください:",
                    "1. この資料で聴衆に理解・判断・行動してほしいことは何ですか？",
                    "2. 主な聴衆は誰で、前提知識はどの程度ですか？",
                    "3. 発表用、配布用、非同期レビュー用、Web公開用のどれに近いですか？",
                    "4. 希望する枚数、時間、章立てはありますか？",
                    "5. 使いたいテンプレート、ブランド色、アイコン、ロゴ、図表、データソースはありますか？",
                    "回答後、search_templates と search_assets を使い、図・アイコンを含むDeckSpecを作成し、lint_deck後に render_pptx または render_studio を使ってください。"
                  ].join("\n")
                : [
                    "Before creating slides, ask the user these questions one at a time, then create a visual DeckSpec:",
                    "1. What should the audience understand, decide, or do?",
                    "2. Who is the audience and what do they already know?",
                    "3. Is this for live presentation, handout, async review, or public sharing?",
                    "4. What slide count, time limit, or section structure is desired?",
                    "5. Are there templates, brand colors, icons, logos, diagrams, or data sources to reuse?",
                    "After the answers, use search_templates and search_assets, create a DeckSpec with diagrams/icons, run lint_deck, then render_pptx or render_studio."
                  ].join("\n")
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "register_reusable_svg_asset",
    {
      title: "Register reusable SVG asset",
      description: "Guide an agent to turn an SVG into a reusable pptcreater asset.",
      argsSchema: {
        assetName: z.string().min(1),
        purpose: z.string().min(1)
      }
    },
    ({ assetName, purpose }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Register a reusable SVG asset named "${assetName}" for this purpose: ${purpose}. First call search_assets to avoid duplicates. If no suitable asset exists, provide safe SVG markup and call register_svg_asset with a stable id, title, description, tags, license, decorative flag, and altText when the asset conveys meaning.`
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "create_concise_slide_deck",
    {
      title: "Create concise accessible deck",
      description: "Guide an agent to create a concise DeckSpec before rendering.",
      argsSchema: {
        topic: z.string().min(1),
        locale: z.enum(["ja-JP", "en-US"]).default("ja-JP")
      }
    },
    ({ topic, locale }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Create a concise accessible DeckSpec about "${topic}" for locale ${locale}. Use one message per slide, explicit readingOrder, altText for visuals, and run lint_deck before rendering.`
          }
        }
      ]
    })
  );

  return server;
}
