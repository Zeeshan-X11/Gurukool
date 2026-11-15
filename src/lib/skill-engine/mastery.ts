// Bayesian skill mastery: each skill's proficiency p ∈ [0,1] is modelled as Beta(α, β).
// Evidence updates the distribution conjugately (Beta–Bernoulli), weighted by evidence
// type and exponentially decayed by age, so recent, verified evidence dominates.

export type Evidence = {
  skill: string;
  /** Fraction correct in [0,1]: 1/0 for a quiz answer, marks/max for a graded assignment. */
  outcome: number;
  kind: "assessment" | "assignment";
  at: Date;
};

export type Mastery = {
  skill: string;
  alpha: number;
  beta: number;
  mean: number;          // E[p]
  sd: number;            // posterior standard deviation (uncertainty)
  lower: number;         // ~80% one-sided credible lower bound (normal approximation)
  evidenceCount: number;
  selfReported: boolean;
  status: "mastered" | "developing" | "gap";
  verified: boolean;     // at least one piece of assessment/assignment evidence
};

export const MODEL = {
  priorDeclared: { alpha: 3, beta: 2 },   // student says they know it: mean 0.6, weak
  priorUndeclared: { alpha: 1, beta: 3 }, // not listed: mean 0.25
  weight: { assessment: 1, assignment: 3 }, // a trainer-graded assignment counts as 3 quiz answers
  halfLifeDays: 60,
  masteredLowerBound: 0.6,
  developingMean: 0.5,
  z: 1.2816, // one-sided 80% quantile of N(0,1)
} as const;

const DAY = 86_400_000;

export const decay = (at: Date, now: Date) => Math.pow(0.5, Math.max(0, now.getTime() - at.getTime()) / DAY / MODEL.halfLifeDays);

export function posterior(alpha: number, beta: number) {
  const n = alpha + beta;
  const mean = alpha / n;
  const sd = Math.sqrt((alpha * beta) / (n * n * (n + 1)));
  return { mean, sd, lower: Math.max(0, mean - MODEL.z * sd) };
}

export function estimateMastery(skills: string[], declared: Set<string>, evidence: Evidence[], now = new Date()): Mastery[] {
  return skills.map((skill) => {
    const prior = declared.has(skill) ? MODEL.priorDeclared : MODEL.priorUndeclared;
    let alpha: number = prior.alpha, beta: number = prior.beta, count = 0;
    for (const e of evidence) {
      if (e.skill !== skill) continue;
      const w = MODEL.weight[e.kind] * decay(e.at, now);
      const o = Math.min(1, Math.max(0, e.outcome));
      alpha += w * o;
      beta += w * (1 - o);
      count++;
    }
    const { mean, sd, lower } = posterior(alpha, beta);
    const status = lower >= MODEL.masteredLowerBound ? "mastered" : mean >= MODEL.developingMean ? "developing" : "gap";
    const r = (x: number) => Math.round(x * 1000) / 1000;
    return { skill, alpha: r(alpha), beta: r(beta), mean: r(mean), sd: r(sd), lower: r(lower), evidenceCount: count, selfReported: declared.has(skill), status, verified: count > 0 };
  });
}

/**
 * Uncertainty sampling for adaptive assessment: probe the skills whose estimate is least certain,
 * preferring required, unverified and not-yet-mastered skills.
 */
export function nextAssessmentTopics(m: Mastery[], k = 5): string[] {
  return [...m]
    .filter((x) => x.status !== "mastered")
    .sort((a, b) => b.sd + (b.verified ? 0 : 0.05) - (a.sd + (a.verified ? 0 : 0.05)) || a.skill.localeCompare(b.skill))
    .slice(0, k)
    .map((x) => x.skill);
}
