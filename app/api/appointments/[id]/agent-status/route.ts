import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const { id } = await params;
    const appt = await Appointment.findById(id)
      .select("patientRef doctorRef agentPipelineStep agentOutputs aiPrescription prescriptionStep flaggedDrugs preConsultationLocked aiHistorySummary")
      .lean();

    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isPatient = appt.patientRef.toString() === user.userId;
    const isDoctor = appt.doctorRef.toString() === user.userId;
    if (!isPatient && !isDoctor && user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      pipelineStep: appt.agentPipelineStep ?? "idle",
      prescriptionStep: appt.prescriptionStep ?? null,
      locked: appt.preConsultationLocked ?? false,
      aiPrescription: appt.aiPrescription ?? null,
      flaggedDrugs: appt.flaggedDrugs ?? [],
      aiHistorySummary: (appt as unknown as { aiHistorySummary?: string }).aiHistorySummary ?? "",
      agentOutputs: isDoctor || user.role === "admin" ? appt.agentOutputs ?? {} : {},
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
