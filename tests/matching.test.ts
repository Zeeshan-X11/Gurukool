import { describe, expect, it } from "vitest";
import { matchTerm } from "@/lib/mentor-matching/match";
import { matchMentor, rankMentors, WEIGHTS, type MatchMentor, type StudentSignals } from "@/lib/mentor-matching";
import { recommendTraining, matchCourse, TRAIN_WEIGHTS, type MatchCourse } from "@/lib/training-matching";

// Wednesday 11 Nov 2026, 10:00 IST
const NOW = new Date("2026-11-11T04:30:00Z");
const weekend = [{ day: "Saturday", start: "10:00", end: "11:00" }, { day: "Sunday", start: "10:00", end: "11:00" }];

const backend: MatchMentor = { id: "m1", name: "A", expertise: ["Node.js", "SQL"], teachingTopics: ["REST APIs"], domains: ["Backend Development"], availability: weekend };
const ml: MatchMentor = { id: "m2", name: "B", expertise: ["Machine Learning"], teachingTopics: ["PyTorch"], domains: ["AI/ML"], availability: [] };
const signals: StudentSignals = {
  careerGoal: "Backend Developer", requiredSkills: ["Node.js", "SQL", "REST APIs"], missingSkills: ["SQL", "REST APIs"],
  weakTopics: ["Node.js", "SQL"], roadmapTopics: ["REST APIs", "Docker"], interests: [],
};

describe("matchTerm", () => {
  it("prefers direct over synonym matches", () => {
    expect(matchTerm("Node.js Fundamentals", ["Express.js", "Node.js"])).toBe("Node.js");
    expect(matchTerm("dsa", ["Data Structures & Algorithms"])).toBe("Data Structures & Algorithms");
    expect(matchTerm("Data Structures & Algorithms", ["Interview prep"])).toBe("Interview prep");
  });
  it("ignores generic words", () => expect(matchTerm("Advanced Fundamentals", ["Fundamentals of cooking"])).toBeNull());
});

describe("Mentor Match Engine", () => {
  it("weights sum to 1", () => expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1));

  it("scores a fully relevant mentor with explainable components", () => {
    const r = matchMentor(backend, signals, NOW);
    expect(r.components.weakness).toBe(1);
    expect(r.components.careerGoal).toBe(1);
    expect(r.components.availability).toBe(1);
    expect(r.components.roadmap).toBeCloseTo(0.67, 2); // REST APIs (w=1) hit, Docker (w=1/2) miss → 1/1.5
    expect(r.basis).toBe("evidence");
    expect(r.explanation).toMatch(/assessment indicates difficulty with Node\.js and SQL/);
  });

  it("never ranks irrelevant mentors, and orders by score", () => {
    const ranked = rankMentors([ml, backend], signals, 3, NOW);
    expect(ranked.map((r) => r.mentorId)).toEqual(["m1"]);
  });

  it("falls back to interests and labels it", () => {
    const r = matchMentor(backend, { ...signals, weakTopics: [], interests: ["Backend"] }, NOW);
    expect(r.basis).toBe("interest");
    expect(r.explanation).toMatch(/Interest-based/);
  });
});

describe("Training Recommender", () => {
  const course: MatchCourse = { id: "c1", title: "Backend Bootcamp", category: "Backend Development", skillTags: ["Node.js", "SQL"], moduleTitles: ["Module 1: REST APIs"] };
  it("weights sum to 1", () => expect(Object.values(TRAIN_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1));
  it("strips module prefixes and matches roadmap topics", () => {
    const m = matchCourse(course, signals);
    expect(m.relevantSkills.some((x) => x.courseTerm === "REST APIs")).toBe(true);
    expect(m.matchScore).toBeGreaterThan(80);
  });
  it("filters out courses with no weakness or roadmap signal", () => {
    const off: MatchCourse = { id: "c2", title: "Paint", category: "Art", skillTags: ["Watercolor"], moduleTitles: [] };
    expect(recommendTraining([off, course], signals).map((x) => x.courseId)).toEqual(["c1"]);
  });
});
