// Ported from SparkMeet: addToHistory controller
// POST /api/meetings/add — records a meeting the user joined
import { NextResponse } from "next/server";
import { getPersona, UnauthorizedError } from "@/lib/persona";
import { connectDB } from "@/lib/db";
import { Meeting } from "@/lib/models/Meeting";

export async function POST(req: Request) {
  try {
    const persona = await getPersona();
    const { meeting_code } = await req.json();
    if (!meeting_code) return NextResponse.json({ error: "meeting_code required" }, { status: 400 });
    await connectDB();
    const meeting = new Meeting({ user_id: persona.uid, meetingCode: meeting_code });
    await meeting.save();
    return NextResponse.json({ message: "Added to history" }, { status: 201 });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to add meeting" }, { status: 500 });
  }
}
