import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";
import User from "@/lib/models/User";
import PatientProfile, { type IPatientProfile } from "@/lib/models/PatientProfile";
import Case from "@/lib/models/Case";
import { embedText, buildSymptomsEmbeddingText } from "@/lib/gemini";
import { refreshPatientSummaryPostConsultation } from "@/lib/agents/agent1";
import { runFindingDetectorAgent, generateLastConsultationSummary } from "@/lib/agents/agent9";

// GET — patient polls for their prescription
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
      .select("patientRef doctorRef status prescription prescriptionSentAt aiPrescription prescriptionStep similarCases patientHistory aiHistorySummary")
      .lean();

    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const isPatient = appt.patientRef.toString() === user.userId;
    const isDoctor  = appt.doctorRef.toString()  === user.userId;
    if (!isPatient && !isDoctor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      status:             appt.status,
      prescription:       appt.prescription        ?? null,
      prescriptionSentAt: appt.prescriptionSentAt  ?? null,
      aiPrescription:     appt.aiPrescription      ?? null,
      prescriptionStep:   appt.prescriptionStep    ?? null,
      similarCases:       appt.similarCases        ?? [],
      patientHistory:     appt.patientHistory      ?? [],
      aiHistorySummary:   (appt as unknown as { aiHistorySummary?: string }).aiHistorySummary ?? "",
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — doctor finalizes and sends prescription
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "doctor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id }   = await params;
    const body     = await req.json();
    const { diagnosis, medicines, advice, drugSafetyNote } = body;

    if (!diagnosis || !Array.isArray(medicines) || medicines.length === 0) {
      return NextResponse.json({ error: "Diagnosis and at least one medicine are required" }, { status: 400 });
    }

    const appt = await Appointment.findById(id);
    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (appt.doctorRef.toString() !== user.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (appt.status !== "post_call") {
      return NextResponse.json({ error: "Call must be ended before sending prescription" }, { status: 400 });
    }

    appt.prescription       = { diagnosis, medicines, advice, drugSafetyNote: drugSafetyNote ?? "" };
    appt.prescriptionSentAt = new Date();
    appt.status             = "completed";
    await appt.save();

    // Save case to MongoDB with embedding for future RAG retrieval (fire-and-forget)
    setImmediate(async () => {
      try {
        // Use IPatientProfile so property accesses are typed correctly
        type LeanProfile = Pick<IPatientProfile,
          "age" | "gender" | "weight" | "height" | "bloodGroup" |
          "knownConditions" | "allergies" | "currentMedications"
        >;

        const patientProfile = await PatientProfile
          .findOne({ userRef: appt.patientRef })
          .select("age gender weight height bloodGroup knownConditions allergies currentMedications")
          .lean<LeanProfile>();

        if (!patientProfile) return;

        const embText = buildSymptomsEmbeddingText({
          symptoms:        appt.preConsultation?.symptoms ?? "",
          duration:        appt.preConsultation?.duration,
          severity:        appt.preConsultation?.severity,
          additionalNotes: appt.preConsultation?.additionalNotes,
        });
        const embedding = await embedText(embText);

        const caseDoc = await Case.create({
          appointmentRef:     appt._id,
          patientRef:         appt.patientRef,
          doctorRef:          appt.doctorRef,
          patient: {
            age:                patientProfile.age,
            sex:                patientProfile.gender,
            weight:             patientProfile.weight,
            height:             patientProfile.height,
            bloodGroup:         patientProfile.bloodGroup         ?? "",
            knownConditions:    patientProfile.knownConditions    ?? [],
            allergies:          patientProfile.allergies          ?? [],
            currentMedications: patientProfile.currentMedications ?? [],
          },
          symptoms:           appt.preConsultation?.symptoms           ?? "",
          duration:           appt.preConsultation?.duration           ?? "",
          severity:           appt.preConsultation?.severity           ?? "",
          additionalNotes:    appt.preConsultation?.additionalNotes    ?? "",
          currentMedications: appt.preConsultation?.currentMedications ?? "",
          vitals:             appt.preConsultation?.vitals,
          transcript:         appt.transcript ?? "",
          diagnosis,
          prescription:       medicines,
          advice:             advice ?? "",
          embedding,
        });

        await Appointment.findByIdAndUpdate(id, { caseRef: caseDoc._id });
      } catch (err) {
        console.error("Case embedding error:", err);
      }

      // Post-consultation: rebuild runningSummary + recentConsultations
      try {
        await refreshPatientSummaryPostConsultation(appt.patientRef.toString());
        console.log(`[Agent1] Running summary + recent consultations updated for patient ${appt.patientRef}`);
      } catch (err) {
        console.error("[Agent1] Post-consultation summary update failed (non-fatal):", err);
      }

      // Auto-trigger Agent 9: detect new lifelong meds + allergies
      try {
        const profile = await PatientProfile
          .findOne({ userRef: appt.patientRef })
          .select("allergies currentMedications")
          .lean();

        await runFindingDetectorAgent({
          patientUserId: appt.patientRef.toString(),
          existingAllergies: (profile?.allergies as string[]) ?? [],
          existingMedications: (profile?.currentMedications as string[]) ?? [],
          prescription: { diagnosis, medicines, advice: advice ?? "", drugSafetyNote: drugSafetyNote ?? "", historySummary: "" },
          transcript: {
            structuredTranscript: [],
            chiefComplaint: appt.preConsultation?.symptoms ?? "",
            mentionedSymptoms: [],
            mentionedMedications: [],
            mentionedAllergies: [],
            duration: appt.preConsultation?.duration ?? "",
            severity: (appt.preConsultation?.severity as "mild" | "moderate" | "severe") ?? "moderate",
          },
        });
        console.log(`[Agent9] Finding detection done for patient ${appt.patientRef}`);
      } catch (err) {
        console.error("[Agent9] Finding detection failed (non-fatal):", err);
      }

      // Generate lastConsultationSummary for chatbot context
      try {
        const doctor = await User.findById(appt.doctorRef).select("name").lean() as { name?: string } | null;
        await generateLastConsultationSummary({
          patientUserId: appt.patientRef.toString(),
          appointmentId: appt._id.toString(),
          doctorName: doctor?.name ?? "Doctor",
          date: new Date().toISOString().split("T")[0],
          symptoms: appt.preConsultation?.symptoms ?? "",
          prescription: { diagnosis, medicines, advice: advice ?? "", drugSafetyNote: drugSafetyNote ?? "", historySummary: "" },
          flaggedDrugs: (appt.flaggedDrugs as { drug: string; reason: string; flaggedBy: string }[]) ?? [],
          transcript: appt.transcript ?? "",
        });
        console.log(`[Agent9] lastConsultationSummary updated for patient ${appt.patientRef}`);
      } catch (err) {
        console.error("[Agent9] lastConsultationSummary failed (non-fatal):", err);
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
