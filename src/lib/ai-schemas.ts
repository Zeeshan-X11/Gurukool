// Runtime schemas for LLM output. Model responses are untrusted input: they are parsed, bounded and
// rejected if malformed, and the caller then falls back to the deterministic engine (never a fake answer).
import { z } from "zod";

const text = (max: number) => z.coerce.string().trim().min(1).transform((s) => s.slice(0, max));

export const McqSchema = z.object({
  question: text(500),
  options: z.array(text(200)).length(4).refine((o) => new Set(o.map((x) => x.toLowerCase())).size === 4, "options must be distinct"),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.coerce.string().default("").transform((s) => s.slice(0, 600)),
  topic: z.coerce.string().default("General").transform((s) => s.slice(0, 80) || "General"),
});
export const AssessmentSchema = z.object({ questions: z.array(McqSchema).min(5).transform((q) => q.slice(0, 5)) });

export const StageSchema = z.object({
  topic: text(120),
  description: text(600),
  duration: z.coerce.string().default("").transform((s) => s.slice(0, 40)),
});
export const RoadmapSchema = z.object({ stages: z.array(StageSchema).min(3).transform((s) => s.slice(0, 10)) });

/** Parse or return null — callers treat null as "AI output rejected". */
export function parseOr<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, data: unknown): T | null {
  const r = schema.safeParse(data);
  return r.success ? r.data : null;
}
