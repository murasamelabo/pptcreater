import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { notebookCoverage, parseMarkdownToSourceNotebook } from "../packages/source-notebook/dist/index.js";

const sourcePath = process.argv[2];
const outputPath = process.argv[3] ?? path.resolve("generated/source-notebook.json");
if (!sourcePath) {
  console.error("Usage: node scripts/create-source-notebook.mjs <source.md> [output.json]");
  process.exit(1);
}

const absoluteSourcePath = path.resolve(sourcePath);
const markdown = await readFile(absoluteSourcePath, "utf8");
const notebook = parseMarkdownToSourceNotebook(markdown, { sourceUri: absoluteSourcePath });
await writeFile(path.resolve(outputPath), `\uFEFF${JSON.stringify(notebook, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath: path.resolve(outputPath), sourceHash: notebook.sourceHash, blocks: notebook.blocks.length, coverage: notebookCoverage(notebook), warnings: notebook.parseWarnings.length }, null, 2));
