import { access, mkdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

export type CandidateSnapshotArtifact = {
  candidateId: string;
  grammarId: string;
  scoreRank: number;
  studioPath?: string;
};

export type CandidateSnapshotPlanItem = CandidateSnapshotArtifact & {
  studioPath: string;
  snapshotPath: string;
};

export type RenderedSnapshotMetrics = {
  width: number;
  height: number;
  overflowElementCount: number;
  overlapPairCount: number;
  occupiedAreaRatio: number;
  largestElementAreaRatio: number;
  textElementCount: number;
};

export type RenderedSnapshotScore = {
  clarity: number;
  beauty: number;
  blocking: boolean;
};

export type CapturedCandidateSnapshot = CandidateSnapshotPlanItem & {
  metrics: RenderedSnapshotMetrics;
  score: RenderedSnapshotScore;
};

export type RenderedCandidateRecommendation = {
  recommendedCandidateId: string;
  weights: { accuracy: number; clarity: number; beauty: number };
  weightSource: "baseline" | "calibrated";
  eligibleCandidateIds: string[];
  ranked: Array<{ candidateId: string; accuracy: number; clarity: number; beauty: number; total: number }>;
  rejected: Array<{ candidateId: string; reason: "accuracy-gate" | "render-blocking" | "snapshot-missing" }>;
};

function normalizedPath(value: string): string {
  return value.replace(/\\/gu, "/");
}

export function buildCandidateSnapshotPlan(outputDir: string, candidates: CandidateSnapshotArtifact[]): CandidateSnapshotPlanItem[] {
  return candidates.flatMap((candidate) => {
    if (!candidate.studioPath) return [];
    const studioName = basename(candidate.studioPath);
    const pngName = studioName.endsWith(".studio.html") ? studioName.slice(0, -".studio.html".length) + ".png" : `${studioName}.png`;
    return [{ ...candidate, studioPath: normalizedPath(candidate.studioPath), snapshotPath: normalizedPath(join(outputDir, pngName)) }];
  });
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scoreRenderedSnapshotMetrics(metrics: RenderedSnapshotMetrics): RenderedSnapshotScore {
  const densityDistance = Math.abs(metrics.occupiedAreaRatio - 0.58);
  const densityPenalty = Math.min(32, densityDistance * 100);
  const focalPenalty = metrics.largestElementAreaRatio < 0.18 ? (0.18 - metrics.largestElementAreaRatio) * 120 : metrics.largestElementAreaRatio > 0.72 ? (metrics.largestElementAreaRatio - 0.72) * 80 : 0;
  const overflowPenalty = metrics.overflowElementCount * 18;
  const overlapPenalty = metrics.overlapPairCount * 14;
  const excessiveTextPenalty = Math.max(0, metrics.textElementCount - 12) * 2;
  return {
    clarity: clampScore(100 - overflowPenalty - overlapPenalty - excessiveTextPenalty - densityPenalty * 0.35),
    beauty: clampScore(100 - densityPenalty - focalPenalty - overlapPenalty * 0.75 - excessiveTextPenalty * 0.5),
    blocking: metrics.overflowElementCount > 0 || metrics.overlapPairCount > 0
  };
}

export function recommendRenderedCandidate(
  candidates: Array<{ candidateId: string; accuracy: number; accuracyGatePassed: boolean }>,
  snapshots: Array<{ candidateId: string; clarity: number; beauty: number; blocking: boolean }>,
  calibratedWeights?: { accuracy: number; clarity: number; beauty: number }
): RenderedCandidateRecommendation {
  const baselineWeights = { accuracy: 0.5, clarity: 0.3, beauty: 0.2 };
  const weightSource = calibratedWeights ? "calibrated" : "baseline";
  const weights = calibratedWeights ?? baselineWeights;
  const totalWeight = weights.accuracy + weights.clarity + weights.beauty;
  if (weights.accuracy < 0 || weights.clarity < 0 || weights.beauty < 0 || Math.abs(totalWeight - 1) > 1e-8) {
    throw new Error("Rendered recommendation weights must be non-negative and sum to 1.");
  }
  const snapshotsById = new Map(snapshots.map((snapshot) => [snapshot.candidateId, snapshot]));
  const rejected: RenderedCandidateRecommendation["rejected"] = [];
  const ranked = candidates.flatMap((candidate) => {
    if (!candidate.accuracyGatePassed) {
      rejected.push({ candidateId: candidate.candidateId, reason: "accuracy-gate" });
      return [];
    }
    const snapshot = snapshotsById.get(candidate.candidateId);
    if (!snapshot) {
      rejected.push({ candidateId: candidate.candidateId, reason: "snapshot-missing" });
      return [];
    }
    if (snapshot.blocking) {
      rejected.push({ candidateId: candidate.candidateId, reason: "render-blocking" });
      return [];
    }
    return [{
      candidateId: candidate.candidateId,
      accuracy: candidate.accuracy,
      clarity: snapshot.clarity,
      beauty: snapshot.beauty,
      total: clampScore(candidate.accuracy * weights.accuracy + snapshot.clarity * weights.clarity + snapshot.beauty * weights.beauty)
    }];
  }).sort((left, right) =>
    right.total - left.total ||
    right.accuracy - left.accuracy ||
    right.clarity - left.clarity ||
    right.beauty - left.beauty ||
    left.candidateId.localeCompare(right.candidateId)
  );
  const recommended = ranked[0];
  if (!recommended) {
    throw new Error("No rendered expression candidate passed both the accuracy gate and rendered blocking checks.");
  }
  return {
    recommendedCandidateId: recommended.candidateId,
    weights,
    weightSource,
    eligibleCandidateIds: ranked.map((candidate) => candidate.candidateId),
    ranked,
    rejected
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function findChromiumExecutable(explicitPath?: string): Promise<string> {
  const candidates = [
    explicitPath,
    process.env.PPTCREATER_BROWSER_PATH,
    process.platform === "win32" ? `${process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)"}\\Microsoft\\Edge\\Application\\msedge.exe` : undefined,
    process.platform === "win32" ? `${process.env.ProgramFiles ?? "C:\\Program Files"}\\Microsoft\\Edge\\Application\\msedge.exe` : undefined,
    process.platform === "win32" ? `${process.env.ProgramFiles ?? "C:\\Program Files"}\\Google\\Chrome\\Application\\chrome.exe` : undefined,
    process.platform === "darwin" ? "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" : undefined,
    process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined,
    process.platform === "linux" ? "/usr/bin/microsoft-edge" : undefined,
    process.platform === "linux" ? "/usr/bin/google-chrome" : undefined,
    process.platform === "linux" ? "/usr/bin/chromium" : undefined
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  throw new Error("No Chromium-family browser found. Set PPTCREATER_BROWSER_PATH to an Edge, Chrome, or Chromium executable.");
}

export async function captureCandidateSnapshots(
  plan: CandidateSnapshotPlanItem[],
  options: { browserPath?: string } = {}
): Promise<CapturedCandidateSnapshot[]> {
  if (plan.length === 0) return [];
  const executablePath = await findChromiumExecutable(options.browserPath);
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const captures: CapturedCandidateSnapshot[] = [];
    for (const item of plan) {
      await page.goto(pathToFileURL(resolve(item.studioPath)).href, { waitUntil: "load" });
      const canvas = page.locator(".native-canvas").first();
      if ((await canvas.count()) === 0) {
        throw new Error(`Studio snapshot has no .native-canvas: ${item.studioPath}`);
      }
      await page.addStyleTag({
        content: [
          "html,body{margin:0!important;width:1280px!important;height:720px!important;overflow:hidden!important;background:#fff!important}",
          "body>header,main>aside,main>section>h2,.slide>h3,.slide>details,.slide>figure{display:none!important}",
          "main,main>section,.slide{display:block!important;position:fixed!important;inset:0!important;margin:0!important;padding:0!important;width:1280px!important;height:720px!important;border:0!important;border-radius:0!important;box-shadow:none!important;overflow:hidden!important}",
          ".native-canvas{position:fixed!important;left:0!important;top:0!important;width:1280px!important;height:720px!important;min-height:720px!important;border-radius:0!important;z-index:999999!important}"
        ].join("")
      });
      const metrics = await canvas.evaluate((root): RenderedSnapshotMetrics => {
        const rootRect = root.getBoundingClientRect();
        const elements = Array.from(root.querySelectorAll<HTMLElement>(".native-text,.native-shape,.native-svg")).filter((element) => {
          const style = getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity || "1") > 0;
        });
        const textElements = elements.filter((element) => element.classList.contains("native-text"));
        const collisionElements = elements.filter((element) => element.classList.contains("native-text") || element.classList.contains("native-svg"));
        const rects = collisionElements.map((element) => ({ element, rect: element.getBoundingClientRect() }));
        let overlapPairCount = 0;
        for (let left = 0; left < rects.length; left += 1) {
          for (let right = left + 1; right < rects.length; right += 1) {
            const first = rects[left];
            const second = rects[right];
            if (!first.element.classList.contains("native-text") && !second.element.classList.contains("native-text")) continue;
            const overlapWidth = Math.max(0, Math.min(first.rect.right, second.rect.right) - Math.max(first.rect.left, second.rect.left));
            const overlapHeight = Math.max(0, Math.min(first.rect.bottom, second.rect.bottom) - Math.max(first.rect.top, second.rect.top));
            const overlapArea = overlapWidth * overlapHeight;
            const smallerArea = Math.min(first.rect.width * first.rect.height, second.rect.width * second.rect.height);
            if (smallerArea > 0 && overlapArea / smallerArea > 0.08) overlapPairCount += 1;
          }
        }
        const rootArea = Math.max(1, rootRect.width * rootRect.height);
        const areas = elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return Math.max(0, rect.width) * Math.max(0, rect.height);
        });
        const meaningfulAreas = areas.filter((area) => area / rootArea < 0.8);
        const occupiedArea = Math.min(rootArea, meaningfulAreas.reduce((sum, area) => sum + area, 0));
        return {
          width: Math.round(rootRect.width),
          height: Math.round(rootRect.height),
          overflowElementCount: textElements.filter((element) => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1).length,
          overlapPairCount,
          occupiedAreaRatio: Number((occupiedArea / rootArea).toFixed(4)),
          largestElementAreaRatio: Number(((meaningfulAreas.length ? Math.max(...meaningfulAreas) : 0) / rootArea).toFixed(4)),
          textElementCount: textElements.length
        };
      });
      await mkdir(dirname(item.snapshotPath), { recursive: true });
      await canvas.screenshot({ path: resolve(item.snapshotPath), type: "png" });
      captures.push({ ...item, metrics, score: scoreRenderedSnapshotMetrics(metrics) });
    }
    return captures;
  } finally {
    await browser.close();
  }
}
