import type { DeckMessageMap, DeckSpec, Slide, SlideIntent } from "./schema.js";

export type MessageMapIssue = {
  severity: "error" | "warning" | "suggestion";
  code: string;
  message: string;
  path: string;
  details?: Record<string, number | string | boolean>;
};

export type MessageMapReport = {
  ok: boolean;
  issues: MessageMapIssue[];
};

function isContentSlide(slide: Slide): boolean {
  return !["cover", "title", "title-slide", "section", "divider", "closing", "closing-slide", "references"].includes(slide.layout ?? "");
}

function isBroadMessage(message: string): boolean {
  const separators = (message.match(/[、,/]/gu) ?? []).length;
  return separators >= 3 || /全部|すべて|all|everything/i.test(message) || [...message].length > 60;
}

export function attachMessageMap(deck: DeckSpec, intents: SlideIntent[], fields: Omit<DeckMessageMap, "intents"> = {}): DeckSpec {
  return {
    ...deck,
    metadata: {
      ...deck.metadata,
      messageMap: {
        ...fields,
        intents
      }
    }
  };
}

export function reviewMessageMap(deck: DeckSpec): MessageMapReport {
  const issues: MessageMapIssue[] = [];
  const contentSlides = deck.slides.filter(isContentSlide);
  const messageMap = deck.metadata.messageMap;
  if (!messageMap || messageMap.intents.length === 0) {
    issues.push({
      severity: "error",
      code: "message-map.missing",
      message: "Decks must define a SlideIntent message map before DeckSpec authoring so every slide has one clear message.",
      path: "metadata.messageMap",
      details: { contentSlides: contentSlides.length }
    });
    return { ok: false, issues };
  }

  const intentsBySlide = new Map(messageMap.intents.map((intent) => [intent.slideId, intent]));
  for (const slide of contentSlides) {
    const intent = intentsBySlide.get(slide.id);
    if (!intent) {
      issues.push({
        severity: "error",
        code: "message-map.slide-missing",
        message: `Slide "${slide.title}" has no SlideIntent entry.`,
        path: `slides.${deck.slides.indexOf(slide)}`
      });
      continue;
    }

    if (isBroadMessage(intent.message)) {
      issues.push({
        severity: "error",
        code: "message-map.message-too-broad",
        message: "SlideIntent message is too broad. Reduce it to one short claim before choosing a visual.",
        path: `metadata.messageMap.intents.${messageMap.intents.indexOf(intent)}.message`
      });
    }

    if (intent.evidence.length === 0) {
      issues.push({
        severity: "error",
        code: "message-map.evidence-missing",
        message: "SlideIntent needs at least one evidence item so the visual has something concrete to prove.",
        path: `metadata.messageMap.intents.${messageMap.intents.indexOf(intent)}.evidence`
      });
    }

    if (!intent.emphasis?.trim()) {
      issues.push({
        severity: "error",
        code: "message-map.emphasis-missing",
        message: "SlideIntent needs one emphasis target so the slide has a designed first look.",
        path: `metadata.messageMap.intents.${messageMap.intents.indexOf(intent)}.emphasis`
      });
    }
  }

  return { ok: issues.every((issue) => issue.severity !== "error"), issues };
}
