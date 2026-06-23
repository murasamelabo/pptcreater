import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import JSZip from "jszip";

const path = resolve("generated/tree-design-pack-gallery.pptx");
const zip = await JSZip.loadAsync(await readFile(path));
const slideNames = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => {
  const na = Number(a.match(/slide(\d+)/)[1]);
  const nb = Number(b.match(/slide(\d+)/)[1]);
  return na - nb;
});
for (const name of slideNames) {
  const xml = await zip.file(name).async("string");
  const spTrees = (xml.match(/<\/p:spTree>/g) ?? []).length;
  const shapes = (xml.match(/<p:sp>/g) ?? []).length;
  const cxn = (xml.match(/<p:cxnSp>/g) ?? []).length;
  const texts = (xml.match(/<a:t>/g) ?? []).length;
  console.log(`${name}: spTree=${spTrees} sp=${shapes} cxn=${cxn} text=${texts}`);
}
console.log("Total slides:", slideNames.length);
