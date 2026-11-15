// Resume ATS analyser: scores a resume against a target role the way keyword-based applicant tracking
// systems screen it, and returns concrete, explainable fixes. Pure and client-safe (runs as you type).
//
// score = 50·keywords + 20·impact + 15·structure + 15·links          (each component ∈ [0,1])
//
//  keywords   priority-weighted coverage of the role's required skills (must-have 1.0, important 0.7,
//             nice-to-have 0.45). A skill counts if its name or an alias appears as a whole word anywhere;
//             skills that appear ONLY in the skills list and never in a project get half credit, because
//             recruiters (and modern ATS ranking) weight demonstrated use over a bare list.
//  impact     share of project lines that start with an action verb and share that contain a number
//             (users, %, ms, stars …), averaged.
//  structure  required sections present, 2–6 projects, and a sensible skills-list length.
//  links      GitHub and LinkedIn present and well-formed.
import { CAREER_REQUIREMENTS, type CareerGoal } from "./careers";

export const ATS_WEIGHTS = { keywords: 0.5, impact: 0.2, structure: 0.15, links: 0.15 } as const;
const PRIORITY_WEIGHT = { 1: 1, 2: 0.7, 3: 0.45 } as const;
const ACTION_VERBS = new Set(("built developed designed implemented created engineered launched led optimized optimised reduced improved " +
  "automated deployed architected integrated migrated scaled shipped wrote trained analyzed analysed refactored delivered").split(" "));

export type ResumeInput = { education: string; skills: string; projects: string; github: string; linkedin: string };
export type KeywordResult = { skill: string; priority: 1 | 2 | 3; status: "demonstrated" | "listed" | "missing" };
export type AtsReport = {
  score: number;
  components: { keywords: number; impact: number; structure: number; links: number };
  keywords: KeywordResult[];
  suggestions: string[];
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whole-word, case-insensitive match that also works for terms with symbols (C++, Node.js, CI/CD). */
export const mentions = (text: string, term: string) => new RegExp(`(^|[^a-z0-9])${escape(term.toLowerCase())}($|[^a-z0-9])`).test(text.toLowerCase());

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const r2 = (x: number) => Math.round(x * 100) / 100;

export function analyzeResume(r: ResumeInput, goal: CareerGoal): AtsReport {
  const projects = r.projects.split("\n").map((s) => s.trim()).filter(Boolean);
  const projectText = projects.join("\n");
  const suggestions: string[] = [];

  // 1. Keyword coverage
  let got = 0, max = 0;
  const keywords: KeywordResult[] = CAREER_REQUIREMENTS[goal].map((req) => {
    const names = [req.skill, ...(req.aliases ?? [])];
    const w = PRIORITY_WEIGHT[req.priority];
    max += w;
    const inProjects = names.some((n) => mentions(projectText, n));
    const inSkills = names.some((n) => mentions(r.skills, n) || mentions(r.education, n));
    const status = inProjects ? "demonstrated" : inSkills ? "listed" : "missing";
    got += status === "demonstrated" ? w : status === "listed" ? w / 2 : 0;
    return { skill: req.skill, priority: req.priority, status };
  });
  const kw = max ? got / max : 0;
  const missingMust = keywords.filter((k) => k.status === "missing" && k.priority === 1).map((k) => k.skill);
  const listedOnly = keywords.filter((k) => k.status === "listed" && k.priority <= 2).map((k) => k.skill);
  if (missingMust.length) suggestions.push(`Add must-have ${goal} keywords you can back up: ${missingMust.join(", ")}.`);
  if (listedOnly.length) suggestions.push(`Show where you used ${listedOnly.slice(0, 3).join(", ")} in a project line; listed-only skills get half credit.`);

  // 2. Impact
  const firstWord = (p: string) => p.replace(/^[-•*\s]+/, "").split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  const body = (p: string) => p.split(/\s[—–-]\s|:\s/).slice(1).join(" ") || p; // text after "Title — "
  const verbs = projects.filter((p) => ACTION_VERBS.has(firstWord(body(p)))).length;
  const numbers = projects.filter((p) => /\d/.test(body(p))).length;
  const impact = projects.length ? (verbs + numbers) / (2 * projects.length) : 0;
  if (projects.length && numbers < projects.length) suggestions.push("Quantify results (users, % faster, response time, dataset size) in every project line.");
  if (projects.length && verbs < projects.length) suggestions.push("Start each project description with an action verb (Built, Designed, Optimized…).");

  // 3. Structure
  const skillCount = r.skills.split(/[,\n]/).map((s) => s.trim()).filter(Boolean).length;
  const checks = [r.education.trim().length > 10, skillCount >= 5 && skillCount <= 25, projects.length >= 2, projects.length <= 6];
  const structure = checks.filter(Boolean).length / checks.length;
  if (projects.length < 2) suggestions.push("Add at least two projects; for students they carry the most weight.");
  if (skillCount < 5) suggestions.push("List at least five technical skills.");
  if (skillCount > 25) suggestions.push("Trim the skills list to your strongest 15–25; long lists read as keyword stuffing.");

  // 4. Links
  const gh = /github\.com\/[A-Za-z0-9-]{1,39}/i.test(r.github), li = /linkedin\.com\/in\/[\w-]{3,}/i.test(r.linkedin);
  const links = (Number(gh) + Number(li)) / 2;
  if (!gh) suggestions.push("Add your GitHub profile (github.com/username) so reviewers can check your code.");
  if (!li) suggestions.push("Add your LinkedIn URL (linkedin.com/in/…).");

  const components = { keywords: r2(clamp01(kw)), impact: r2(clamp01(impact)), structure: r2(structure), links: r2(links) };
  const score = Math.round(100 * (ATS_WEIGHTS.keywords * kw + ATS_WEIGHTS.impact * impact + ATS_WEIGHTS.structure * structure + ATS_WEIGHTS.links * links));
  return { score, components, keywords, suggestions };
}
