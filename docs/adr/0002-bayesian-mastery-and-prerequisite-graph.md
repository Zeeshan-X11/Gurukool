# ADR-0002: Bayesian skill mastery and a prerequisite DAG for Learn

**Status:** Accepted

## Context
"Readiness %" used to be the share of required skills the student *typed into their profile*. A student who typed "React" was treated as knowing React, one wrong quiz answer counted as much as ten right ones, and roadmaps ignored dependencies between skills.

## Decision

### Mastery: a Beta–Bernoulli model per skill (`src/lib/skill-engine/mastery.ts`)
- The prior is Beta(3,2) (mean 0.6) for a declared skill and Beta(1,3) (mean 0.25) otherwise. A self-report shifts belief but is weak evidence.
- Each piece of evidence adds `w·d·outcome` to α and `w·d·(1−outcome)` to β, where:
  - `w` is 1 for a quiz answer and 3 for a trainer-graded assignment. A graded practical task is stronger evidence than a single MCQ.
  - `d = 0.5^(age/60 days)`. Skills fade, and old evidence should count less than recent evidence.
  - `outcome` ∈ [0,1], so assignment marks are used fractionally (7/10 → 0.7).
- **Mastered** means the 80% one-sided credible lower bound (mean − 1.2816·sd) is ≥ 0.6. We use the lower bound, not the mean, so the system has to be *confident*, not just optimistic. With the declared prior and no evidence, this can never happen, so self-reports alone never yield "mastered".

### Adaptive assessment: uncertainty sampling
The next quiz targets the non-mastered skills with the highest posterior standard deviation, i.e. the ones where one more answer tells us the most. This is the standard active-learning heuristic, and it avoids re-testing what we already know.

### Planning: prerequisite DAG plus a priority topological sort (`graph.ts`, `planner.ts`)
- A hand-curated prerequisite graph (e.g. Next.js ← React ← JavaScript, HTML, CSS; MLOps ← ML, Docker).
- `assertAcyclic` (three-colour DFS) guards the graph. A cycle would make planning impossible, so the test suite fails if someone adds one.
- The plan is the **prerequisite closure** of the goal's required skills, minus mastered skills, ordered by **Kahn's algorithm with a max-heap** keyed on `urgency = (1 − mean) × importance`. Prerequisites inherit the importance of the most important skill that depends on them, so a must-have's foundations come early.
- Ties break by name, so the same inputs always give the same plan.
- Stage length is `clamp(round(4·(1 − mean)), 1, 4)` weeks. Each stage carries a human-readable reason and its prerequisites.

## Alternatives considered
- **Item Response Theory (2PL):** more principled per-question difficulty, but it needs calibrated item parameters we don't have. Beta–Bernoulli is the right fit for sparse data and gives honest uncertainty.
- **Bayesian Knowledge Tracing (HMM):** models learning over time, but needs per-skill learn/slip/guess parameters. Exponential decay gives us most of the benefit at a fraction of the complexity.
- **Plain DFS topological order:** correct, but it ignores urgency. The heap lets us respect dependencies *and* do the most valuable work first.

## Consequences
- Every number in the UI can be explained: mean, ±sd band, evidence count, and the reason for each stage.
- The weights, priors and half-life live in `MODEL`, a single constant that tests pin down.
- The prerequisite graph needs maintenance as careers are added.
