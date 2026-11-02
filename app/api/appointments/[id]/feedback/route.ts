import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";

type FeedbackBody = {
  recoveryTime:         string;
  overallEffectiveness: string;
  sideEffects:          string;
  courseCompleted:      string;
  symptomsResolved:     string;
  medicineRatings:      Array<{ medicine: string; helpful: string }>;
  revisitNeeded:        string;
  dosageExperience:     string;
  careRating:           string;
  wouldUseAgain:        string;
  additionalFeedback?:  string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "patient") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const { id } = await params;
    const body: FeedbackBody = await req.json();

    const appt = await Appointment.findOne({ _id: id, patientRef: user.userId });
    if (!appt)            return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!appt.prescription) return NextResponse.json({ error: "No prescription to review" }, { status: 400 });
    if (appt.prescriptionFeedback) return NextResponse.json({ error: "Feedback already submitted" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appt.prescriptionFeedback = { ...body, submittedAt: new Date() } as any;
    await appt.save();

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[Feedback]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
