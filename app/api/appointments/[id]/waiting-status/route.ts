import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";

// Doctor polls this to know if a patient has entered the waiting room
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "doctor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;
    const appt = await Appointment.findById(id).select("doctorRef status waitingRoomAt preConsultation patientName").lean();
    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (appt.doctorRef.toString() !== user.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      status:        appt.status,
      waitingRoomAt: appt.waitingRoomAt ?? null,
      preConsFilled: !!appt.preConsultation?.filledAt,
      patientName:   appt.patientName,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
