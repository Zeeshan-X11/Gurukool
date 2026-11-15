# ADR-0001: Deterministic engines at the core; the LLM is an optional, validated layer

**Status:** Accepted

## Context
The first version asked an LLM for assessments and roadmaps and returned whatever it said. That made the product non-reproducible, impossible to unit-test, dependent on a paid API key, and able to show confident nonsense (wrong answer keys, a roadmap that teaches React before JavaScript).

## Decision
- Every feature has a deterministic engine that produces a complete, correct result on its own: the Skill Intelligence Engine (Learn), the Mentor Match Engine (Connect), the Training Recommender (Train), TF-IDF ranking (Compete) and the ATS analyser (Grow).
- The LLM is used only where language helps (question wording, stage descriptions, explanations). It gets the engine's result as a constraint: for example, "keep this prerequisite order", or "one question per skill from this focus list".
- LLM output is **untrusted input**. It is parsed with zod schemas (`src/lib/ai-schemas.ts`), bounded in length, and checked for invariants such as four distinct options and a valid answer index. Any failure falls back to the engine.
- The UI always labels the source ("AI-generated" vs "Skill Engine plan (AI not used)"). The product never presents engine output as AI output, or the other way round.
- AI calls are rate-limited per user (30/hour). Hitting the limit degrades to the engine instead of returning an error.

## Alternatives considered
- **LLM-only with retries:** still non-deterministic, still untestable, and costs grow with retries.
- **Function-calling / JSON mode only:** guarantees *shape* but not *correctness*. We still need our own validation and a fallback.

## Consequences
- All core logic is pure TypeScript and covered by unit tests (`tests/`).
- The platform is fully usable with no AI key, which matters for demos and for students without paid API access.
- We maintain a curated career skill map and prerequisite graph by hand. This is a deliberate trade: correctness and explainability over coverage.
