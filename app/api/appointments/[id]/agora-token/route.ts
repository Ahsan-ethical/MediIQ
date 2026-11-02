import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";
import { RtcTokenBuilder, RtcRole } from "agora-token";

// doctor uid=1, patient uid=2 — fixed per channel so each side can identify the other
const DOCTOR_UID  = 1;
const PATIENT_UID = 2;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const { id } = await params;
    const appt = await Appointment.findById(id).select("patientRef doctorRef").lean();
    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isDoctor  = appt.doctorRef.toString()  === user.userId;
    const isPatient = appt.patientRef.toString() === user.userId;
    if (!isDoctor && !isPatient) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const appId      = process.env.AGORA_APP_ID;
    const appCert    = process.env.AGORA_APP_CERTIFICATE;
    if (!appId || !appCert) {
      return NextResponse.json({ error: "Agora not configured" }, { status: 500 });
    }

    const uid     = isDoctor ? DOCTOR_UID : PATIENT_UID;
    const channel = id;   // appointment ID is the channel name
    const expiry  = Math.floor(Date.now() / 1000) + 7200; // 2 hours

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId, appCert, channel, uid, RtcRole.PUBLISHER, expiry, expiry,
    );

    return NextResponse.json({ token, appId, channel, uid });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
