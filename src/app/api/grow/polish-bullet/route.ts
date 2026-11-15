// POST /api/grow/polish-bullet
// AI polishes a rough project/experience bullet point for a resume
import { NextResponse } from "next/server";
import { chat, isAiConfigured, AiNotConfiguredError } from "@/lib/ai";
import { getPersona, UnauthorizedError } from "@/lib/persona";

export async function POST(req: Request) {
  try {
    await getPersona(); // must be signed in
    if (!isAiConfigured()) throw new AiNotConfiguredError();
    const { text, role } = await req.json();
    if (!text || String(text).trim().length < 5) {
      return NextResponse.json({ error: "Provide some text to polish" }, { status: 400 });
    }
    const result = await chat([
      {
        role: "system",
        content: `You are a professional resume writer. Polish the given rough project or experience description into a single strong ATS-friendly resume bullet point.
Rules:
- Start with a strong action verb (Built, Developed, Designed, Implemented, etc.)
- Include what was built, what tech was used, and the impact/result if possible
- Keep it to 1-2 lines max
- Do NOT add fake numbers or metrics the user didn't mention
- Target role: ${role || "Software Engineer"}
- Return ONLY the bullet point text, no explanation, no dash prefix`,
      },
      { role: "user", content: String(text).trim().slice(0, 500) },
    ], { maxTokens: 150 });
    return NextResponse.json({ polished: result.trim() });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e instanceof AiNotConfiguredError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: "Failed to polish bullet" }, { status: 500 });
  }
}
