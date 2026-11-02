import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || !["doctor", "patient"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;
    const { transcript } = await req.json().catch(() => ({ transcript: "" }));

    const appt = await Appointment.findById(id);
    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isDoctor = appt.doctorRef.toString() === user.userId;
    const isPatient = appt.patientRef.toString() === user.userId;
    if (!isDoctor && !isPatient) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!["in_call", "active"].includes(appt.status)) {
      return NextResponse.json({ ok: true });
    }

    appt.status = "post_call";
    appt.callEndedAt = new Date();
    if (transcript) appt.transcript = transcript;
    appt.agentPipelineStep = "call_ended";
    appt.prescriptionStep = "ended";
    await appt.save();

    // Demo mode  → the doctor page drives the scripted pipeline via /advance-pipeline.
    // Real mode  → the doctor page triggers the REAL pipeline via /run-pipeline (awaited,
    //              so it survives on serverless — setImmediate here would be killed on Vercel).
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
