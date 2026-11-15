import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Assessment, Student } from "@/models";
import { requireRole } from "@/lib/persona";
import { apiError, badRequest } from "@/lib/api";
import { analyzeSkillGap, isCareerGoal } from "@/lib/careers";
import { chatJSON, isAiConfigured } from "@/lib/ai";
import { masteryProfile } from "@/lib/skill-engine/evidence";
import { bankQuestions, type MCQ } from "@/lib/questionBank";
import { AssessmentSchema, parseOr } from "@/lib/ai-schemas";
import { POLICIES, hit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const validQuestions = (x: unknown): MCQ[] | null => parseOr(AssessmentSchema, x)?.questions ?? null;

/** Strip answers before sending to the browser — scoring happens server-side. */
function publicView(a: { _id: unknown; careerGoal: string; source: string; questions: MCQ[] }) {
  return {
    id: String(a._id),
    careerGoal: a.careerGoal,
    source: a.source,
    questions: a.questions.map((q) => ({ question: q.question, options: q.options, topic: q.topic })),
  };
}

export async function POST(req: Request) {
  try {
    const KEY = (await requireRole("student")).id;
    const { goal } = await req.json().catch(() => ({}));
    if (!isCareerGoal(goal)) return badRequest("Pick a valid career goal");
    await connectDB();
    const student = await Student.findOne({ key: KEY }).lean();
    if (!student) return badRequest("Save your student profile first (Dashboard).");

    let questions: MCQ[] | null = null;
    let source: "ai" | "question-bank" = "question-bank";
    let aiError: string | null = null;

    const quota = isAiConfigured() ? await hit(`ai:${KEY}`, POLICIES.ai) : null;
    if (quota && !quota.allowed) aiError = `Hourly AI limit reached; using the question bank instead.`;
    if (quota?.allowed) {
      const gap = analyzeSkillGap(student.skills ?? [], goal);
      // Adaptive assessment: target the skills whose mastery estimate is most uncertain.
      const { nextTopics } = await masteryProfile(KEY, goal);
      const focus = nextTopics.length ? nextTopics : gap.required;
      try {
        const data = await chatJSON<unknown>([
          { role: "system", content: "You write accurate technical multiple-choice questions. Respond with JSON only." },
          {
            role: "user",
            content: `Create exactly 5 multiple-choice questions to assess a semester-${student.semester} ${student.branch} student aiming to be a ${goal}.
Write one question per skill, in this order (they are the skills we are least certain about): ${focus.join(", ")}.
Each question must have exactly 4 options, one correct answer, beginner-to-intermediate difficulty, no ambiguity.
Return JSON: {"questions":[{"question":string,"options":[string,string,string,string],"answerIndex":0-3,"explanation":string,"topic":string}]}
"topic" must be exactly the skill name the question tests, one of: ${focus.join(" | ")}.`,
          },
        ]);
        questions = validQuestions(data);
        if (questions) source = "ai";
        else aiError = "AI returned malformed questions; using the question bank instead.";
      } catch (e) {
        aiError = `AI generation failed (${e instanceof Error ? e.message : e}); using the question bank instead.`;
      }
    }
    if (!questions) questions = bankQuestions(goal);

    const doc = await Assessment.create({
      studentKey: KEY,
      careerGoal: goal,
      source,
      questions,
      total: questions.length,
    });
    return NextResponse.json({ assessment: publicView(doc.toObject()), aiConfigured: isAiConfigured(), aiError });
  } catch (e) {
    return apiError(e);
  }
}

export async function GET() {
  try {
    const KEY = (await requireRole("student")).id;
    await connectDB();
    const latest = await Assessment.findOne({ studentKey: KEY, submittedAt: { $ne: null } })
      .sort({ submittedAt: -1 })
      .lean<{ _id: unknown; careerGoal: string; score: number; total: number; weakTopics: string[]; source: string; submittedAt: Date }>();
    const count = await Assessment.countDocuments({ studentKey: KEY, submittedAt: { $ne: null } });
    return NextResponse.json({
      latest: latest && {
        id: String(latest._id), careerGoal: latest.careerGoal, score: latest.score, total: latest.total,
        weakTopics: latest.weakTopics, source: latest.source, submittedAt: latest.submittedAt,
      },
      count,
    });
  } catch (e) {
    return apiError(e);
  }
}
