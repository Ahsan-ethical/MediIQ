import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "patient") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;
    const body = await req.json();

    const appointment = await Appointment.findById(id);
    if (!appointment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (appointment.patientRef.toString() !== user.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!["pending_approval", "confirmed"].includes(appointment.status)) {
      return NextResponse.json({ error: "Cannot update pre-consultation at this stage" }, { status: 400 });
    }

    // Check 5-min patient deadline
    const deadline = new Date(appointment.bookedAt.getTime() + 5 * 60 * 1000);
    if (new Date() > deadline) {
      return NextResponse.json({ error: "Pre-consultation window expired" }, { status: 400 });
    }

    appointment.preConsultation = {
      ...body,
      filledAt: new Date(),
    };
    await appointment.save();

    return NextResponse.json({ appointment });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
