import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/lib/models/User";
import DoctorProfile from "@/lib/models/DoctorProfile";
import Appointment from "@/lib/models/Appointment";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const [totalPatients, totalDoctors, approvedDoctors, rejectedDoctors, pendingDoctors, totalAppointments] =
      await Promise.all([
        User.countDocuments({ role: "patient" }),
        User.countDocuments({ role: "doctor" }),
        DoctorProfile.countDocuments({ verificationStatus: "approved" }),
        DoctorProfile.countDocuments({ verificationStatus: "rejected" }),
        DoctorProfile.countDocuments({ verificationStatus: "pending" }),
        Appointment.countDocuments(),
      ]);

    return NextResponse.json({
      totalPatients,
      totalDoctors,
      approvedDoctors,
      rejectedDoctors,
      pendingDoctors,
      totalAppointments,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
