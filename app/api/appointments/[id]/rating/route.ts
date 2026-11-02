import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";
import Case from "@/lib/models/Case";
import DoctorProfile from "@/lib/models/DoctorProfile";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "patient") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id }                    = await params;
    const { rating, comment = "" }  = await req.json();

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Rating must be 1–5" }, { status: 400 });
    }

    const appt = await Appointment.findById(id);
    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (appt.patientRef.toString() !== user.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (appt.status !== "completed") {
      return NextResponse.json({ error: "Consultation not yet completed" }, { status: 400 });
    }
    if (appt.patientRating) {
      return NextResponse.json({ error: "Already rated" }, { status: 409 });
    }

    appt.patientRating  = rating;
    appt.ratingComment  = comment;
    await appt.save();

    // Persist rating to case and update doctor's average
    if (appt.caseRef) {
      await Case.findByIdAndUpdate(appt.caseRef, { patientRating: rating });
    }

    const doctorProfile = await DoctorProfile.findOne({ userRef: appt.doctorRef });
    if (doctorProfile) {
      const newTotal  = (doctorProfile.totalRatings ?? 0) + 1;
      const newRating = ((doctorProfile.rating ?? 0) * (newTotal - 1) + rating) / newTotal;
      doctorProfile.rating       = Math.round(newRating * 10) / 10;
      doctorProfile.totalRatings = newTotal;
      await doctorProfile.save();
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
