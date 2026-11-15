// PATCH /api/admin/mentor-applications/:id — approve or reject (admin only)
// approve → creates a Mentor record from the application
import { NextResponse } from "next/server";
import { getPersona, UnauthorizedError } from "@/lib/persona";
import { connectDB } from "@/lib/db";
import { MentorApplication, Mentor } from "@/models/connect";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const persona = await getPersona();
    if (persona.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });
    const { id } = await params;
    const { action, adminNote } = await req.json(); // action: "approve" | "reject"
    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
    }
    await connectDB();
    const app = await MentorApplication.findById(id);
    if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });
    if (app.status !== "pending") return NextResponse.json({ error: "Application already reviewed" }, { status: 409 });

    if (action === "approve") {
      // Create a Mentor profile from the application
      await Mentor.create({
        name: app.name,
        headline: `${app.designation} at ${app.organization}`,
        designation: app.designation,
        organization: app.organization,
        yearsOfExperience: app.yearsOfExperience,
        bio: app.bio,
        expertise: app.expertise,
        teachingTopics: app.expertise, // default same as expertise
        availability: app.availability,
        verified: true,
        profileStatus: "active",
        links: { linkedin: app.linkedin },
      });
      app.status = "approved";
    } else {
      app.status = "rejected";
      app.adminNote = adminNote ? String(adminNote).slice(0, 500) : "";
    }
    await app.save();
    return NextResponse.json({ message: `Application ${action}d` });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to update application" }, { status: 500 });
  }
}
