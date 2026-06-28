# pptcreater Development Improvement Loop

This document defines a development harness for improving **pptcreater itself**. It is separate from
the deck-authoring agents under `.github/agents/deck-*.agent.md`, which are for producing decks.
The development loop uses pptcreater as the system under test, creates real slide artifacts, routes
failures back into code or guidance changes, and stops only when deterministic gates and QA agree.

## Goal

Raise pptcreater quality through an adversarial but controlled loop:

1. implement a focused improvement,
2. simulate realistic pptcreater usage,
3. evaluate the generated slides and logs,
4. decide whether to continue or stop.

The evaluator and QA roles should normally run on a different model from the developer role. This
reduces self-review optimism, but model judgement is never the final gate by itself.

## Roles

| Role | Agent file | Owns | May edit code? | Typical model policy |
| --- | --- | --- | --- | --- |
| Development Lead | `.github/agents/pptcreater-dev-lead.agent.md` | WorkItem, implementation, integration | Yes | implementation-oriented model |
| User Simulator | `.github/agents/pptcreater-dev-user.agent.md` | realistic pptcreater usage scenarios and generated artifacts | No repo code edits | user-like or lower-context model |
| Evaluator | `.github/agents/pptcreater-dev-evaluator.agent.md` | artifact critique and PatchRequest creation | No | stricter / different model from developer |
| QA Gatekeeper | `.github/agents/pptcreater-dev-qa.agent.md` | stop/continue decision and risk acceptance | No | conservative / different model from developer |

## Core Artifacts

### WorkItem

```json
{
  "id": "dev-loop-001",
  "title": "Make architecture diagrams selectable via recommend_figure",
  "objective": "Architecture diagrams should be first-class generated figures, not fallback guidance.",
  "scope": ["packages/core/src/figureSelector.ts", "packages/core/src/figureSelector.test.ts"],
  "outOfScope": ["render-pptx internals", "template import behavior"],
  "acceptance": [
    "pptcreater figure routes architecture wording to generate_native_diagram",
    "focused tests pass",
    "full tests pass"
  ],
  "maxIterations": 3,
  "modelPolicy": {
    "developer": "implementation model",
    "userSimulator": "usage simulation model",
    "evaluator": "different critique model",
    "qa": "different conservative model"
  }
}
```

### ScenarioSpec

The User Simulator writes one `ScenarioSpec` per generated test deck.

```json
{
  "id": "scenario-technical-architecture",
  "purpose": "customer-facing technical deck",
  "contentMode": "technical",
  "requiredExpressions": ["architecture", "timeline", "table", "structured-text"],
  "requiredTools": ["recommend_figure", "generate_native_diagram", "finalize", "review"],
  "expectedArtifacts": ["deck.json", "pptx", "studio.html", "review.txt", "finalize.txt"]
}
```

### EvalReport

The Evaluator turns generated artifacts into concrete development feedback.
Detailed scoring rules, required evidence, severity, and PatchRequest criteria are defined in
[`dev-loop-evaluator-criteria.md`](dev-loop-evaluator-criteria.md).

```json
{
  "scenarioId": "scenario-technical-architecture",
  "deterministic": {
    "finalizeBlockingErrors": 0,
    "reviewBlockingIssues": 0,
    "zipZeroNonDir": 0
  },
  "modelReview": {
    "messageFit": 4,
    "visualFit": 3,
    "editability": 5,
    "toolDiscipline": 2
  },
  "patchRequests": [
    {
      "severity": "high",
      "problem": "The deck used hand-built SVG for an architecture slide.",
      "evidence": "slide 4, no generate_native_diagram call in tool ledger",
      "expected": "recommend_figure should route architecture wording to generate_native_diagram",
      "suggestedScope": ["packages/core/src/figureSelector.ts"]
    }
  ]
}
```

### QAReport

The QA Gatekeeper decides whether the loop stops.

```json
{
  "workItemId": "dev-loop-001",
  "iteration": 2,
  "decision": "continue",
  "reasons": ["scenario-technical-architecture still has high severity PatchRequest"],
  "requiredNextWork": ["Add architecture intent to recommend_figure"],
  "acceptedRisks": []
}
```

## Loop

```mermaid
flowchart LR
  WI[WorkItem] --> DEV[Development Lead]
  DEV --> DIFF[Code / guidance diff]
  DIFF --> USER[User Simulator]
  USER --> ART[Deck artifacts + tool ledger]
  ART --> EVAL[Evaluator]
  EVAL --> PR[PatchRequest list]
  PR --> QA[QA Gatekeeper]
  QA -- continue --> WI2[Next WorkItem]
  WI2 --> DEV
  QA -- stop --> DONE[Ready to commit / PR]
```

## Deterministic Gates

Every iteration should run the cheapest relevant gates first, then widen.

Required for code changes:

- `npm run build`
- focused tests for touched modules
- `npm test -- --reporter=dot` before merge/commit

Required for generated deck artifacts:

- `pptcreater finalize <deck.json> --output <deck.pptx>` with `Blocking errors: 0`
- `pptcreater review <polished.deck.json>` with `Ready to finalize: no blocking issues`
- PPTX zip check: zero-length non-directory entries must be `0`
- source/reference checks when external URLs are used

Required for agent/tool discipline:

- role execution ledger records role, model, subagent vs in-process execution, and evidence
- User Simulator must call pptcreater CLI/MCP surfaces, not only hand-author DeckSpec
- Evaluator and QA must not modify code

## Model Separation

The harness should not hard-code model names in repository guidance, because model availability is
host-specific. Instead, the orchestrator supplies model names at invocation time and records them in
the ledger:

```json
{
  "role": "Evaluator",
  "agent": "pptcreater-dev-evaluator",
  "model": "<host-selected critique model>",
  "execution": "subagent",
  "artifact": "generated/dev-loop-runs/run-001/eval-report.json"
}
```

Recommended routing:

- Development Lead: strongest implementation model available.
- User Simulator: model close to normal user behavior, sometimes deliberately less specialized.
- Evaluator: different, strict critique model.
- QA Gatekeeper: conservative model, with deterministic gates treated as authoritative.

## Failure Taxonomy

| Failure | Owner | Typical fix |
| --- | --- | --- |
| Build/test failure | Development Lead | code repair, focused tests |
| pptcreater tool not used | User Simulator or Development Lead | improve scenario prompt or guidance |
| Generated slide has blocking lint | Development Lead | fix generator / layout / schema |
| Generated slide passes lint but looks wrong | Evaluator | create PatchRequest with visual evidence |
| Evaluator and deterministic gates disagree | QA Gatekeeper | request human review or another scenario |
| Loop repeats without progress | QA Gatekeeper | stop, summarize blocker, lower scope |

## Minimum Viable Harness

Phase 1 is manual-but-structured:

1. Write a WorkItem.
2. Development Lead implements.
3. User Simulator creates 2-3 representative decks.
4. Evaluator writes EvalReport.
5. QA Gatekeeper decides stop/continue.

Phase 2 can add `scripts/dev-loop/` to create run folders, execute deterministic gates, and collect
artifacts automatically.

Phase 3 can run on PRs or nightly CI, but only after the manual loop produces useful PatchRequests
without excessive noise.

## Relation To Deck Authoring Agents

The existing `Deck Director`, `Deck Designer`, and related agents remain useful as the **system under
test**. They are not the same as the development loop roles above. For example, the User Simulator
may invoke `Deck Director` to create a deck, while the Evaluator checks whether that invocation used
the expected pptcreater tools and produced a high-quality artifact.