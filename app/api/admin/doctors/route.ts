import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import DoctorProfile from "@/lib/models/DoctorProfile";
import User from "@/lib/models/User";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const filter = status ? { verificationStatus: status } : {};
    const doctors = await DoctorProfile.find(filter)
      .populate("userRef", "name email createdAt")
      .sort({ createdAt: -1 });

    return NextResponse.json({ doctors });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
