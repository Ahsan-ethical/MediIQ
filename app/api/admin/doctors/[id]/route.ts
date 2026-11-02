import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import DoctorProfile from "@/lib/models/DoctorProfile";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;
    const { verificationStatus } = await req.json();

    if (!["approved", "rejected"].includes(verificationStatus)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const doctor = await DoctorProfile.findByIdAndUpdate(
      id,
      { verificationStatus },
      { new: true }
    );

    if (!doctor) return NextResponse.json({ error: "Doctor not found" }, { status: 404 });

    return NextResponse.json({ doctor });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
