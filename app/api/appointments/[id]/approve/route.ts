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
    if (!user || user.role !== "doctor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;
    const { action } = await req.json(); // "approve" | "reject"

    const appointment = await Appointment.findById(id);
    if (!appointment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (appointment.doctorRef.toString() !== user.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (appointment.status !== "pending_approval") {
      return NextResponse.json({ error: "Appointment is no longer pending" }, { status: 400 });
    }

    // Check 5-min doctor deadline
    const deadline = new Date(appointment.bookedAt.getTime() + 5 * 60 * 1000);
    if (new Date() > deadline && action === "approve") {
      appointment.status = "rejected";
      await appointment.save();
      return NextResponse.json({ error: "Approval window expired" }, { status: 400 });
    }

    if (action === "approve") {
      appointment.status = "confirmed";
      appointment.approvedAt = new Date();
    } else {
      appointment.status = "rejected";
    }

    await appointment.save();
    return NextResponse.json({ appointment });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
