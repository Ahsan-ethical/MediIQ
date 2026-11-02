import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";

// DEV ONLY — remove before production
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { id } = await params;
  const appointment = await Appointment.findById(id);
  if (!appointment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Set consultationStartsAt to 1 second ago so timers expire immediately
  appointment.consultationStartsAt = new Date(Date.now() - 1000);
  appointment.status = "active";
  await appointment.save();

  return NextResponse.json({ appointment });
}
