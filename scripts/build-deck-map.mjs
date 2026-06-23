import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");

const path = process.argv[2];
const outPath = process.argv[3] ?? "generated/deck-map.json";
const zip = await JSZip.loadAsync(await readFile(path));
const slideNames = Object.keys(zip.files)
  .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
  .sort((a, b) => Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1]));

const slides = [];
for (const name of slideNames) {
  const xml = await zip.file(name).async("string");
  const texts = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) =>
    m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  );
  const fileIndex = Number(name.match(/slide(\d+)/)[1]);
  slides.push({
    file: name,
    sourceSlideIndex: fileIndex,
    sp: (xml.match(/<p:sp>/g) ?? []).length,
    cxn: (xml.match(/<p:cxnSp>/g) ?? []).length,
    pic: (xml.match(/<p:pic>/g) ?? []).length,
    grp: (xml.match(/<p:grpSp>/g) ?? []).length,
    texts
  });
}

// Group into sections. A section header has texts[0] matching /^SECTION \d+/.
const sections = [];
let current = null;
for (const slide of slides) {
  const t0 = slide.texts[0] ?? "";
  if (/^SECTION\s+\d+/i.test(t0)) {
    current = {
      sectionNo: t0.match(/SECTION\s+(\d+)/i)[1],
      jaName: slide.texts[1] ?? "",
      enName: slide.texts[2] ?? "",
      description: slide.texts[3] ?? "",
      headerSlideIndex: slide.sourceSlideIndex,
      patternList: slide.texts.slice(4),
      patterns: []
    };
    sections.push(current);
  } else if (current && /^P\d+$/.test(slide.texts[1] ?? "")) {
    current.patterns.push({
      pattern: slide.texts[1],
      name: slide.texts[2] ?? "",
      sourceSlideIndex: slide.sourceSlideIndex,
      sp: slide.sp,
      cxn: slide.cxn,
      pic: slide.pic,
      grp: slide.grp,
      textCount: slide.texts.length
    });
  }
}

await writeFile(outPath, JSON.stringify({ totalSlides: slides.length, sections }, null, 2), "utf8");
console.log("Wrote", outPath, "sections:", sections.length);
for (const s of sections) {
  console.log(`SECTION ${s.sectionNo} ${s.jaName} (${s.enName}) — ${s.patterns.length} patterns @ header idx ${s.headerSlideIndex}`);
}
