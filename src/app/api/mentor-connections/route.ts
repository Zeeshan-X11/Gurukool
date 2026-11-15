// GET  /api/mentor-connections — list student's connections
// POST /api/mentor-connections — send a connection request to a mentor
import { NextResponse } from "next/server";
import { getPersona, UnauthorizedError } from "@/lib/persona";
import { connectDB } from "@/lib/db";
import { MentorConnection, Mentor } from "@/models/connect";

export async function GET() {
  try {
    const persona = await getPersona();
    await connectDB();
    const conns = await MentorConnection.find({ studentId: persona.uid })
      .populate("mentorId", "name designation organization expertise verified")
      .sort({ createdAt: -1 })
      .lean();
    return NextResponse.json({ connections: conns });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to fetch connections" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const persona = await getPersona();
    const { mentorId, message } = await req.json();
    if (!mentorId) return NextResponse.json({ error: "mentorId required" }, { status: 400 });
    await connectDB();
    const mentor = await Mentor.findById(mentorId).lean();
    if (!mentor) return NextResponse.json({ error: "Mentor not found" }, { status: 404 });

    const pairKey = `${persona.uid}::${mentorId}`;
    // Check if already connected or pending
    const existing = await MentorConnection.findOne({ pairKey });
    if (existing) {
      if (existing.status === "accepted") return NextResponse.json({ error: "Already connected" }, { status: 409 });
      if (existing.status === "pending") return NextResponse.json({ error: "Request already sent" }, { status: 409 });
      // If rejected previously, allow re-request by deleting old one
      await MentorConnection.deleteOne({ _id: existing._id });
    }

    await MentorConnection.create({
      studentId: persona.uid,
      studentName: persona.uid,
      mentorId,
      message: message ? String(message).trim().slice(0, 500) : "",
      pairKey,
    });
    return NextResponse.json({ message: "Connection request sent" }, { status: 201 });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to send request" }, { status: 500 });
  }
}
