export type CandidateScoreWeights = {
  accuracy: number;
  clarity: number;
  beauty: number;
};

export type CandidateBenchmarkCandidate = {
  candidateId: string;
  grammarId: string;
  snapshotPath: string;
  accuracyGatePassed: boolean;
  scores: CandidateScoreWeights;
};

export type CandidateBenchmarkSource = {
  sourceSummaryPath: string;
  slideId: string;
  candidates: CandidateBenchmarkCandidate[];
};

export type PairwiseComparison = {
  comparisonId: string;
  reviewerId: string;
  leftCandidateId: string;
  rightCandidateId: string;
  preference: "left" | "right" | "tie";
  confidence: 1 | 2 | 3 | 4 | 5;
  dimension: "overall" | "accuracy" | "clarity" | "beauty";
  notes?: string;
  createdAt: string;
};

export type CandidatePairwiseBenchmark = {
  version: "1.0";
  benchmarkId: string;
  createdAt: string;
  sourceSummaryPath: string;
  slideId: string;
  candidates: CandidateBenchmarkCandidate[];
  comparisons: PairwiseComparison[];
};

export type CandidateCalibrationReport = {
  version: "1.0";
  status: "calibrated" | "insufficient-data";
  benchmarkIds: string[];
  sampleSize: number;
  reviewerCount: number;
  baselineWeights: CandidateScoreWeights;
  weights: CandidateScoreWeights;
  baselineAgreement: number;
  calibratedAgreement: number;
  minimumAccuracyWeight: number;
  weightStep: number;
  excludedComparisons: Array<{ comparisonId: string; reason: string }>;
};

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function requiredScore(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) throw new Error(`${label} must be a score from 0 to 100.`);
  return value;
}

export function candidateBenchmarkSourceFromSummary(value: unknown, sourceSummaryPath: string): CandidateBenchmarkSource {
  const summary = objectValue(value, "candidate summary");
  const slideId = requiredString(summary.slideId, "candidate summary slideId");
  if (!Array.isArray(summary.candidates) || summary.candidates.length < 2) throw new Error("Candidate summary requires at least two candidates.");
  const candidates = summary.candidates.map((raw, index): CandidateBenchmarkCandidate => {
    const candidate = objectValue(raw, `candidate summary candidates[${index}]`);
    const snapshotScore = objectValue(candidate.snapshotScore, `candidate ${index} snapshot score`);
    const evaluation = objectValue(candidate.evaluation, `candidate ${index} evaluation`);
    const snapshotPath = requiredString(candidate.snapshotPath, `candidate ${index} snapshot path`);
    if (typeof evaluation.accuracyGatePassed !== "boolean") throw new Error(`candidate ${index} accuracyGatePassed must be boolean.`);
    return {
      candidateId: requiredString(candidate.candidateId, `candidate ${index} id`),
      grammarId: requiredString(candidate.grammarId, `candidate ${index} grammar`),
      snapshotPath,
      accuracyGatePassed: evaluation.accuracyGatePassed,
      scores: {
        accuracy: requiredScore(evaluation.accuracy, `candidate ${index} accuracy`),
        clarity: requiredScore(snapshotScore.clarity, `candidate ${index} snapshot clarity`),
        beauty: requiredScore(snapshotScore.beauty, `candidate ${index} snapshot beauty`)
      }
    };
  });
  return { sourceSummaryPath, slideId, candidates };
}

export function parseCandidateBenchmark(value: unknown): CandidatePairwiseBenchmark {
  const benchmark = objectValue(value, "benchmark");
  if (benchmark.version !== "1.0") throw new Error("Unsupported benchmark version.");
  const candidateSource = candidateBenchmarkSourceFromSummary(
    {
      slideId: benchmark.slideId,
      candidates: Array.isArray(benchmark.candidates)
        ? benchmark.candidates.map((raw) => {
            const candidate = objectValue(raw, "benchmark candidate");
            const scores = objectValue(candidate.scores, "benchmark candidate scores");
            return {
              candidateId: candidate.candidateId,
              grammarId: candidate.grammarId,
              snapshotPath: candidate.snapshotPath,
              snapshotScore: { clarity: scores.clarity, beauty: scores.beauty },
              evaluation: { accuracy: scores.accuracy, accuracyGatePassed: candidate.accuracyGatePassed }
            };
          })
        : benchmark.candidates
    },
    requiredString(benchmark.sourceSummaryPath, "benchmark sourceSummaryPath")
  );
  if (!Array.isArray(benchmark.comparisons)) throw new Error("benchmark comparisons must be an array.");
  let parsed = createCandidateBenchmark(
    requiredString(benchmark.benchmarkId, "benchmarkId"),
    candidateSource,
    requiredString(benchmark.createdAt, "benchmark createdAt")
  );
  for (const raw of benchmark.comparisons) {
    const comparison = objectValue(raw, "benchmark comparison");
    const confidence = comparison.confidence;
    const preference = comparison.preference;
    const dimension = comparison.dimension;
    if (preference !== "left" && preference !== "right" && preference !== "tie") throw new Error("Invalid comparison preference.");
    if (dimension !== "overall" && dimension !== "accuracy" && dimension !== "clarity" && dimension !== "beauty") throw new Error("Invalid comparison dimension.");
    parsed = addPairwiseComparison(parsed, {
      comparisonId: requiredString(comparison.comparisonId, "comparisonId"),
      reviewerId: requiredString(comparison.reviewerId, "reviewerId"),
      leftCandidateId: requiredString(comparison.leftCandidateId, "leftCandidateId"),
      rightCandidateId: requiredString(comparison.rightCandidateId, "rightCandidateId"),
      preference,
      confidence: confidence as PairwiseComparison["confidence"],
      dimension,
      notes: typeof comparison.notes === "string" ? comparison.notes : undefined,
      createdAt: requiredString(comparison.createdAt, "comparison createdAt")
    });
  }
  return parsed;
}

function cloneCandidate(candidate: CandidateBenchmarkCandidate): CandidateBenchmarkCandidate {
  return { ...candidate, scores: { ...candidate.scores } };
}

export function createCandidateBenchmark(
  benchmarkId: string,
  source: CandidateBenchmarkSource,
  createdAt = new Date().toISOString()
): CandidatePairwiseBenchmark {
  if (!benchmarkId.trim()) throw new Error("benchmarkId is required.");
  if (source.candidates.length < 2) throw new Error("A pairwise benchmark requires at least two candidates.");
  const ids = source.candidates.map((candidate) => candidate.candidateId);
  if (new Set(ids).size !== ids.length) throw new Error("Benchmark candidate ids must be unique.");
  return {
    version: "1.0",
    benchmarkId,
    createdAt,
    sourceSummaryPath: source.sourceSummaryPath,
    slideId: source.slideId,
    candidates: source.candidates.map(cloneCandidate),
    comparisons: []
  };
}

function pairKey(comparison: Pick<PairwiseComparison, "reviewerId" | "leftCandidateId" | "rightCandidateId" | "dimension">): string {
  const pair = [comparison.leftCandidateId, comparison.rightCandidateId].sort().join("::");
  return `${comparison.reviewerId}::${comparison.dimension}::${pair}`;
}

export function addPairwiseComparison(
  benchmark: CandidatePairwiseBenchmark,
  comparison: PairwiseComparison
): CandidatePairwiseBenchmark {
  const candidateIds = new Set(benchmark.candidates.map((candidate) => candidate.candidateId));
  if (comparison.leftCandidateId === comparison.rightCandidateId) {
    throw new Error("Pairwise comparisons require two different candidates.");
  }
  if (!candidateIds.has(comparison.leftCandidateId) || !candidateIds.has(comparison.rightCandidateId)) {
    throw new Error("Pairwise comparison references an unknown candidate.");
  }
  if (!Number.isInteger(comparison.confidence) || comparison.confidence < 1 || comparison.confidence > 5) {
    throw new Error("Pairwise comparison confidence must be an integer from 1 to 5.");
  }
  if (benchmark.comparisons.some((item) => item.comparisonId === comparison.comparisonId)) {
    throw new Error(`Duplicate comparisonId: ${comparison.comparisonId}.`);
  }
  if (benchmark.comparisons.some((item) => pairKey(item) === pairKey(comparison))) {
    throw new Error("This reviewer has already compared the same candidate pair for this dimension.");
  }
  return {
    ...benchmark,
    candidates: benchmark.candidates.map(cloneCandidate),
    comparisons: [...benchmark.comparisons.map((item) => ({ ...item })), { ...comparison }]
  };
}

function normalizedWeights(weights: CandidateScoreWeights): CandidateScoreWeights {
  const total = weights.accuracy + weights.clarity + weights.beauty;
  if (total <= 0) throw new Error("Candidate score weights must have a positive sum.");
  return {
    accuracy: weights.accuracy / total,
    clarity: weights.clarity / total,
    beauty: weights.beauty / total
  };
}

function candidateScore(candidate: CandidateBenchmarkCandidate, weights: CandidateScoreWeights): number {
  return candidate.scores.accuracy * weights.accuracy + candidate.scores.clarity * weights.clarity + candidate.scores.beauty * weights.beauty;
}

function predictedPreference(left: number, right: number, tieTolerance = 0.5): PairwiseComparison["preference"] {
  if (Math.abs(left - right) <= tieTolerance) return "tie";
  return left > right ? "left" : "right";
}

type TrainingExample = {
  comparison: PairwiseComparison;
  left: CandidateBenchmarkCandidate;
  right: CandidateBenchmarkCandidate;
};

function weightedAgreement(examples: TrainingExample[], weights: CandidateScoreWeights): number {
  const totalConfidence = examples.reduce((sum, example) => sum + example.comparison.confidence, 0);
  if (totalConfidence === 0) return 0;
  const matched = examples.reduce((sum, example) => {
    const prediction = predictedPreference(candidateScore(example.left, weights), candidateScore(example.right, weights));
    return sum + (prediction === example.comparison.preference ? example.comparison.confidence : 0);
  }, 0);
  return Number((matched / totalConfidence).toFixed(6));
}

function weightDistance(left: CandidateScoreWeights, right: CandidateScoreWeights): number {
  return Math.abs(left.accuracy - right.accuracy) + Math.abs(left.clarity - right.clarity) + Math.abs(left.beauty - right.beauty);
}

function candidateWeightGrid(step: number, minimumAccuracyWeight: number): CandidateScoreWeights[] {
  if (!(step > 0 && step <= 0.5)) throw new Error("weightStep must be greater than 0 and no more than 0.5.");
  if (!(minimumAccuracyWeight >= 0 && minimumAccuracyWeight <= 1)) throw new Error("minimumAccuracyWeight must be between 0 and 1.");
  const scale = Math.round(1 / step);
  if (Math.abs(scale * step - 1) > 1e-8) throw new Error("weightStep must divide 1 exactly.");
  const minimumAccuracyUnits = Math.ceil(minimumAccuracyWeight * scale - 1e-8);
  const grid: CandidateScoreWeights[] = [];
  for (let accuracyUnits = minimumAccuracyUnits; accuracyUnits <= scale; accuracyUnits += 1) {
    for (let clarityUnits = 0; clarityUnits <= scale - accuracyUnits; clarityUnits += 1) {
      const beautyUnits = scale - accuracyUnits - clarityUnits;
      grid.push({ accuracy: accuracyUnits / scale, clarity: clarityUnits / scale, beauty: beautyUnits / scale });
    }
  }
  return grid;
}

export function calibrateCandidateWeights(
  benchmarks: CandidatePairwiseBenchmark[],
  options: {
    weightStep?: number;
    minimumAccuracyWeight?: number;
    baselineWeights?: CandidateScoreWeights;
    minimumComparisons?: number;
  } = {}
): CandidateCalibrationReport {
  const weightStep = options.weightStep ?? 0.05;
  const minimumAccuracyWeight = options.minimumAccuracyWeight ?? 0.3;
  const baselineWeights = normalizedWeights(options.baselineWeights ?? { accuracy: 0.5, clarity: 0.3, beauty: 0.2 });
  const minimumComparisons = options.minimumComparisons ?? 3;
  const excludedComparisons: CandidateCalibrationReport["excludedComparisons"] = [];
  const examples: TrainingExample[] = [];
  for (const benchmark of benchmarks) {
    const candidates = new Map(benchmark.candidates.map((candidate) => [candidate.candidateId, candidate]));
    for (const comparison of benchmark.comparisons) {
      if (comparison.dimension !== "overall") {
        excludedComparisons.push({ comparisonId: comparison.comparisonId, reason: "dimension-not-overall" });
        continue;
      }
      const left = candidates.get(comparison.leftCandidateId);
      const right = candidates.get(comparison.rightCandidateId);
      if (!left || !right) {
        excludedComparisons.push({ comparisonId: comparison.comparisonId, reason: "candidate-missing" });
        continue;
      }
      if (!left.accuracyGatePassed || !right.accuracyGatePassed) {
        excludedComparisons.push({ comparisonId: comparison.comparisonId, reason: "accuracy-gate-failed" });
        continue;
      }
      examples.push({ comparison, left, right });
    }
  }
  const baselineAgreement = weightedAgreement(examples, baselineWeights);
  const base = {
    version: "1.0" as const,
    benchmarkIds: benchmarks.map((benchmark) => benchmark.benchmarkId),
    sampleSize: examples.length,
    reviewerCount: new Set(examples.map((example) => example.comparison.reviewerId)).size,
    baselineWeights,
    baselineAgreement,
    minimumAccuracyWeight,
    weightStep,
    excludedComparisons
  };
  if (examples.length < minimumComparisons) {
    return { ...base, status: "insufficient-data", weights: baselineWeights, calibratedAgreement: baselineAgreement };
  }
  const ranked = candidateWeightGrid(weightStep, minimumAccuracyWeight)
    .map((weights) => ({ weights, agreement: weightedAgreement(examples, weights), distance: weightDistance(weights, baselineWeights) }))
    .sort((left, right) =>
      right.agreement - left.agreement ||
      left.distance - right.distance ||
      right.weights.accuracy - left.weights.accuracy ||
      right.weights.clarity - left.weights.clarity ||
      right.weights.beauty - left.weights.beauty
    );
  const best = ranked[0];
  return { ...base, status: "calibrated", weights: best.weights, calibratedAgreement: best.agreement };
}