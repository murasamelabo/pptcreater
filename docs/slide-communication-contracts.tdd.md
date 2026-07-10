# Slide Communication Contracts TDD Evidence

## Scope

This implementation adds the first slice of the proposed semantic slide-generation architecture. Narrative planning now derives a `SlideCommunicationContract` before selecting a visual grammar, links each `ExpressionPlan` to that contract, and persists the contracts as a planning artifact.

Candidate generation, render-and-rank, image-based beauty scoring, and human-preference calibration are not part of this slice.

## User Journeys

- As a deck reader, I want a responsibility-boundary slide to encode who owns each responsibility, so that a comparison layout communicates the actual boundary instead of only looking comparative.
- As a decision maker, I want an explicit two-axis decision slide to preserve both axes, so that plotted positions and the selected visual grammar can be justified.
- As a downstream evaluator, I want communication contracts persisted beside expression plans, so that later candidate generation and review can test the intended reader understanding.

## TDD Evidence

| Stage | Evidence |
| --- | --- |
| RED | `npm test -- packages/core/src/narrativePlanning.test.ts --reporter=dot` failed 2 tests because `communicationContracts` did not exist. |
| RED commit | `3c0961d test: define slide communication contracts` |
| Initial GREEN | The same focused target passed 13 tests after implementing contract inference and relation-guided grammar selection. |
| Regression found | Full suite exposed an architecture regression: a synthesized structured diagram was routed to `sequential-path`. |
| Regression repair | Explicit `intent.diagram` data now takes precedence over inferred relation and legacy `visualType`. |
| Focused final | `npm test -- packages/core/src/messageDeck.test.ts packages/core/src/narrativePlanning.test.ts --reporter=dot` passed 46 tests. |
| Full final | `npm test -- --reporter=dot` passed 29 files / 438 tests. |
| Build | `npm run build` passed. |
| Diff | `git diff --check` passed. |
| CLI smoke | `from-message-map` generated `slide-communication-contracts.json`; one responsibility contract linked to one `comparison-field` expression plan. |
| GREEN commit | `dae6dc1 Add slide communication contracts` |

## Guaranteed Behaviors

| # | Guarantee | Test or check | Result |
| --- | --- | --- | --- |
| 1 | Responsibility rows produce a `responsibility` contract with entities, comparison axes, a reader test, and protected context. | `narrativePlanning.test.ts` | PASS |
| 2 | Explicit two-axis wording produces a `tradeoff` contract and `decision-surface` grammar. | `narrativePlanning.test.ts` | PASS |
| 3 | Every expression plan references its communication contract. | Unit test and CLI smoke | PASS |
| 4 | Structured diagrams remain spatial or layered even when their previous visual type suggests a sequence. | `messageDeck.test.ts` full regression | PASS |
| 5 | Both CLI planning paths persist `slide-communication-contracts.json`. | Build plus CLI smoke | PASS |

## Known Gaps

- Entity and axis extraction is deterministic and intentionally narrow; it does not yet use a general semantic graph parser.
- `readerTest` is generated as a review contract but is not yet executed against rendered images or human comprehension responses.
- The repository has no coverage script, so an 80% coverage report was not produced. Focused and full test suites were used instead.
- Custom review agents could not access the live diff in their environment; local type diagnostics, focused tests, full tests, build, CLI smoke, and diff checks provide the available verification evidence.

## Expression Candidate Ranking Slice

The second slice generates up to three expression candidates for each communication contract and records separate Accuracy, Clarity, Beauty, and weighted total scores. Accuracy contributes 50%, Clarity 30%, and Beauty 20%. Candidates below the Accuracy gate cannot be selected.

Until candidate DeckSpecs are actually rendered and visually compared, the production selection policy is explicitly `primary-grammar-until-rendered`. This preserves current deck output while exposing scored alternatives for the next implementation slice.

| Stage | Evidence |
| --- | --- |
| RED | `npm test -- packages/core/src/narrativePlanning.test.ts --reporter=dot` failed 2 tests because `expressionCandidateSets` did not exist. |
| RED commit | `e94fdf9 test: define expression candidate ranking` |
| Regression 1 | Focused planning tests found an ecosystem table changed to `comparison-field`; primary-grammar compatibility was restored. |
| Regression 2 | Planning plus message-deck tests found a detail report changed to `table-text-system`; provisional selection was fixed to the existing primary grammar. |
| Focused final | `npm test -- packages/core/src/narrativePlanning.test.ts packages/core/src/messageDeck.test.ts --reporter=dot` passed 46 tests. |
| Full final | `npm test -- --reporter=dot` passed 29 files / 438 tests. |
| Build | `npm run build` passed. |
| CLI smoke | `expression-candidates.json` contained 3 candidates with score ranks 1-3, selected `comparison-field`, Accuracy 100, Clarity 92, Beauty 91, passed Accuracy gate, and matched `ExpressionPlan.selectedCandidateId`. |
| GREEN commit | `deed903 Add ranked expression candidates` |

### Additional Guarantees

| # | Guarantee | Result |
| --- | --- | --- |
| 6 | Each communication contract produces a bounded candidate set with deterministic three-axis scores. | PASS |
| 7 | Accuracy-gate failures remain visible but cannot become the selected production candidate. | PASS |
| 8 | `scoreRank` records score order independently from provisional production selection. | PASS |
| 9 | Existing grammar output remains unchanged until rendered candidate comparison is implemented. | PASS |
| 10 | Both CLI planning paths persist `expression-candidates.json`. | PASS |
