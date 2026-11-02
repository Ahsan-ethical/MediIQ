import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";

// GET — poll for the current signaling state
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
      .select("patientRef doctorRef callSignaling")
      .lean();

    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const isPatient = appt.patientRef.toString() === user.userId;
    const isDoctor  = appt.doctorRef.toString()  === user.userId;
    if (!isPatient && !isDoctor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ signaling: appt.callSignaling ?? null });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — store a signal using ATOMIC MongoDB operators to prevent lost-update
// race conditions (patient posts answer + ICE simultaneously → concurrent saves
// used to overwrite each other, losing the answer from the DB).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const { id }            = await params;
    const { type, payload } = await req.json();

    const appt = await Appointment.findById(id).select("patientRef doctorRef").lean();
    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const isPatient = appt.patientRef.toString() === user.userId;
    const isDoctor  = appt.doctorRef.toString()  === user.userId;
    if (!isPatient && !isDoctor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Each operation is atomic — no read-modify-write, no concurrent save conflicts
    let update: Record<string, unknown> = {};

    if (type === "clear") {
      // Reset the whole signaling sub-document atomically
      update = { $set: { callSignaling: { offer: null, answer: null, doctorIce: [], patientIce: [] } } };

    } else if (type === "offer") {
      // Set offer and wipe ICE/answer from any previous session
      update = { $set: { "callSignaling.offer": payload, "callSignaling.answer": null, "callSignaling.doctorIce": [], "callSignaling.patientIce": [] } };

    } else if (type === "answer") {
      // Also reset patientIce so doctor discards stale candidates from any previous PC attempt
      update = { $set: { "callSignaling.answer": payload, "callSignaling.patientIce": [] } };

    } else if (type === "ice-doctor") {
      // $push is atomic — no risk of losing parallel answer $set
      update = { $push: { "callSignaling.doctorIce": payload } };

    } else if (type === "ice-patient") {
      update = { $push: { "callSignaling.patientIce": payload } };

    } else {
      return NextResponse.json({ error: "Unknown signal type" }, { status: 400 });
    }

    await Appointment.findByIdAndUpdate(id, update);
    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
