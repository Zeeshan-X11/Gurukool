import { describe, expect, it } from "vitest";
import {
  CycleError, PREREQUISITES, assertAcyclic, buildPlan, canonicalSkill, estimateMastery, nextAssessmentTopics,
  posterior, prerequisiteClosure, prioritizedTopoSort, skillsForGoal, decay, MODEL, type Evidence,
} from "@/lib/skill-engine";

const NOW = new Date("2026-11-15T00:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const quiz = (skill: string, correct: boolean, days = 0): Evidence => ({ skill, outcome: correct ? 1 : 0, kind: "assessment", at: ago(days) });

describe("prerequisite graph", () => {
  it("is a DAG", () => expect(() => assertAcyclic()).not.toThrow());

  it("detects cycles", () => {
    expect(() => assertAcyclic({ A: ["B"], B: ["C"], C: ["A"] })).toThrow(CycleError);
  });

  it("computes the transitive prerequisite closure", () => {
    expect([...prerequisiteClosure(["Next.js"])].sort()).toEqual(["CSS", "HTML", "JavaScript", "Next.js", "React"]);
    expect(prerequisiteClosure(["MLOps"]).has("Git")).toBe(true); // MLOps → Docker → Git
  });

  it("topological order always puts prerequisites first", () => {
    const nodes = new Set(Object.keys(PREREQUISITES));
    const order = prioritizedTopoSort(nodes, () => 1);
    const pos = new Map(order.map((s, i) => [s, i]));
    expect(order).toHaveLength(nodes.size);
    for (const [s, pre] of Object.entries(PREREQUISITES)) for (const p of pre) expect(pos.get(p)!).toBeLessThan(pos.get(s)!);
  });

  it("breaks ties by urgency, then deterministically by name", () => {
    const g = { A: [], B: [], C: ["A"] };
    expect(prioritizedTopoSort(new Set(["A", "B", "C"]), (s) => (s === "B" ? 2 : 1), g)).toEqual(["B", "A", "C"]);
    expect(prioritizedTopoSort(new Set(["A", "B"]), () => 1, g)).toEqual(["A", "B"]);
  });
});

describe("Bayesian mastery", () => {
  it("uses informative priors for declared vs undeclared skills", () => {
    const [declared, none] = estimateMastery(["SQL", "Git"], new Set(["SQL"]), [], NOW);
    expect(declared.mean).toBeCloseTo(0.6);
    expect(none.mean).toBeCloseTo(0.25);
    expect(declared.status).not.toBe("mastered"); // self-report alone never proves mastery
    expect(declared.verified).toBe(false);
  });

  it("posterior matches the Beta formulas", () => {
    const p = posterior(3, 2);
    expect(p.mean).toBeCloseTo(0.6);
    expect(p.sd).toBeCloseTo(Math.sqrt(6 / (25 * 6)));
  });

  it("correct answers raise the mean and shrink uncertainty", () => {
    const before = estimateMastery(["SQL"], new Set(), [], NOW)[0];
    const after = estimateMastery(["SQL"], new Set(), Array.from({ length: 12 }, () => quiz("SQL", true)), NOW)[0];
    expect(after.mean).toBeGreaterThan(before.mean);
    expect(after.sd).toBeLessThan(before.sd);
    expect(after.status).toBe("mastered");
  });

  it("decays old evidence with the configured half-life", () => {
    expect(decay(ago(MODEL.halfLifeDays), NOW)).toBeCloseTo(0.5);
    const fresh = estimateMastery(["SQL"], new Set(), [quiz("SQL", false)], NOW)[0];
    const stale = estimateMastery(["SQL"], new Set(), [quiz("SQL", false, 365)], NOW)[0];
    expect(stale.mean).toBeGreaterThan(fresh.mean); // an old wrong answer hurts less
  });

  it("weights a trainer-graded assignment above a single quiz answer", () => {
    const viaQuiz = estimateMastery(["SQL"], new Set(), [quiz("SQL", true)], NOW)[0];
    const viaAssignment = estimateMastery(["SQL"], new Set(), [{ skill: "SQL", outcome: 1, kind: "assignment", at: NOW }], NOW)[0];
    expect(viaAssignment.mean).toBeGreaterThan(viaQuiz.mean);
  });

  it("adaptive assessment picks the most uncertain, non-mastered skills", () => {
    const evidence = Array.from({ length: 10 }, () => quiz("SQL", true));
    const m = estimateMastery(["SQL", "Git", "Docker"], new Set(["Git"]), evidence, NOW);
    const next = nextAssessmentTopics(m, 2);
    expect(next).not.toContain("SQL");
    expect(next).toHaveLength(2);
  });
});

describe("roadmap planner", () => {
  it("maps free text to canonical skills", () => {
    expect(canonicalSkill("nodejs")).toBe("Node.js");
    expect(canonicalSkill("Express.js")).toBe("Node.js");
    expect(canonicalSkill("dsa")).toBe("Data Structures & Algorithms");
    expect(canonicalSkill("cooking")).toBeNull();
  });

  it("orders a Frontend plan so prerequisites come first and skips mastered skills", () => {
    const evidence = Array.from({ length: 10 }, () => quiz("HTML", true));
    const m = estimateMastery(skillsForGoal("Frontend Developer"), new Set(), evidence, NOW);
    const plan = buildPlan("Frontend Developer", m, 20).map((s) => s.topic);
    expect(plan).not.toContain("HTML");
    expect(plan.indexOf("CSS")).toBeLessThan(plan.indexOf("React"));
    expect(plan.indexOf("JavaScript")).toBeLessThan(plan.indexOf("React"));
    expect(plan.indexOf("React")).toBeLessThan(plan.indexOf("Next.js"));
  });

  it("adds implicit prerequisites with an explanation", () => {
    const m = estimateMastery(skillsForGoal("AI/ML Engineer"), new Set(), [], NOW);
    const stage = buildPlan("AI/ML Engineer", m, 30).find((s) => s.topic === "Docker");
    expect(stage?.reason).toBe("Prerequisite for a required skill");
  });

  it("gives shorter durations to stronger skills", () => {
    const m = estimateMastery(["SQL", "JavaScript"], new Set(["SQL"]), [], NOW);
    const plan = buildPlan("Backend Developer", m, 30);
    const w = (t: string) => plan.find((s) => s.topic === t)!.weeks;
    expect(w("SQL")).toBeLessThan(w("JavaScript"));
  });
});
