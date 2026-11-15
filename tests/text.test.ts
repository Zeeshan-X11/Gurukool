import { describe, expect, it } from "vitest";
import { TfIdf, cosine, tokenize } from "@/lib/text/tfidf";
import { rankHackathons } from "@/lib/compete-ranking";
import { analyzeResume, mentions } from "@/lib/ats";
import { AssessmentSchema, RoadmapSchema, parseOr } from "@/lib/ai-schemas";

describe("tokenizer", () => {
  it("folds phrases and synonyms and drops stop words", () => {
    expect(tokenize("Machine Learning/AI for Healthcare")).toEqual(["machine_learning", "ai", "health"]);
    expect(tokenize("AI/ML")).toEqual(["ai", "machine_learning"]);
    expect(tokenize("The Global Hackathon 2026")).toEqual([]);
  });
});

describe("TF-IDF", () => {
  const model = new TfIdf().fit([["web", "beginner"], ["ai", "beginner"], ["blockchain", "beginner"]]);
  it("down-weights terms that appear everywhere", () => expect(model.idfOf("beginner")).toBeLessThan(model.idfOf("ai")));
  it("produces unit vectors and cosine in [0,1]", () => {
    const v = model.vector([{ text: "ai beginner", weight: 1 }]);
    expect(Math.hypot(...v.values())).toBeCloseTo(1);
    expect(cosine(v, v).score).toBeCloseTo(1);
    expect(cosine(v, model.vector([{ text: "blockchain", weight: 1 }])).score).toBe(0);
  });
});

describe("hackathon ranking", () => {
  const hs = [
    { id: "a", title: "Chain Jam", organization: "", themes: ["Blockchain", "Beginner Friendly"] },
    { id: "b", title: "HealthAI", organization: "", themes: ["Machine Learning/AI", "Health", "Beginner Friendly"] },
    { id: "c", title: "Hack the Web", organization: "", themes: ["Web", "Beginner Friendly"] },
  ];
  it("ranks the AI event first for an AI/ML student and explains why", () => {
    const r = rankHackathons(hs, { interests: ["AI", "healthcare"], careerGoal: "AI/ML Engineer", skills: ["Python"] });
    const order = [...r.values()].sort((x, y) => y.relevance - x.relevance).map((x) => x.id);
    expect(order[0]).toBe("b");
    expect(r.get("b")!.matchedTerms).toEqual(expect.arrayContaining(["ai", "health"]));
    expect(r.get("a")!.relevance).toBe(0);
  });
  it("ranks the web event first for a frontend student", () => {
    const r = rankHackathons(hs, { interests: ["web"], careerGoal: "Frontend Developer", skills: ["React"] });
    expect([...r.values()].sort((x, y) => y.relevance - x.relevance)[0].id).toBe("c");
  });
});

describe("ATS analyser", () => {
  it("matches symbol-containing terms as whole words", () => {
    expect(mentions("Built with Node.js and C++", "node.js")).toBe(true);
    expect(mentions("Built with Node.js and C++", "c++")).toBe(true);
    expect(mentions("javascript", "java")).toBe(false);
  });

  const strong = {
    education: "B.Tech Computer Science, Example University, 2027",
    skills: "JavaScript, Node.js, SQL, Git, MongoDB, Docker",
    projects: "ShopAPI — Built a REST APIs backend in Node.js with SQL serving 2,000 users\nAlgoViz — Implemented 12 data structures and algorithms visualisers, 300 GitHub stars",
    github: "github.com/student", linkedin: "linkedin.com/in/student",
  };

  it("gives demonstrated skills full credit and listed-only half", () => {
    const r = analyzeResume(strong, "Backend Developer");
    const by = Object.fromEntries(r.keywords.map((k) => [k.skill, k.status]));
    expect(by["Node.js"]).toBe("demonstrated");
    expect(by["MongoDB"]).toBe("listed");
    expect(by["System Design"]).toBe("missing");
    expect(r.components.impact).toBe(1);
    expect(r.components.links).toBe(1);
    expect(r.score).toBeGreaterThan(75);
  });

  it("scores an empty resume low with actionable suggestions", () => {
    const r = analyzeResume({ education: "", skills: "", projects: "", github: "", linkedin: "" }, "Backend Developer");
    expect(r.score).toBeLessThan(10);
    expect(r.suggestions.join(" ")).toMatch(/must-have/);
    expect(r.suggestions.join(" ")).toMatch(/GitHub/);
  });
});

describe("LLM output validation", () => {
  const q = { question: "What is 2+2?", options: ["1", "2", "3", "4"], answerIndex: 3, topic: "Math" };
  it("accepts well-formed output and trims to 5 questions", () => {
    expect(parseOr(AssessmentSchema, { questions: Array(7).fill(q) })?.questions).toHaveLength(5);
  });
  it.each([
    ["too few questions", { questions: [q] }],
    ["answer index out of range", { questions: Array(5).fill({ ...q, answerIndex: 4 }) }],
    ["duplicate options", { questions: Array(5).fill({ ...q, options: ["a", "a", "b", "c"] }) }],
    ["not an object", "sure! here are your questions"],
  ])("rejects %s", (_, data) => expect(parseOr(AssessmentSchema, data)).toBeNull());
  it("bounds roadmap field lengths", () => {
    const r = parseOr(RoadmapSchema, { stages: Array(3).fill({ topic: "x".repeat(500), description: "d" }) });
    expect(r?.stages[0].topic).toHaveLength(120);
  });
});
