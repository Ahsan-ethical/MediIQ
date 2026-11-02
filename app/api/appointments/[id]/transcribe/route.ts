import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(
  req: NextRequest,
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

    const formData  = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    if (!audioFile || audioFile.size === 0) {
      return NextResponse.json({ transcript: "" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ transcript: "" });

    // NOTE: Legacy fallback route — live calls get their transcript from Agora's
    // real-time speech-to-text, not this endpoint. Raw audio→text is not an LLM
    // task and is unaffected by the admin AI mode. (Agent 2 later *summarizes*
    // that transcript, and that step DOES follow the AI mode.)
    // Convert audio blob → base64 for Gemini inline data
    const arrayBuffer = await audioFile.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString("base64");
    const mimeType    = (audioFile.type || "audio/webm") as "audio/webm";

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      {
        inlineData: { mimeType, data: base64Audio },
      },
      {
        text: `Transcribe this medical consultation audio recording accurately.
Label each speaker as "Doctor:" or "Patient:" where distinguishable.
Output only the raw transcript — no commentary, no timestamps, no formatting.`,
      },
    ]);

    const transcript = result.response.text().trim();
    console.log(`[transcribe] Gemini transcript: ${transcript.length} chars`);

    return NextResponse.json({ transcript });
  } catch (err) {
    console.error("[transcribe] Gemini error:", err);
    return NextResponse.json({ transcript: "" }); // don't break the call flow
  }
}
