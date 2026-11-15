import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { apiError, badRequest } from "@/lib/api";
import { requireRole } from "@/lib/persona";
import { isCareerGoal } from "@/lib/careers";
import { Student } from "@/models";
import { masteryProfile } from "@/lib/skill-engine/evidence";
import { MODEL } from "@/lib/skill-engine";

export const dynamic = "force-dynamic";

// GET ?goal= — Bayesian mastery per skill (required + prerequisites) and the adaptive next-quiz topics.
export async function GET(req: Request) {
  try {
    const me = await requireRole("student");
    await connectDB();
    const student = await Student.findOne({ key: me.id }).select("careerGoal").lean<{ careerGoal: string }>();
    const goal = new URL(req.url).searchParams.get("goal") ?? student?.careerGoal;
    if (!isCareerGoal(goal)) return badRequest("Pick a valid career goal");
    const profile = await masteryProfile(me.id, goal);
    return NextResponse.json({ goal, ...profile, model: { halfLifeDays: MODEL.halfLifeDays, masteredLowerBound: MODEL.masteredLowerBound } });
  } catch (e) {
    return apiError(e);
  }
}
