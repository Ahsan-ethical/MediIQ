import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import AiConsultation from "@/lib/models/AiConsultation";
import PatientProfile from "@/lib/models/PatientProfile";
import User from "@/lib/models/User";
import { GoogleGenerativeAI } from "@google/generative-ai";

// GET — list patient's own AI consultations
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "patient") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();
    const consultations = await AiConsultation.find({ patientRef: user.userId })
      .sort({ createdAt: -1 }).lean();
    return NextResponse.json({ consultations });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST — create new AI consultation + run Gemini pre-call question generation
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "patient") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();

    const { symptoms, duration, severity, currentMedications, additionalNotes, sbp, dbp, hr } = await req.json();
    if (!symptoms || !duration || !severity) {
      return NextResponse.json({ error: "Symptoms, duration and severity are required" }, { status: 400 });
    }

    const dbUser = await User.findById(user.userId).select("name").lean() as { name: string } | null;
    const profile = await PatientProfile.findOne({ userRef: user.userId }).lean() as {
      age?: number; gender?: string; weight?: number; height?: number; bloodGroup?: string;
      knownConditions?: string[]; allergies?: string[]; currentMedications?: string[];
    } | null;

    const patientContext = [
      `Patient: ${dbUser?.name}, Age: ${profile?.age ?? "unknown"}, Gender: ${profile?.gender ?? "unknown"}`,
      `Weight: ${profile?.weight ?? "?"}kg, Height: ${profile?.height ?? "?"}cm, Blood Group: ${profile?.bloodGroup ?? "unknown"}`,
      `Known Conditions: ${profile?.knownConditions?.join(", ") || "none"}`,
      `Allergies: ${profile?.allergies?.join(", ") || "none"}`,
      `Ongoing Medications: ${profile?.currentMedications?.join(", ") || "none"}`,
      `Chief Complaint: ${symptoms}`,
      `Duration: ${duration}, Severity: ${severity}`,
      (sbp && dbp) ? `Blood Pressure: ${sbp}/${dbp} mmHg` : "",
      hr ? `Heart Rate: ${hr} bpm` : "",
      additionalNotes ? `Notes: ${additionalNotes}` : "",
    ].filter(Boolean).join("\n");

    // Generate 5 focused diagnostic questions via Gemini
    const genAI  = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model  = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(
      `You are an AI medical assistant preparing for a voice consultation with a patient.
Based on the patient data below, generate exactly 5 focused, open-ended diagnostic questions
a doctor would ask to narrow down the diagnosis. Make them conversational and natural for voice.

${patientContext}

Return ONLY a JSON array of 5 strings, no markdown:
["Question 1?","Question 2?","Question 3?","Question 4?","Question 5?"]`
    );

    let aiQuestions: string[] = [];
    try {
      const text = result.response.text().trim();
      const match = text.match(/\[[\s\S]*\]/);
      aiQuestions = JSON.parse(match ? match[0] : text);
    } catch {
      aiQuestions = [
        "Can you describe when the symptoms started and if they have changed at all?",
        "Are you experiencing any fever, chills, or sweating?",
        "Have you had any nausea, vomiting, or changes in appetite?",
        "Are you feeling any body aches or unusual fatigue?",
        "Have you been in contact with anyone who was sick recently?",
      ];
    }

    const consultation = await AiConsultation.create({
      patientRef:  user.userId,
      patientName: dbUser?.name ?? "Patient",
      status:      "ready_to_consult",
      preConsultation: {
        symptoms, duration, severity,
        currentMedications: currentMedications ?? "",
        additionalNotes:    additionalNotes ?? "",
        vitals: (sbp || dbp || hr) ? {
          sbp: sbp ? Number(sbp) : undefined,
          dbp: dbp ? Number(dbp) : undefined,
          hr:  hr  ? Number(hr)  : undefined,
        } : undefined,
        filledAt: new Date(),
      },
      aiQuestions,
    });

    return NextResponse.json({ consultation });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
