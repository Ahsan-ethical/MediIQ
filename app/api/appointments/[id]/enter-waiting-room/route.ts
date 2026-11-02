import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "patient") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;
    const appt = await Appointment.findById(id);
    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (appt.patientRef.toString() !== user.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // Accept any non-terminal status — patient can enter waiting room even before
    // the 10-min timer fires or while still pending approval (doctor sees them waiting)
    const terminal = ["completed", "rejected", "cancelled", "in_call", "post_call"];
    if (terminal.includes(appt.status)) {
      return NextResponse.json({ error: "Appointment not ready for waiting room" }, { status: 400 });
    }
    if (!appt.preConsultation?.filledAt) {
      return NextResponse.json({ error: "Please complete pre-consultation form first" }, { status: 400 });
    }

    appt.waitingRoomAt = appt.waitingRoomAt ?? new Date();
    await appt.save();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
