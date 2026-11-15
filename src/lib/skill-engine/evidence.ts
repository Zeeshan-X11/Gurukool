// Loads skill evidence for a student from MongoDB: assessment answers + trainer-reviewed assignments.
import "server-only";
import { Assessment, Student } from "@/models";
import { TrainingAssignment, TrainingSubmission } from "@/models/train";
import type { CareerGoal } from "../careers";
import { estimateMastery, nextAssessmentTopics, type Evidence } from "./mastery";
import { canonicalSkill, skillsForGoal } from "./planner";

type Q = { topic: string; answerIndex: number };

export async function loadEvidence(studentKey: string): Promise<Evidence[]> {
  const [assessments, subs] = await Promise.all([
    Assessment.find({ studentKey, submittedAt: { $ne: null } }).select("questions answers submittedAt").lean<{ questions: Q[]; answers: number[]; submittedAt: Date }[]>(),
    TrainingSubmission.find({ studentId: studentKey, status: "REVIEWED" }).select("assignmentId score reviewedAt").lean<{ assignmentId: unknown; score: number; reviewedAt: Date }[]>(),
  ]);
  const ev: Evidence[] = [];
  for (const a of assessments)
    a.questions.forEach((q, i) => {
      const skill = canonicalSkill(q.topic);
      if (skill) ev.push({ skill, outcome: a.answers[i] === q.answerIndex ? 1 : 0, kind: "assessment", at: a.submittedAt });
    });
  if (subs.length) {
    const asg = await TrainingAssignment.find({ _id: { $in: subs.map((s) => s.assignmentId) } }).select("skillTags maxMarks").lean<{ _id: unknown; skillTags: string[]; maxMarks: number }[]>();
    const amap = new Map(asg.map((x) => [String(x._id), x]));
    for (const s of subs) {
      const a = amap.get(String(s.assignmentId));
      if (!a || !a.maxMarks) continue;
      for (const tag of a.skillTags) {
        const skill = canonicalSkill(tag);
        if (skill) ev.push({ skill, outcome: s.score / a.maxMarks, kind: "assignment", at: s.reviewedAt });
      }
    }
  }
  return ev;
}

/** Full mastery profile for the student's goal (required skills + prerequisites). */
export async function masteryProfile(studentKey: string, goal: CareerGoal) {
  const student = await Student.findOne({ key: studentKey }).select("skills").lean<{ skills: string[] }>();
  const declared = new Set((student?.skills ?? []).map(canonicalSkill).filter((x): x is string => Boolean(x)));
  const evidence = await loadEvidence(studentKey);
  const mastery = estimateMastery(skillsForGoal(goal), declared, evidence);
  return { mastery, evidenceCount: evidence.length, nextTopics: nextAssessmentTopics(mastery) };
}
