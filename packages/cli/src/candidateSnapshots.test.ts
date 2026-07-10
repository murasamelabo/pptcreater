import { describe, expect, it } from "vitest";
import { buildCandidateSnapshotPlan, recommendRenderedCandidate, scoreRenderedSnapshotMetrics } from "./candidateSnapshots.js";

describe("candidate snapshot adapter", () => {
  it("builds deterministic PNG paths from candidate Studio artifacts", () => {
    const plan = buildCandidateSnapshotPlan("generated/candidates", [
      {
        candidateId: "slide-comparison-field-candidate",
        grammarId: "comparison-field",
        scoreRank: 1,
        studioPath: "generated/candidates/candidate-01-comparison-field.studio.html"
      },
      {
        candidateId: "slide-table-text-system-candidate",
        grammarId: "table-text-system",
        scoreRank: 2,
        studioPath: "generated/candidates/candidate-02-table-text-system.studio.html"
      }
    ]);

    expect(plan).toEqual([
      expect.objectContaining({
        candidateId: "slide-comparison-field-candidate",
        snapshotPath: "generated/candidates/candidate-01-comparison-field.png"
      }),
      expect.objectContaining({
        candidateId: "slide-table-text-system-candidate",
        snapshotPath: "generated/candidates/candidate-02-table-text-system.png"
      })
    ]);
  });

  it("penalizes rendered overflow and overlap while rewarding focal hierarchy and balanced occupancy", () => {
    const clean = scoreRenderedSnapshotMetrics({
      width: 1280,
      height: 720,
      overflowElementCount: 0,
      overlapPairCount: 0,
      occupiedAreaRatio: 0.58,
      largestElementAreaRatio: 0.32,
      textElementCount: 8
    });
    const broken = scoreRenderedSnapshotMetrics({
      width: 1280,
      height: 720,
      overflowElementCount: 3,
      overlapPairCount: 4,
      occupiedAreaRatio: 0.91,
      largestElementAreaRatio: 0.08,
      textElementCount: 18
    });

    expect(clean.clarity).toBeGreaterThan(broken.clarity);
    expect(clean.beauty).toBeGreaterThan(broken.beauty);
    expect(clean.blocking).toBe(false);
    expect(broken.blocking).toBe(true);
    expect(clean.clarity).toBeGreaterThanOrEqual(80);
    expect(broken.clarity).toBeLessThan(50);
  });

  it("recommends only accuracy-gated, non-blocking candidates using rendered clarity and beauty", () => {
    const recommendation = recommendRenderedCandidate(
      [
        { candidateId: "accurate-table", accuracy: 92, accuracyGatePassed: true },
        { candidateId: "beautiful-but-inaccurate", accuracy: 64, accuracyGatePassed: false },
        { candidateId: "accurate-but-overflowing", accuracy: 100, accuracyGatePassed: true }
      ],
      [
        { candidateId: "accurate-table", clarity: 88, beauty: 76, blocking: false },
        { candidateId: "beautiful-but-inaccurate", clarity: 98, beauty: 99, blocking: false },
        { candidateId: "accurate-but-overflowing", clarity: 40, beauty: 90, blocking: true }
      ]
    );

    expect(recommendation.recommendedCandidateId).toBe("accurate-table");
    expect(recommendation.eligibleCandidateIds).toEqual(["accurate-table"]);
    expect(recommendation.rejected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ candidateId: "beautiful-but-inaccurate", reason: "accuracy-gate" }),
        expect.objectContaining({ candidateId: "accurate-but-overflowing", reason: "render-blocking" })
      ])
    );
    expect(recommendation.ranked[0].total).toBe(Math.round(92 * 0.5 + 88 * 0.3 + 76 * 0.2));
  });
});