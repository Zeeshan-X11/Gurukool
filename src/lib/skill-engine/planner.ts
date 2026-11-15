// Roadmap planner: from mastery estimates to an ordered, explainable learning plan.
import { CAREER_REQUIREMENTS, type CareerGoal } from "../careers";
import { PREREQUISITES, prerequisiteClosure, prioritizedTopoSort } from "./graph";
import type { Mastery } from "./mastery";

export type PlanStage = { topic: string; description: string; duration: string; weeks: number; reason: string; prerequisites: string[] };

const PRIORITY_WEIGHT = { 1: 1, 2: 0.7, 3: 0.45 } as const;

/** Canonical skill name for free text (career skills + aliases), or null. */
export function canonicalSkill(text: string): string | null {
  const n = text.toLowerCase().replace(/[^a-z0-9+#]/g, "");
  if (!n) return null;
  for (const reqs of Object.values(CAREER_REQUIREMENTS))
    for (const r of reqs)
      if ([r.skill, ...(r.aliases ?? [])].some((a) => a.toLowerCase().replace(/[^a-z0-9+#]/g, "") === n)) return r.skill;
  return null;
}

/** Every skill the plan may include for a goal: required skills plus their transitive prerequisites. */
export function skillsForGoal(goal: CareerGoal) {
  return [...prerequisiteClosure(CAREER_REQUIREMENTS[goal].map((r) => r.skill))];
}

/**
 * Urgency of a skill = (1 − mean mastery) × importance, where importance is the career priority weight,
 * or for an implicit prerequisite the max importance of anything that depends on it.
 */
export function buildPlan(goal: CareerGoal, mastery: Mastery[], maxStages = 9): PlanStage[] {
  const req = new Map(CAREER_REQUIREMENTS[goal].map((r) => [r.skill, PRIORITY_WEIGHT[r.priority]]));
  const m = new Map(mastery.map((x) => [x.skill, x]));
  const todo = new Set(skillsForGoal(goal).filter((s) => m.get(s)?.status !== "mastered"));
  // An implicit prerequisite inherits the highest importance among the required skills that need it.
  const imp = new Map<string, number>();
  for (const [skill, w] of req) for (const s of prerequisiteClosure([skill])) imp.set(s, Math.max(imp.get(s) ?? 0, w));
  const importance = (s: string): number => imp.get(s) ?? 0.5;
  const urgency = (s: string) => (1 - (m.get(s)?.mean ?? 0.25)) * importance(s);

  return prioritizedTopoSort(todo, urgency).slice(0, maxStages).map((skill) => {
    const x = m.get(skill);
    const mean = x?.mean ?? 0.25;
    const weeks = Math.max(1, Math.min(4, Math.round(4 * (1 - mean))));
    const prerequisites = (PREREQUISITES[skill] ?? []).filter((p) => todo.has(p));
    const implicit = !req.has(skill);
    const reason = implicit
      ? "Prerequisite for a required skill"
      : x?.verified
        ? `Estimated mastery ${Math.round(mean * 100)}% from ${x.evidenceCount} piece(s) of evidence`
        : x?.selfReported
          ? "Self-reported but not yet verified by an assessment"
          : "Required for your career goal and not yet demonstrated";
    const description = x?.selfReported && !x.verified
      ? `Verify ${skill}: take a focused quiz and solve a few practice problems to confirm your level.`
      : x && x.verified && x.status === "developing"
        ? `Strengthen ${skill}: revise the topics you missed and complete a hands-on exercise.`
        : `Learn ${skill}: core concepts first, then build a small exercise that uses it.`;
    return { topic: skill, description, duration: `${weeks} week${weeks > 1 ? "s" : ""}`, weeks, reason, prerequisites };
  });
}
