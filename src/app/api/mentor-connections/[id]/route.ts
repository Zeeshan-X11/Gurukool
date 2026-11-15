// PATCH /api/mentor-connections/:id — accept or reject (mentor/admin only for now)
// For now students can also withdraw their own pending request
import { NextResponse } from "next/server";
import { getPersona, UnauthorizedError } from "@/lib/persona";
import { connectDB } from "@/lib/db";
import { MentorConnection } from "@/models/connect";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const persona = await getPersona();
    const { id } = await params;
    const { status } = await req.json(); // "accepted" | "rejected" | "withdrawn"
    if (!["accepted", "rejected", "withdrawn"].includes(status)) {
      return NextResponse.json({ error: "status must be accepted, rejected, or withdrawn" }, { status: 400 });
    }
    await connectDB();
    const conn = await MentorConnection.findById(id);
    if (!conn) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Student can only withdraw their own request
    if (status === "withdrawn") {
      if (conn.studentId !== persona.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      await MentorConnection.deleteOne({ _id: id });
      return NextResponse.json({ message: "Request withdrawn" });
    }

    // Only admin can accept/reject for now (mentor portal coming later)
    if (persona.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });
    conn.status = status as "accepted" | "rejected";
    await conn.save();
    return NextResponse.json({ message: `Request ${status}` });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to update connection" }, { status: 500 });
  }
}
