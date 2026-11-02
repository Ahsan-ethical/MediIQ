import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import SystemDetected from "@/lib/models/SystemDetected";
import PatientProfile from "@/lib/models/PatientProfile";
import { generateProfileSummary } from "@/lib/agents/gemini-helpers";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "patient") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await connectDB();
    const findings = await SystemDetected.find({ patientRef: user.userId, status: "pending" })
      .sort({ createdAt: -1 }).lean();
    return NextResponse.json({ findings });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "patient") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { findingId, action } = await req.json();
    if (!findingId || !["accept", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const finding = await SystemDetected.findOne({ _id: findingId, patientRef: user.userId });
    if (!finding) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (action === "reject") {
      finding.status = "rejected";
      await finding.save();
      return NextResponse.json({ ok: true, action: "rejected" });
    }

    // Accept: add to patient profile
    finding.status = "accepted";
    await finding.save();

    const profile = await PatientProfile.findOne({ userRef: user.userId });
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    if (finding.type === "allergy") {
      const existing = (profile.allergies ?? []) as string[];
      if (!existing.includes(finding.value)) {
        existing.push(finding.value);
        profile.allergies = existing;
      }
    } else if (finding.type === "lifelong_med") {
      const existing = (profile.currentMedications ?? []) as string[];
      if (!existing.includes(finding.value)) {
        existing.push(finding.value);
        profile.currentMedications = existing;
      }
    }

    await profile.save();

    // Regenerate profile summary (fire-and-forget)
    setImmediate(async () => {
      try {
        const p = await PatientProfile.findOne({ userRef: user.userId }).lean();
        if (!p) return;
        const summary = await generateProfileSummary(user.name, {
          age: p.age, gender: p.gender, weight: p.weight, height: p.height,
          bloodGroup: p.bloodGroup, city: p.city, state: p.state, country: p.country,
          knownConditions: p.knownConditions ?? [],
          allergies: p.allergies ?? [],
          currentMedications: p.currentMedications ?? [],
        });
        await PatientProfile.findByIdAndUpdate(p._id, { summary });
      } catch (err) {
        console.error("[SystemDetected] Profile summary refresh failed:", err);
      }
    });

    return NextResponse.json({ ok: true, action: "accepted", field: finding.type, value: finding.value });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
