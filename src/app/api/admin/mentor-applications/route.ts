// GET /api/admin/mentor-applications — list all applications (admin only)
import { NextResponse } from "next/server";
import { getPersona, UnauthorizedError } from "@/lib/persona";
import { connectDB } from "@/lib/db";
import { MentorApplication } from "@/models/connect";

export async function GET(req: Request) {
  try {
    const persona = await getPersona();
    if (persona.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "pending";
    await connectDB();
    const apps = await MentorApplication.find(status === "all" ? {} : { status })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return NextResponse.json({ applications: apps });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to fetch applications" }, { status: 500 });
  }
}
