import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import DoctorProfile, { generateDoctorId } from "@/lib/models/DoctorProfile";
import User from "@/lib/models/User";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "doctor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await connectDB();
    const profile = await DoctorProfile.findOne({ userRef: user.userId });
    return NextResponse.json({ profile: profile ?? null });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "doctor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const body = await req.json();

    const existing = await DoctorProfile.findOne({ userRef: user.userId });
    if (existing) {
      const updated = await DoctorProfile.findOneAndUpdate(
        { userRef: user.userId },
        { ...body },
        { new: true }
      );
      return NextResponse.json({ profile: updated });
    }

    const profile = await DoctorProfile.create({
      ...body,
      userRef: user.userId,
      userId: generateDoctorId(),
      verificationStatus: "pending",
    });
    await User.findByIdAndUpdate(user.userId, { profileCompleted: true });

    return NextResponse.json({ profile }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
