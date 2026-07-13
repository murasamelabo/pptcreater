import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { runDirectAuthoring } from "../packages/direct-authoring/dist/index.js";
import { DeckManuscriptSchema } from "../packages/manuscript/dist/index.js";
import { SourceNotebookSchema } from "../packages/source-notebook/dist/index.js";

const notebookPath = process.argv[2];
const manuscriptJsonPath = process.argv[3];
const outputPath = process.argv[4] ?? path.resolve("generated/direct-authoring.pptx");
if (!notebookPath || !manuscriptJsonPath) {
  console.error("Usage: node scripts/run-direct-authoring.mjs <source-notebook.json> <deck-manuscript.json> [output.pptx]");
  process.exit(1);
}
const parseJson = async (filePath, schema) => schema.parse(JSON.parse((await readFile(path.resolve(filePath), "utf8")).replace(/^\uFEFF/u, "")));
const notebook = await parseJson(notebookPath, SourceNotebookSchema);
const manuscript = await parseJson(manuscriptJsonPath, DeckManuscriptSchema);
const result = await runDirectAuthoring({ notebook, manuscript, outputPath: path.resolve(outputPath) });
const reportPath = `${path.resolve(outputPath)}.critic.json`;
const programPath = `${path.resolve(outputPath)}.program.json`;
await writeFile(reportPath, `\uFEFF${JSON.stringify(result.critic, null, 2)}\n`, "utf8");
await writeFile(programPath, `\uFEFF${JSON.stringify(result.program, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath: result.outputPath, reportPath, programPath, slides: result.program.slides.length, defects: result.critic.defects.length, humanReviewNeeded: result.critic.humanReviewNeeded }, null, 2));
if (result.critic.defects.some((defect) => defect.severity === "blocking")) process.exitCode = 1;
