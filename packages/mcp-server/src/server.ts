import type { Stats } from "node:fs";
import { lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createSimpleIconSvg, searchSvgAssets } from "@pptcreater/assets-svg";
import { renderPonchiDiagram } from "@pptcreater/diagram";
import { createSampleDeck, DeckSpecSchema, LocaleSchema, listSkillPacks, listTemplates, lintDeckSpec, localizeLintReport, parseDeckSpec, type DeckSpec } from "@pptcreater/core";
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
  if (outputPath.includes("\0")) {
    throw new Error("outputPath cannot contain null bytes.");
  }

  assertSafeRelativeOutputSegments(outputPath);

  if (isAbsolute(outputPath)) {
    throw new Error("MCP render_pptx only accepts relative output paths.");
  }

  const extension = extname(outputPath).toLowerCase();
  if (extension !== ".pptx" && extension !== ".html") {
    throw new Error("outputPath must end with .pptx or .html.");
  }

  const outputRoot = resolve(process.cwd(), "generated");
  const resolvedOutputPath = resolve(outputRoot, outputPath);
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
      description: "Create a starter DeckSpec in Japanese or English.",
      inputSchema: {
        locale: z.enum(["ja-JP", "en-US"]).default("ja-JP")
      }
    },
    async ({ locale }) => jsonText(createSampleDeck(locale))
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
    "render_pptx",
    {
      title: "Render PowerPoint",
      description: "Render a DeckSpec to a local .pptx path.",
      inputSchema: {
        deck: DeckSpecSchema,
        outputPath: z.string().min(1),
        overwrite: z.boolean().default(false)
      }
    },
    async ({ deck, outputPath, overwrite }) => {
      const parsedDeck = parseDeckSpec(deck);
      rejectLocalImagePaths(parsedDeck);
      const resolvedOutputPath = await prepareMcpOutputPath(outputPath, overwrite);
      if (extname(resolvedOutputPath).toLowerCase() !== ".pptx") {
        throw new Error("render_pptx outputPath must end with .pptx.");
      }
      return jsonText(await renderDeckToPptx(parsedDeck, resolvedOutputPath));
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
    "search_templates",
    {
      title: "Search templates",
      description: "List built-in accessible slide templates.",
      inputSchema: {
        query: z.string().default("")
      }
    },
    async ({ query }) => {
      const normalized = query.trim().toLowerCase();
      const templates = listTemplates().filter((template) => {
        if (!normalized) {
          return true;
        }

        return [template.id, template.name, template.description, ...template.tags].join(" ").toLowerCase().includes(normalized);
      });

      return jsonText(templates);
    }
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
    async ({ query }) => jsonText(searchSvgAssets(query))
  );

  server.registerTool(
    "generate_svg",
    {
      title: "Generate SVG icon",
      description: "Generate a simple safe SVG icon asset.",
      inputSchema: {
        name: z.enum(["check", "warning", "info"]).default("info"),
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
    "list_skills",
    {
      title: "List skill packs",
      description: "List built-in slide design skill packs.",
      inputSchema: {}
    },
    async () => jsonText(listSkillPacks())
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
              description: "Use create_deck for examples and lint_deck before render_pptx."
            },
            null,
            2
          )
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
