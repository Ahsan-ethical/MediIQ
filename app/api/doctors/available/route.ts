import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import DoctorProfile from "@/lib/models/DoctorProfile";
import User from "@/lib/models/User";

// Live doctor availability must never be served from a cache.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "patient") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const doctors = await DoctorProfile.find({ verificationStatus: "approved" })
      .populate({ path: "userRef", select: "name email", model: User })
      .sort({ rating: -1 })
      .lean();

    // Drop any profile whose linked user is missing (deleted account) — otherwise the
    // client crashes on `doctor.userRef.name` and the whole list renders blank.
    const safe = doctors.filter((d) => d.userRef && (d.userRef as { name?: string }).name);

    return NextResponse.json({ doctors: safe });
  } catch (err) {
    console.error("[doctors/available]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
