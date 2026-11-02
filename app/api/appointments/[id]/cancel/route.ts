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
    if (!user || user.role !== "doctor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const appt = await Appointment.findById(id);
    if (!appt) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });

    if (appt.status === "completed") {
      return NextResponse.json({ error: "Cannot cancel - prescription already sent" }, { status: 400 });
    }

    if (appt.status === "cancelled") {
      return NextResponse.json({ error: "Already cancelled" }, { status: 400 });
    }

    appt.status = "cancelled";
    await appt.save();

    console.log(`[Cancel] Appointment ${id} cancelled by doctor ${user.userId}. No post-consultation agents will run.`);

    return NextResponse.json({ ok: true, status: "cancelled" });
  } catch (err) {
    console.error("[Cancel]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
