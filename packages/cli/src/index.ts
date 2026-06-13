#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Command } from "commander";
import { createSimpleIconSvg, searchSvgAssets } from "@pptcreater/assets-svg";
import { renderPonchiDiagram } from "@pptcreater/diagram";
import { cliMessage, createSampleDeck, listSkillPacks, listTemplates, lintDeckSpec, localizeLintReport, parseDeckSpec, type Locale } from "@pptcreater/core";
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
  .action(commandAction(async (options: { output: string; locale: string }) => {
    const locale = asLocale(options.locale);
    await writeJson(options.output, createSampleDeck(locale));
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

program
  .command("template")
  .description("Template operations.")
  .command("list")
  .description("List built-in templates.")
  .option("--json", "Emit JSON", false)
  .action(commandAction((options: { json: boolean }) => {
    const templates = listTemplates();
    console.log(options.json ? JSON.stringify(templates, null, 2) : templates.map((template) => `${template.id}\t${template.name}`).join("\n"));
  }));

program
  .command("asset")
  .description("SVG asset operations.")
  .command("search")
  .argument("[query]", "Search query", "")
  .option("--json", "Emit JSON", false)
  .action(commandAction((query: string, options: { json: boolean }) => {
    const assets = searchSvgAssets(query);
    console.log(options.json ? JSON.stringify(assets, null, 2) : assets.map((asset) => `${asset.id}\t${asset.title}`).join("\n"));
  }));

program
  .command("icon")
  .description("Generate a simple SVG icon asset.")
  .argument("<name>", "Icon name: check, warning, or info")
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
