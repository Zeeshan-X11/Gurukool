// Ranks live hackathons by TF-IDF cosine relevance to the student's profile.
// IDF is fitted on the hackathons currently loaded, so themes every event has ("Beginner Friendly")
// carry little weight and distinctive ones ("Machine Learning/AI") carry a lot.
import { CAREER_REQUIREMENTS, isCareerGoal } from "./careers";
import { TfIdf, cosine, tokenize } from "./text/tfidf";

export type RankableHackathon = { id: string; title: string; organization: string; themes: string[] };
export type Profile = { interests: string[]; careerGoal: string; skills: string[] };
export type Ranked = { id: string; relevance: number; matchedTerms: string[] };

const hackathonFields = (h: RankableHackathon) => [
  { text: h.themes.join(" . "), weight: 2 }, // themes are curated tags → strongest signal
  { text: h.title, weight: 1 },
  { text: h.organization, weight: 0.5 },
];

export function profileFields(p: Profile) {
  const required = isCareerGoal(p.careerGoal) ? CAREER_REQUIREMENTS[p.careerGoal].filter((r) => r.priority === 1).map((r) => r.skill) : [];
  return [
    { text: p.interests.join(" . "), weight: 3 }, // what the student said they care about
    { text: p.careerGoal, weight: 2 },
    { text: [...p.skills, ...required].join(" . "), weight: 1 },
  ];
}

export function rankHackathons(hackathons: RankableHackathon[], p: Profile): Map<string, Ranked> {
  const model = new TfIdf().fit(hackathons.map((h) => hackathonFields(h).flatMap((f) => tokenize(f.text))));
  const q = model.vector(profileFields(p));
  return new Map(hackathons.map((h) => {
    const { score, terms } = cosine(q, model.vector(hackathonFields(h)));
    return [h.id, { id: h.id, relevance: Math.round(score * 100), matchedTerms: terms }];
  }));
}
