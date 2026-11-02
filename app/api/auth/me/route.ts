import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/lib/models/User";
import DoctorProfile from "@/lib/models/DoctorProfile";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const dbUser = await User.findById(user.userId).select("-password");
    if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

    let extra: Record<string, unknown> = {};
    if (dbUser.role === "doctor") {
      const profile = await DoctorProfile.findOne({ userRef: dbUser._id });
      extra.verificationStatus = profile?.verificationStatus ?? null;
    }

    return NextResponse.json({ ...dbUser.toObject(), ...extra });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
