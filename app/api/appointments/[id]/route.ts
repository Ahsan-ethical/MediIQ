import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";
import PatientProfile from "@/lib/models/PatientProfile";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const { id } = await params;
    const appointment = await Appointment.findById(id).lean();
    if (!appointment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const ownerId = user.role === "patient"
      ? appointment.patientRef.toString()
      : appointment.doctorRef.toString();

    if (ownerId !== user.userId && user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Enrich with patient profile for doctor and admin views (needed by consultation page)
    let patientProfile = null;
    if (user.role === "doctor" || user.role === "admin") {
      patientProfile = await PatientProfile.findOne({ userRef: appointment.patientRef })
        .select("age gender weight height bloodGroup knownConditions allergies currentMedications")
        .lean();
    }

    return NextResponse.json({ appointment: { ...appointment, patientProfile } });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
