import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";
import PatientProfile from "@/lib/models/PatientProfile";
import { generateAiReport } from "@/lib/gemini";

// GET — fetch existing report (or null if not yet generated)
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
    const appt = await Appointment.findById(id).select("doctorRef aiReport").lean();
    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (appt.doctorRef.toString() !== user.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ aiReport: appt.aiReport ?? null });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — generate report (idempotent: returns existing if already generated)
export async function POST(
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
    const appt = await Appointment.findById(id);
    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (appt.doctorRef.toString() !== user.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Return cached report if already generated
    if (appt.aiReport?.generatedAt) {
      return NextResponse.json({ aiReport: appt.aiReport });
    }

    if (!appt.preConsultation?.filledAt) {
      return NextResponse.json({ error: "Pre-consultation not yet filled" }, { status: 400 });
    }

    const patientProfile = await PatientProfile.findOne({ userRef: appt.patientRef }).lean();
    if (!patientProfile) {
      return NextResponse.json({ error: "Patient profile not found" }, { status: 404 });
    }

    const report = await generateAiReport(appt, patientProfile as unknown as Record<string, unknown>);
    appt.aiReport = report;
    await appt.save();

    return NextResponse.json({ aiReport: report });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to generate AI report", details: String(err) }, { status: 500 });
  }
}
