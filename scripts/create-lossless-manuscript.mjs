import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { SourceNotebookSchema } from "../packages/source-notebook/dist/index.js";
import { assertCompleteManuscriptCoverage, createLosslessManuscriptDraft, serializeDeckManuscript } from "../packages/manuscript/dist/index.js";

const notebookPath = process.argv[2];
const outputPath = process.argv[3] ?? path.resolve("generated/deck-manuscript.md");
if (!notebookPath) {
  console.error("Usage: node scripts/create-lossless-manuscript.mjs <source-notebook.json> [output.md]");
  process.exit(1);
}
const notebook = SourceNotebookSchema.parse(JSON.parse((await readFile(path.resolve(notebookPath), "utf8")).replace(/^\uFEFF/u, "")));
const manuscript = createLosslessManuscriptDraft(notebook, {
  audience: process.env.PPTCREATER_MANUSCRIPT_AUDIENCE ?? "Manuscript reviewer",
  purpose: process.env.PPTCREATER_MANUSCRIPT_PURPOSE ?? "Preserve source content before editorial planning",
  desiredAction: process.env.PPTCREATER_MANUSCRIPT_ACTION ?? "Review and merge source units into a natural deck narrative"
});
const coverage = assertCompleteManuscriptCoverage(notebook, manuscript);
await writeFile(path.resolve(outputPath), serializeDeckManuscript(manuscript), "utf8");
console.log(JSON.stringify({ outputPath: path.resolve(outputPath), chapters: manuscript.chapters.length, slides: manuscript.chapters.flatMap((chapter) => chapter.slides).length, coverage }, null, 2));
