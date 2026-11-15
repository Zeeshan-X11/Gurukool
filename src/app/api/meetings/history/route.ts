// Ported from SparkMeet: getUserHistory controller
// GET /api/meetings/history — returns all meetings for the signed-in user
import { NextResponse } from "next/server";
import { getPersona, UnauthorizedError } from "@/lib/persona";
import { connectDB } from "@/lib/db";
import { Meeting } from "@/lib/models/Meeting";

export async function GET() {
  try {
    const persona = await getPersona();
    await connectDB();
    const meetings = await Meeting.find({ user_id: persona.uid })
      .sort({ date: -1 })
      .limit(50)
      .lean();
    return NextResponse.json({ meetings });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to fetch meeting history" }, { status: 500 });
  }
}
