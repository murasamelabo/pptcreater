import { describe, expect, it } from "vitest";
import {
  addPairwiseComparison,
  calibrateCandidateWeights,
  candidateBenchmarkSourceFromSummary,
  createCandidateBenchmark,
  type CandidateBenchmarkSource
} from "./candidateBenchmark.js";

const SOURCE: CandidateBenchmarkSource = {
  sourceSummaryPath: "generated/candidates/candidate-summary.json",
  slideId: "responsibility-boundary",
  candidates: [
    {
      candidateId: "comparison",
      grammarId: "comparison-field",
      snapshotPath: "generated/candidates/comparison.png",
      accuracyGatePassed: true,
      scores: { accuracy: 100, clarity: 85, beauty: 60 }
    },
    {
      candidateId: "table",
      grammarId: "table-text-system",
      snapshotPath: "generated/candidates/table.png",
      accuracyGatePassed: true,
      scores: { accuracy: 92, clarity: 88, beauty: 75 }
    },
    {
      candidateId: "board",
      grammarId: "evidence-board",
      snapshotPath: "generated/candidates/board.png",
      accuracyGatePassed: true,
      scores: { accuracy: 82, clarity: 90, beauty: 100 }
    }
  ]
};

describe("candidate pairwise benchmark", () => {
  it("derives benchmark features from a rendered candidate summary", () => {
    const source = candidateBenchmarkSourceFromSummary(
      {
        slideId: "responsibility-boundary",
        candidates: SOURCE.candidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          grammarId: candidate.grammarId,
          snapshotPath: candidate.snapshotPath,
          snapshotScore: { clarity: candidate.scores.clarity, beauty: candidate.scores.beauty, blocking: false },
          evaluation: { accuracy: candidate.scores.accuracy, accuracyGatePassed: candidate.accuracyGatePassed }
        }))
      },
      SOURCE.sourceSummaryPath
    );

    expect(source).toEqual(SOURCE);
    expect(() => candidateBenchmarkSourceFromSummary({
      slideId: "x",
      candidates: [
        { candidateId: "a", grammarId: "comparison-field", evaluation: { accuracy: 90, accuracyGatePassed: true }, snapshotScore: { clarity: 80, beauty: 70 } },
        { candidateId: "b", grammarId: "table-text-system", snapshotPath: "b.png", evaluation: { accuracy: 85, accuracyGatePassed: true }, snapshotScore: { clarity: 82, beauty: 72 } }
      ]
    }, "bad.json")).toThrow(/snapshot/u);
  });

  it("stores immutable candidate features and human comparison provenance", () => {
    const benchmark = createCandidateBenchmark("auth-web-v1", SOURCE, "2026-07-10T00:00:00.000Z");
    const updated = addPairwiseComparison(benchmark, {
      comparisonId: "review-001",
      reviewerId: "reviewer-a",
      leftCandidateId: "comparison",
      rightCandidateId: "table",
      preference: "right",
      confidence: 4,
      dimension: "overall",
      notes: "Table is easier to scan.",
      createdAt: "2026-07-10T00:01:00.000Z"
    });

    expect(updated.version).toBe("1.0");
    expect(updated.benchmarkId).toBe("auth-web-v1");
    expect(updated.candidates).toEqual(SOURCE.candidates);
    expect(updated.comparisons).toHaveLength(1);
    expect(updated.comparisons[0]).toEqual(expect.objectContaining({ reviewerId: "reviewer-a", preference: "right", confidence: 4 }));
    expect(benchmark.comparisons).toEqual([]);
  });

  it("rejects comparisons that are ambiguous, duplicated, or reference unknown candidates", () => {
    const benchmark = createCandidateBenchmark("auth-web-v1", SOURCE, "2026-07-10T00:00:00.000Z");
    expect(() => addPairwiseComparison(benchmark, {
      comparisonId: "bad-same",
      reviewerId: "reviewer-a",
      leftCandidateId: "comparison",
      rightCandidateId: "comparison",
      preference: "left",
      confidence: 3,
      dimension: "overall",
      createdAt: "2026-07-10T00:01:00.000Z"
    })).toThrow(/different candidates/u);
    expect(() => addPairwiseComparison(benchmark, {
      comparisonId: "bad-missing",
      reviewerId: "reviewer-a",
      leftCandidateId: "comparison",
      rightCandidateId: "missing",
      preference: "right",
      confidence: 3,
      dimension: "overall",
      createdAt: "2026-07-10T00:01:00.000Z"
    })).toThrow(/unknown candidate/u);
  });

  it("calibrates non-negative weights against human overall preferences and reports baseline improvement", () => {
    let benchmark = createCandidateBenchmark("auth-web-v1", SOURCE, "2026-07-10T00:00:00.000Z");
    benchmark = addPairwiseComparison(benchmark, {
      comparisonId: "pair-1", reviewerId: "reviewer-a", leftCandidateId: "comparison", rightCandidateId: "table",
      preference: "right", confidence: 5, dimension: "overall", createdAt: "2026-07-10T00:01:00.000Z"
    });
    benchmark = addPairwiseComparison(benchmark, {
      comparisonId: "pair-2", reviewerId: "reviewer-a", leftCandidateId: "table", rightCandidateId: "board",
      preference: "right", confidence: 5, dimension: "overall", createdAt: "2026-07-10T00:02:00.000Z"
    });
    benchmark = addPairwiseComparison(benchmark, {
      comparisonId: "pair-3", reviewerId: "reviewer-b", leftCandidateId: "comparison", rightCandidateId: "board",
      preference: "right", confidence: 4, dimension: "overall", createdAt: "2026-07-10T00:03:00.000Z"
    });

    const report = calibrateCandidateWeights([benchmark], {
      weightStep: 0.1,
      minimumAccuracyWeight: 0.3,
      baselineWeights: { accuracy: 0.5, clarity: 0.3, beauty: 0.2 }
    });

    expect(report.status).toBe("calibrated");
    expect(report.sampleSize).toBe(3);
    expect(report.weights.accuracy).toBeGreaterThanOrEqual(0.3);
    expect(report.weights.accuracy + report.weights.clarity + report.weights.beauty).toBeCloseTo(1, 8);
    expect(report.calibratedAgreement).toBeGreaterThan(report.baselineAgreement);
    expect(report.calibratedAgreement).toBe(1);
    expect(report.weights.beauty).toBeGreaterThan(0.2);
    expect(report.benchmarkIds).toEqual(["auth-web-v1"]);
  });

  it("excludes human comparisons that include an accuracy-gate failure", () => {
    const gatedSource: CandidateBenchmarkSource = {
      ...SOURCE,
      candidates: SOURCE.candidates.map((candidate) => candidate.candidateId === "board" ? { ...candidate, accuracyGatePassed: false } : candidate)
    };
    let benchmark = createCandidateBenchmark("gated-v1", gatedSource, "2026-07-10T00:00:00.000Z");
    benchmark = addPairwiseComparison(benchmark, {
      comparisonId: "gated-pair", reviewerId: "reviewer-a", leftCandidateId: "table", rightCandidateId: "board",
      preference: "right", confidence: 5, dimension: "overall", createdAt: "2026-07-10T00:01:00.000Z"
    });

    const report = calibrateCandidateWeights([benchmark], { minimumComparisons: 1 });

    expect(report.sampleSize).toBe(0);
    expect(report.status).toBe("insufficient-data");
    expect(report.excludedComparisons).toContainEqual({ comparisonId: "gated-pair", reason: "accuracy-gate-failed" });
  });
});
