import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import PatientProfile, { generatePatientId } from "@/lib/models/PatientProfile";
import User from "@/lib/models/User";
import { generateProfileSummary } from "@/lib/agents/gemini-helpers";
import { preComputeAllergyExpansions } from "@/lib/agents/allergy-cache";

async function regenerateProfileSummary(profileId: string, userName: string) {
  try {
    const profile = await PatientProfile.findById(profileId).lean();
    if (!profile) return;

    const summary = await generateProfileSummary(userName, {
      age: profile.age, gender: profile.gender,
      weight: profile.weight, height: profile.height,
      bloodGroup: profile.bloodGroup,
      city: profile.city, state: profile.state, country: profile.country,
      knownConditions: profile.knownConditions ?? [],
      allergies: profile.allergies ?? [],
      currentMedications: profile.currentMedications ?? [],
    });

    await PatientProfile.findByIdAndUpdate(profileId, { summary });
  } catch (err) {
    console.error("Profile summary generation failed (non-fatal):", err);
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "patient") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await connectDB();
    const profile = await PatientProfile.findOne({ userRef: user.userId });
    if (!profile) return NextResponse.json({ profile: null });
    return NextResponse.json({ profile });
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
    const body = await req.json();

    const existing = await PatientProfile.findOne({ userRef: user.userId });
    if (existing) {
      const updated = await PatientProfile.findOneAndUpdate(
        { userRef: user.userId },
        { ...body },
        { new: true }
      );

      // Regenerate profile summary + allergy cache in background
      if (updated) {
        setImmediate(() => {
          regenerateProfileSummary(updated._id.toString(), user.name).catch(() => {});
          preComputeAllergyExpansions(updated._id.toString()).catch(() => {});
        });
      }

      return NextResponse.json({ profile: updated });
    }

    const profile = await PatientProfile.create({ ...body, userRef: user.userId, userId: generatePatientId() });
    await User.findByIdAndUpdate(user.userId, { profileCompleted: true });

    // Generate initial profile summary + allergy cache in background
    setImmediate(() => {
      regenerateProfileSummary(profile._id.toString(), user.name).catch(() => {});
      preComputeAllergyExpansions(profile._id.toString()).catch(() => {});
    });

    return NextResponse.json({ profile }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
