import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";
import DoctorProfile from "@/lib/models/DoctorProfile";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") ?? "20");

    let filter = {};
    if (user.role === "patient") filter = { patientRef: user.userId };
    if (user.role === "doctor") filter = { doctorRef: user.userId };

    // Optional status filter (comma-separated)
    const statusParam = searchParams.get("status");
    if (statusParam) {
      const statuses = statusParam.split(",").map(s => s.trim());
      filter = { ...filter, status: { $in: statuses } };
    }

    const appointments = await Appointment.find(filter).sort({ createdAt: -1 }).limit(limit);
    return NextResponse.json({ appointments });
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
    const { doctorUserId } = await req.json();

    const doctorProfile = await DoctorProfile.findOne({ userRef: doctorUserId }).populate("userRef", "name");
    if (!doctorProfile) return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
    if (doctorProfile.verificationStatus !== "approved") {
      return NextResponse.json({ error: "Doctor not available" }, { status: 400 });
    }
    if (!doctorProfile.isLive) {
      return NextResponse.json({ error: "Doctor is not live right now" }, { status: 400 });
    }

    // Check if patient already has a pending/confirmed appointment
    const existing = await Appointment.findOne({
      patientRef: user.userId,
      status: { $in: ["pending_approval", "confirmed", "active", "in_call", "post_call"] },
    });
    if (existing) {
      return NextResponse.json({ error: "You already have an active appointment" }, { status: 400 });
    }

    const bookedAt = new Date();
    const consultationStartsAt = new Date(bookedAt.getTime() + 10 * 60 * 1000); // +10 min

    const doctorUser = doctorProfile.userRef as unknown as { name: string };

    const appointment = await Appointment.create({
      patientRef: user.userId,
      doctorRef: doctorUserId,
      patientName: user.name,
      doctorName: doctorUser.name,
      specialization: doctorProfile.specialization,
      consultationFee: doctorProfile.consultationFee,
      status: "pending_approval",
      bookedAt,
      consultationStartsAt,
    });

    return NextResponse.json({ appointment }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
