import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Assessment, Roadmap, Student } from "@/models";
import { requireRole } from "@/lib/persona";
import { apiError, badRequest } from "@/lib/api";
import { CAREER_REQUIREMENTS, analyzeSkillGap, isCareerGoal, youtubeSearchUrl } from "@/lib/careers";
import { chatJSON, isAiConfigured } from "@/lib/ai";
import { masteryProfile } from "@/lib/skill-engine/evidence";
import { buildPlan } from "@/lib/skill-engine";
import { RoadmapSchema, parseOr } from "@/lib/ai-schemas";
import { POLICIES, hit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

type Stage = { topic: string; description: string; duration: string; reason?: string; prerequisites?: string[] };

const validStages = (x: unknown): Stage[] | null => parseOr(RoadmapSchema, x)?.stages ?? null;

export async function POST(req: Request) {
  try {
    const KEY = (await requireRole("student")).id;
    const { goal } = await req.json().catch(() => ({}));
    if (!isCareerGoal(goal)) return badRequest("Pick a valid career goal");
    await connectDB();
    const student = await Student.findOne({ key: KEY }).lean();
    if (!student) return badRequest("Save your student profile first (Dashboard).");

    const gap = analyzeSkillGap(student.skills ?? [], goal);
    const lastAssessment = await Assessment.findOne({ studentKey: KEY, careerGoal: goal, submittedAt: { $ne: null } })
      .sort({ submittedAt: -1 })
      .lean<{ score: number; total: number; weakTopics: string[] }>();
    const weak = lastAssessment?.weakTopics ?? [];
    // Skill Intelligence Engine: Bayesian mastery → prerequisite-aware, urgency-ordered plan.
    const { mastery } = await masteryProfile(KEY, goal);
    const plan = buildPlan(goal, mastery);

    let stages: Stage[] | null = null;
    let source: "ai" | "rules" = "rules";
    let aiError: string | null = null;

    const quota = isAiConfigured() ? await hit(`ai:${KEY}`, POLICIES.ai) : null;
    if (quota && !quota.allowed) aiError = `Hourly AI limit reached; using the Skill Engine plan instead.`;
    if (quota?.allowed) {
      try {
        const data = await chatJSON<unknown>([
          { role: "system", content: "You are an expert engineering learning-path designer. Respond with JSON only." },
          {
            role: "user",
            content: `Design a step-by-step learning roadmap (5 to 8 stages) for a semester-${student.semester} ${student.branch} student to become a ${goal}.
Already knows: ${gap.existing.join(", ") || "nothing relevant yet"}.
Missing skills (priority order): ${gap.missing.join(", ") || "none"}.
Assessment: ${lastAssessment ? `${lastAssessment.score}/${lastAssessment.total}, weak topics: ${weak.join(", ") || "none"}` : "not taken yet"}.
Our skill engine computed this prerequisite-respecting order (keep it, you may merge or rename stages): ${plan.map((p) => p.topic).join(" → ") || "all required skills mastered"}.
Finish with a portfolio project.
Each stage "topic" must be a short searchable topic name (2-6 words).
Return JSON: {"stages":[{"topic":string,"description":string (1-2 sentences, concrete),"duration":string like "2 weeks"}]}`,
          },
        ]);
        stages = validStages(data);
        if (stages) source = "ai";
        else aiError = "AI returned a malformed roadmap; planned it with the Skill Intelligence Engine instead.";
      } catch (e) {
        aiError = `AI generation failed (${e instanceof Error ? e.message : e}); planned it with the Skill Intelligence Engine instead.`;
      }
    }
    if (!stages) {
      stages = plan.map(({ topic, description, duration, reason, prerequisites }) => ({ topic, description, duration, reason, prerequisites }));
      stages.push({ topic: `${goal} Capstone Project`, description: `Build and deploy a portfolio project combining ${CAREER_REQUIREMENTS[goal].slice(0, 4).map((r) => r.skill).join(", ")}. Push it to GitHub with a README.`, duration: "3 weeks", reason: "Demonstrates the skills end-to-end" });
    }

    const roadmap = await Roadmap.create({
      studentKey: KEY,
      careerGoal: goal,
      source,
      basedOn: { missingSkills: gap.missing, weakTopics: weak, mastery: mastery.map((m) => ({ skill: m.skill, mean: m.mean, status: m.status })) },
      stages: stages.map((s) => ({ ...s, youtubeUrl: youtubeSearchUrl(s.topic), completed: false })),
    });
    return NextResponse.json({ roadmap: roadmap.toObject(), aiConfigured: isAiConfigured(), aiError });
  } catch (e) {
    return apiError(e);
  }
}

export async function GET() {
  try {
    const KEY = (await requireRole("student")).id;
    await connectDB();
    const roadmap = await Roadmap.findOne({ studentKey: KEY }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ roadmap });
  } catch (e) {
    return apiError(e);
  }
}
