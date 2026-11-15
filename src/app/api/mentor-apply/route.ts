// POST /api/mentor-apply — public self-signup for mentors (no auth required)
// Admin reviews at /api/admin/mentor-applications
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { MentorApplication } from "@/models/connect";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, designation, organization, yearsOfExperience, expertise, bio, linkedin, availability } = body;
    if (!name || !email || !designation || !organization) {
      return NextResponse.json({ error: "name, email, designation, organization are required" }, { status: 400 });
    }
    if (!email.includes("@")) return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    const yoe = Number(yearsOfExperience);
    if (!Number.isFinite(yoe) || yoe < 0 || yoe > 50) {
      return NextResponse.json({ error: "Years of experience must be 0–50" }, { status: 400 });
    }
    await connectDB();
    // prevent duplicate pending applications from the same email
    const existing = await MentorApplication.findOne({ email: String(email).toLowerCase().trim(), status: "pending" });
    if (existing) return NextResponse.json({ error: "You already have a pending application." }, { status: 409 });

    const app = new MentorApplication({
      name: String(name).trim().slice(0, 100),
      email: String(email).toLowerCase().trim(),
      designation: String(designation).trim().slice(0, 100),
      organization: String(organization).trim().slice(0, 120),
      yearsOfExperience: Math.round(yoe),
      expertise: Array.isArray(expertise) ? expertise.map(String).filter(Boolean).slice(0, 20) : [],
      bio: bio ? String(bio).trim().slice(0, 1500) : "",
      linkedin: linkedin ? String(linkedin).trim().slice(0, 300) : "",
      availability: Array.isArray(availability) ? availability.slice(0, 10) : [],
    });
    await app.save();
    return NextResponse.json({ message: "Application submitted. We'll review and get back to you." }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to submit application" }, { status: 500 });
  }
}
