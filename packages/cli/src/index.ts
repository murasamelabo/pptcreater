#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Command, InvalidArgumentError } from "commander";
import { BUILTIN_ICON_NAMES, createSimpleIconSvg, getDefaultSvgRegistryPath, listIconSourceCatalogs, registerSvgAsset, searchAllSvgAssets, type BuiltinIconName } from "@pptcreater/assets-svg";
import { renderPonchiDiagram } from "@pptcreater/diagram";
import {
  cliMessage,
  createSampleDeck,
  getDefaultTemplateRegistryPath,
  listAllTemplates,
  listSkillPacks,
  lintDeckSpec,
  localizeLintReport,
  parseDeckSpec,
  registerTemplateManifest,
  type Locale
} from "@pptcreater/core";
import { renderDeckToPptx } from "@pptcreater/render-pptx";
import { renderStudioHtml } from "@pptcreater/studio";

async function readJson(path: string): Promise<unknown> {
  const text = await readFile(path, "utf8");
  return JSON.parse(text.replace(/^\uFEFF/, ""));
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asLocale(value: string): Locale {
  if (value === "ja-JP" || value === "en-US") {
    return value;
  }

  throw new Error(cliMessage("en-US", "cli.unsupportedLocale", { locale: value }));
}

function outputLocale(fallback: Locale = "en-US"): Locale {
  const language = program.opts<{ language?: string }>().language;
  return language ? asLocale(language) : fallback;
}

function parseSlideCount(value: string): number {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 4) {
    throw new InvalidArgumentError("Slide count must be an integer from 1 to 4.");
  }

  return count;
}

function parseContentMode(value: string): "presentation" | "handout" | "decision" {
  if (value === "presentation" || value === "handout" || value === "decision") {
    return value;
  }

  throw new InvalidArgumentError("Content mode must be one of: presentation, handout, decision.");
}

function parseBuiltinIconName(value: string): BuiltinIconName {
  const normalized = value.trim().toLowerCase();
  if (BUILTIN_ICON_NAMES.includes(normalized as BuiltinIconName)) {
    return normalized as BuiltinIconName;
  }

  throw new InvalidArgumentError(`Icon name must be one of: ${BUILTIN_ICON_NAMES.join(", ")}.`);
}

function formatCliError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function commandAction<T extends unknown[]>(action: (...args: T) => Promise<void> | void): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await action(...args);
    } catch (error) {
      console.error(formatCliError(error));
      process.exitCode = 1;
    }
  };
}

const program = new Command();

program
  .name("pptcreater")
  .description("Create concise accessible PowerPoint decks from DeckSpec.")
  .version("0.1.0")
  .option("--language <locale>", "CLI output language: ja-JP or en-US");

program
  .command("new")
  .description("Create a sample DeckSpec.")
  .option("-o, --output <path>", "Output DeckSpec path", "deck.json")
  .option("--locale <locale>", "Deck locale", "ja-JP")
  .option("--purpose <purpose>", "Purpose or desired audience outcome")
  .option("--audience <audience>", "Primary audience")
  .option("--slides <count>", "Target slide count from 1 to 4", parseSlideCount)
  .option("--content-mode <mode>", "presentation, handout, or decision", parseContentMode)
  .action(commandAction(async (options: { output: string; locale: string; purpose?: string; audience?: string; slides?: number; contentMode?: "presentation" | "handout" | "decision" }) => {
    const locale = asLocale(options.locale);
    await writeJson(options.output, createSampleDeck(locale, {
      purpose: options.purpose,
      audience: options.audience,
      slideCount: options.slides,
      contentMode: options.contentMode
    }));
    console.log(cliMessage(outputLocale(locale), "cli.created", { path: options.output }));
  }));

program
  .command("lint")
  .description("Lint a DeckSpec for design and accessibility issues.")
  .argument("<deck>", "DeckSpec JSON path")
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (deckPath: string, options: { json: boolean }) => {
    const deck = parseDeckSpec(await readJson(deckPath));
    const report = localizeLintReport(lintDeckSpec(deck), outputLocale(deck.locale));
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    if (report.issues.length === 0) {
      console.log(cliMessage(outputLocale(deck.locale), "cli.noLintIssues"));
      return;
    }

    report.issues.forEach((item) => {
      console.log(`${item.severity.toUpperCase()} ${item.code} ${item.path}: ${item.message}`);
    });

    if (!report.ok) {
      process.exitCode = 1;
    }
  }));

program
  .command("render")
  .description("Render a DeckSpec to PowerPoint.")
  .argument("<deck>", "DeckSpec JSON path")
  .requiredOption("-o, --output <path>", "Output .pptx path")
  .option("--force", "Render even when lint errors are present", false)
  .action(commandAction(async (deckPath: string, options: { output: string; force: boolean }) => {
    const deck = await readJson(deckPath);
    const result = await renderDeckToPptx(deck, options.output, { allowLintErrors: options.force });
    const parsedDeck = parseDeckSpec(deck);
    console.log(cliMessage(outputLocale(parsedDeck.locale), "cli.rendered", { path: result.outputPath }));
    if (result.warnings.length > 0) {
      console.log(cliMessage(outputLocale(parsedDeck.locale), "cli.lintWarnings", { count: result.warnings.length }));
    }
  }));

program
  .command("studio")
  .description("Create a static Studio HTML preview for a DeckSpec.")
  .argument("<deck>", "DeckSpec JSON path")
  .requiredOption("-o, --output <path>", "Output HTML path")
  .action(commandAction(async (deckPath: string, options: { output: string }) => {
    const deck = parseDeckSpec(await readJson(deckPath));
    await mkdir(dirname(options.output), { recursive: true });
    await writeFile(options.output, renderStudioHtml(deck, outputLocale(deck.locale)), "utf8");
    console.log(cliMessage(outputLocale(deck.locale), "cli.studioCreated", { path: options.output }));
  }));

const templateCommand = program
  .command("template")
  .description("Template operations.");

templateCommand
  .command("list")
  .description("List built-in templates.")
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (options: { json: boolean }) => {
    const templates = await listAllTemplates();
    console.log(options.json ? JSON.stringify(templates, null, 2) : templates.map((template) => `${template.id}\t${template.name}`).join("\n"));
  }));

templateCommand
  .command("register")
  .description("Register a template manifest JSON for reuse.")
  .argument("<manifest>", "Template manifest JSON path")
  .option("--overwrite", "Replace an existing custom template with the same id", false)
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (manifestPath: string, options: { overwrite: boolean; json: boolean }) => {
    const result = await registerTemplateManifest(await readJson(manifestPath), { overwrite: options.overwrite });
    console.log(options.json ? JSON.stringify(result, null, 2) : `Registered template ${result.template.id} in ${result.registryPath}`);
  }));

templateCommand
  .command("registry-path")
  .description("Print the template registry path.")
  .action(() => {
    console.log(getDefaultTemplateRegistryPath());
  });

const assetCommand = program
  .command("asset")
  .description("SVG asset operations.");

assetCommand
  .command("search")
  .argument("[query]", "Search query", "")
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (query: string, options: { json: boolean }) => {
    const assets = await searchAllSvgAssets(query);
    console.log(options.json ? JSON.stringify(assets, null, 2) : assets.map((asset) => `${asset.id}\t${asset.title}`).join("\n"));
  }));

assetCommand
  .command("sources")
  .description("List external icon source catalogs and license guidance notes.")
  .option("--json", "Emit JSON", false)
  .action(commandAction((options: { json: boolean }) => {
    const sources = listIconSourceCatalogs();
    console.log(options.json ? JSON.stringify(sources, null, 2) : sources.map((source) => `${source.id}\t${source.url}`).join("\n"));
  }));

assetCommand
  .command("register")
  .description("Register a sanitized SVG file as a reusable asset.")
  .argument("<svgFile>", "SVG file path")
  .requiredOption("--id <id>", "Reusable asset id")
  .requiredOption("--title <title>", "Human-readable asset title")
  .requiredOption("--description <description>", "Asset description")
  .option("--tag <tag...>", "Search tags")
  .option("--license <license>", "Asset license", "custom")
  .option("--alt-text <text>", "Default alt text")
  .option("--decorative", "Mark as decorative by default", false)
  .option("--overwrite", "Replace an existing asset with the same id", false)
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (
    svgFile: string,
    options: {
      id: string;
      title: string;
      description: string;
      tag?: string[];
      license: string;
      altText?: string;
      decorative: boolean;
      overwrite: boolean;
      json: boolean;
    }
  ) => {
    const result = await registerSvgAsset(
      {
        id: options.id,
        title: options.title,
        description: options.description,
        tags: options.tag ?? [],
        license: options.license,
        decorative: options.decorative,
        altText: options.altText,
        svg: await readFile(svgFile, "utf8")
      },
      { overwrite: options.overwrite }
    );
    console.log(options.json ? JSON.stringify(result, null, 2) : `Registered SVG asset ${result.asset.id} in ${result.registryPath}`);
  }));

assetCommand
  .command("registry-path")
  .description("Print the SVG asset registry path.")
  .action(() => {
    console.log(getDefaultSvgRegistryPath());
  });

program
  .command("icon")
  .description("Generate a simple SVG icon asset.")
  .argument("<name>", `Icon name: ${BUILTIN_ICON_NAMES.join(", ")}`, parseBuiltinIconName)
  .option("--color <hex>", "Stroke color", "#1d4ed8")
  .option("--json", "Emit JSON", false)
  .action(commandAction((name: string, options: { color: string; json: boolean }) => {
    const icon = createSimpleIconSvg(name, options.color);
    console.log(options.json ? JSON.stringify(icon, null, 2) : icon.svg);
  }));

program
  .command("diagram")
  .description("Render a ponchi-e diagram JSON file to SVG.")
  .argument("<diagram>", "Diagram JSON path")
  .requiredOption("-o, --output <path>", "Output SVG path")
  .action(commandAction(async (diagramPath: string, options: { output: string }) => {
    const result = renderPonchiDiagram(await readJson(diagramPath));
    await writeFile(options.output, `${result.svg}\n`, "utf8");
    console.log(`Created ${options.output}`);
  }));

program
  .command("skill")
  .description("Skill pack operations.")
  .command("list")
  .option("--json", "Emit JSON", false)
  .action(commandAction((options: { json: boolean }) => {
    const skills = listSkillPacks();
    console.log(options.json ? JSON.stringify(skills, null, 2) : skills.map((skill) => `${skill.id}\t${skill.name}`).join("\n"));
  }));

await program.parseAsync();
