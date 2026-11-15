# ADR-0003: Explainable weighted scoring for recommendations

**Status:** Accepted

## Context
Students and judges should be able to see *why* a mentor, course or hackathon was recommended. A black-box ranking (embeddings, collaborative filtering) would need data we don't have (no interaction history at launch) and couldn't explain itself.

## Decision
- **Mentors** (`src/lib/mentor-matching/`): `0.4·weakness + 0.3·roadmap + 0.2·careerGoal + 0.1·availability`. Weakness uses assessment evidence when it exists and is otherwise labelled "interest-based". Roadmap coverage weights stage *i* by 1/(i+1), so earlier stages matter more. A mentor whose only signal is availability is never shown.
- **Courses** (`src/lib/training-matching/`): the same structure with weights 0.5/0.3/0.2.
- **Term matching** is tiered: exact/contains first, then synonyms in **both directions**, then shared non-generic keywords. This order prevents "Node.js Fundamentals" from matching "Express.js" when "Node.js" is available.
- **Hackathons** (`src/lib/compete-ranking.ts`): a TF-IDF vector space with sublinear TF and smoothed IDF **fitted on the currently loaded events**, so a theme that every event has ("Beginner Friendly") carries almost no weight. Fields are weighted: themes ×2, title ×1, organiser ×0.5 on the event side; interests ×3, goal ×2, skills ×1 on the profile side. Cosine similarity is length-normalised, so long descriptions don't win by size. The top contributing terms are shown as "Why".
- **Resumes** (`src/lib/ats.ts`): keyword coverage weighted by skill priority. A skill gets full credit when it appears in a project line and half credit when it is only listed, which reflects how reviewers read resumes.

## Alternatives considered
- **Embeddings / semantic search:** better recall on unseen phrasing, but it needs an API call per document, isn't explainable, and isn't reproducible in tests. It could be added later as one more scored component.
- **BM25:** better than TF-IDF for long documents. Our documents are short tag lists, where the difference is negligible and cosine gives a bounded 0–100% score that is easier to show.

## Consequences
- Every score comes with a component breakdown and a sentence-level explanation.
- Weights are constants with unit tests asserting that they sum to 1. Tuning them is a one-line change, made visible in code review.
