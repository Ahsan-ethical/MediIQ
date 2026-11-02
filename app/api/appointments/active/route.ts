import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";

// Returns the single active/pending appointment for the current user
// Also auto-expires appointments that missed their deadline
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();

    const allActiveStatuses = ["pending_approval", "confirmed", "active", "in_call", "post_call", "completed"];
    const filter =
      user.role === "patient"
        ? { patientRef: user.userId, status: { $in: allActiveStatuses } }
        : { doctorRef: user.userId, status: { $in: allActiveStatuses } };

    const appointment = await Appointment.findOne(filter).sort({ createdAt: -1 });

    if (!appointment) return NextResponse.json({ appointment: null });

    const now = new Date();
    const doctorDeadline = new Date(appointment.bookedAt.getTime() + 5 * 60 * 1000);
    const consultationTime = appointment.consultationStartsAt;

    // Auto-expire: doctor never approved within 5 min
    if (appointment.status === "pending_approval" && now > doctorDeadline) {
      appointment.status = "rejected";
      await appointment.save();
      return NextResponse.json({ appointment });
    }

    // Auto-activate: confirmed and consultation time reached
    if (appointment.status === "confirmed" && now >= consultationTime) {
      appointment.status = "active";
      await appointment.save();
    }

    return NextResponse.json({ appointment });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
