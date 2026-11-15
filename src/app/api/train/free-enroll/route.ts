import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { apiError, badRequest, isDupKey } from "@/lib/api";
import { requireRole } from "@/lib/persona";
import { FreeResourceEnrollment } from "@/models/train";
import { RESOURCES } from "@/lib/train/resources";

export const dynamic = "force-dynamic";

// POST { resourceId } — student enrolls in a free YouTube resource
export async function POST(req: Request) {
  try {
    const p = await requireRole("student");
    await connectDB();
    const b = await req.json().catch(() => null);
    if (!b?.resourceId) return badRequest("resourceId is required");
    const resource = RESOURCES.find((r) => r.id === b.resourceId);
    if (!resource) return badRequest("Resource not found");
    try {
      await FreeResourceEnrollment.create({
        studentId: p.id,
        resourceId: resource.id,
        resourceTitle: resource.title,
        resourceUrl: resource.url,
        domain: resource.domain,
      });
    } catch (e) {
      if (isDupKey(e)) return NextResponse.json({ ok: true, already: true }); // already enrolled
      throw e;
    }
    return NextResponse.json({ ok: true, already: false }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}

// GET — list student's free resource enrollments
export async function GET() {
  try {
    const p = await requireRole("student");
    await connectDB();
    const enrollments = await FreeResourceEnrollment.find({ studentId: p.id }).sort({ enrolledAt: -1 }).lean<{ _id: unknown; resourceId: string; resourceTitle: string; resourceUrl: string; domain: string; enrolledAt: Date }[]>();
    return NextResponse.json({ enrollments: enrollments.map((e) => ({ id: String(e._id), resourceId: e.resourceId, title: e.resourceTitle, url: e.resourceUrl, domain: e.domain, enrolledAt: e.enrolledAt })) });
  } catch (e) {
    return apiError(e);
  }
}
