import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import DoctorProfile from "@/lib/models/DoctorProfile";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "doctor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const profile = await DoctorProfile.findOne({ userRef: user.userId });
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    if (profile.verificationStatus !== "approved") {
      return NextResponse.json({ error: "Not approved by admin" }, { status: 403 });
    }

    profile.isLive = !profile.isLive;
    await profile.save();

    return NextResponse.json({ isLive: profile.isLive });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
