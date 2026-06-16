import { defaultTokens } from "./color.js";
import type { DeckSpec, Slide } from "./schema.js";

const SOURCE_REFERENCE_SLIDE_ID = "source-references";

function sourceReferenceTitle(locale: DeckSpec["locale"]): string {
  return locale === "ja-JP" ? "参考URL・出典" : "References and sources";
}

function sourceReferenceMessage(locale: DeckSpec["locale"], count: number): string {
  if (locale === "ja-JP") {
    return `外部サイトを参照した内容は、以下のURLを出典として確認できます（${count}件）。`;
  }

  return `External sources referenced while preparing this deck (${count} URLs).`;
}

function sourceReferenceNotes(sources: DeckSpec["metadata"]["sources"]): string {
  return [
    "Source URLs and attribution:",
    ...sources.map((source, index) =>
      [
        `${index + 1}. ${source.title}`,
        source.url ? `URL: ${source.url}` : undefined,
        source.attribution ? `Attribution: ${source.attribution}` : undefined,
        source.notes ? `Notes: ${source.notes}` : undefined
      ]
        .filter((item): item is string => Boolean(item))
        .join(" | ")
    )
  ].join("\n");
}

function sourceUrlEntries(deck: DeckSpec): DeckSpec["metadata"]["sources"] {
  return deck.metadata.sources.filter((source) => Boolean(source.url));
}

function normalizeUrlForSearch(url: string): string {
  return url.trim();
}

function slideText(slide: Slide): string {
  return [
    slide.title,
    slide.speakerNotes ?? "",
    ...slide.elements.map((element) => {
      if (element.type === "text") {
        return element.text;
      }

      return element.citation ?? "";
    })
  ].join("\n");
}

function referenceSlideEntryText(source: DeckSpec["metadata"]["sources"][number], index: number): string {
  const title = source.attribution ? `${source.title} (${source.attribution})` : source.title;
  return `${index + 1}. ${title}\n${source.url}`;
}

function uniqueSlideTitle(deck: DeckSpec, preferredTitle: string): string {
  const existingTitles = new Set(deck.slides.map((slide) => slide.title));
  if (!existingTitles.has(preferredTitle)) {
    return preferredTitle;
  }

  let suffix = 2;
  while (existingTitles.has(`${preferredTitle} ${suffix}`)) {
    suffix += 1;
  }

  return `${preferredTitle} ${suffix}`;
}

function createSourceReferenceSlide(deck: DeckSpec, existingTitle?: string): Slide {
  const sources = sourceUrlEntries(deck);
  const tokens = deck.tokens ?? defaultTokens(deck.locale);
  const title = existingTitle ?? uniqueSlideTitle(deck, sourceReferenceTitle(deck.locale));
  const columns = sources.length > 7 ? 2 : 1;
  const rows = Math.ceil(sources.length / columns);
  const top = 1.82;
  const rowGap = 0.08;
  const usableHeight = 5.1;
  const rowHeight = Math.max(0.42, usableHeight / Math.max(rows, 1) - rowGap);
  const fontSize = rows > 9 ? 12 : rows > 7 ? 13 : 14;
  const columnWidth = columns === 2 ? 5.65 : 11.45;

  return {
    id: SOURCE_REFERENCE_SLIDE_ID,
    title,
    layout: "references",
    speakerNotes: sourceReferenceNotes(sources),
    elements: [
      {
        id: "references-title",
        type: "text",
        role: "title",
        text: title,
        x: 0.75,
        y: 0.58,
        w: 11.8,
        h: 0.55,
        fontSize: Math.max(28, tokens.typography.titleSize - 4),
        color: tokens.colors.text,
        contrastBackground: tokens.colors.background,
        bold: true,
        decorative: false,
        readingOrder: 0
      },
      {
        id: "references-message",
        type: "text",
        role: "body",
        text: sourceReferenceMessage(deck.locale, sources.length),
        x: 0.78,
        y: 1.18,
        w: 11.6,
        h: 0.42,
        fontSize: 20,
        color: tokens.colors.mutedText,
        contrastBackground: tokens.colors.background,
        bold: false,
        decorative: false,
        readingOrder: 1
      },
      ...sources.map((source, index) => {
        const column = Math.floor(index / rows);
        const row = index % rows;
        return {
          id: `reference-${index + 1}`,
          type: "text" as const,
          role: "caption" as const,
          text: referenceSlideEntryText(source, index),
          x: 0.85 + column * 5.9,
          y: top + row * (rowHeight + rowGap),
          w: columnWidth,
          h: rowHeight,
          fontSize,
          color: tokens.colors.text,
          contrastBackground: tokens.colors.background,
          bold: false,
          decorative: false,
          readingOrder: index + 2
        };
      })
    ]
  };
}

export function hasCompleteSourceReferenceSlide(deck: DeckSpec): boolean {
  const sources = sourceUrlEntries(deck);
  if (sources.length === 0) {
    return true;
  }

  const finalSlide = deck.slides.at(-1);
  if (!finalSlide) {
    return false;
  }

  const text = slideText(finalSlide);
  return sources.every((source) => source.url && text.includes(normalizeUrlForSearch(source.url)));
}

export function ensureSourceReferenceSlide(deck: DeckSpec): DeckSpec {
  const sources = sourceUrlEntries(deck);
  const finalSlide = deck.slides.at(-1);

  if (sources.length === 0) {
    if (finalSlide?.id !== SOURCE_REFERENCE_SLIDE_ID) {
      return deck;
    }

    return {
      ...deck,
      slides: deck.slides.slice(0, -1)
    };
  }

  if (finalSlide?.id === SOURCE_REFERENCE_SLIDE_ID) {
    return {
      ...deck,
      slides: [...deck.slides.slice(0, -1), createSourceReferenceSlide(deck, finalSlide.title)]
    };
  }

  if (hasCompleteSourceReferenceSlide(deck)) {
    return deck;
  }

  const slides = [...deck.slides];
  slides.push(createSourceReferenceSlide(deck));

  return {
    ...deck,
    slides
  };
}

