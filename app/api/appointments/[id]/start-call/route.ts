import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";
import AiConsultation from "@/lib/models/AiConsultation";
import Case from "@/lib/models/Case";
import { embedText, buildSymptomsEmbeddingText } from "@/lib/gemini";
import { buildFeedbackSummary } from "@/lib/feedbackUtils";
import mongoose from "mongoose";


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
    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (appt.doctorRef.toString() !== user.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    appt.status        = "in_call";
    appt.callStartedAt = new Date();
    await appt.save();

    // Fire-and-forget: pre-fetch patient history + similar cases during the call
    prefetchDoctorRx(id, appt.patientRef.toString(), appt.preConsultation).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function prefetchDoctorRx(
  appointmentId: string,
  patientRefStr: string,
  preConsultation: Appointment["preConsultation"],
) {
  const tag = `[PrefetchDrRx ${appointmentId.slice(-6)}]`;
  console.log(`${tag} ▶ Starting pre-fetch (doctor call in progress)`);
  const t0 = Date.now();

  try {
    await connectDB();
    const patientOid = new mongoose.Types.ObjectId(patientRefStr);

    // ── Patient history ────────────────────────────────────────────────────
    await Appointment.findByIdAndUpdate(appointmentId, { prefetchStep: "patient_history" });
    console.log(`${tag} Fetching patient history…`);

    type HistEntry = Record<string, unknown>;
    let patientHistory: HistEntry[] = [];
    try {
      const [pastAppts, pastAiCons] = await Promise.all([
        Appointment.find({
          patientRef: patientOid,
          status: "completed",
          "prescription.diagnosis": { $exists: true },
          _id: { $ne: appointmentId },
        }).select("preConsultation prescription prescriptionFeedback consultationStartsAt createdAt")
          .sort({ createdAt: -1 }).limit(5).lean(),
        AiConsultation.find({ patientRef: patientOid, status: "report_ready" })
          .select("preConsultation report createdAt")
          .sort({ createdAt: -1 }).limit(5).lean(),
      ]);

      const fmt = (d: Date) =>
        new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

      patientHistory = [
        ...(pastAppts as unknown as Record<string,unknown>[]).map(a => {
          const pc = a.preConsultation as Record<string,unknown>;
          const rx = a.prescription   as Record<string,unknown>;
          const fb = a.prescriptionFeedback as Record<string,unknown> | undefined;
          const meds = (rx?.medicines as Array<Record<string,unknown>>)
            ?.map(m => `${m.medicine} ${m.dosage ?? ""}`.trim()).join(", ") ?? "";
          return {
            date:      fmt((a.consultationStartsAt || a.createdAt) as Date),
            symptoms:  pc?.symptoms, severity: pc?.severity,
            diagnosis: rx?.diagnosis, medicines: meds,
            feedback:  fb ? buildFeedbackSummary(fb) : undefined,
            source:    "doctor",
          };
        }),
        ...(pastAiCons as unknown as Record<string,unknown>[]).map(c => {
          const pc = c.preConsultation as Record<string,unknown>;
          const r  = c.report as Record<string,unknown>;
          return {
            date:      fmt(c.createdAt as Date),
            symptoms:  pc?.symptoms, severity: pc?.severity,
            diagnosis: r?.diagnosis,
            medicines: (r?.medicines as Array<Record<string,unknown>>)
              ?.map(m => `${m.medicine} ${m.dosage ?? ""}`.trim()).join(", ") ?? "",
            source: "ai",
          };
        }),
      ].sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime());

      console.log(`${tag} ✔ Patient history: ${patientHistory.length} entries`);
    } catch (histErr) {
      console.warn(`${tag} ⚠ History fetch failed (non-fatal):`, histErr);
    }

    // ── Embedding + vector search ──────────────────────────────────────────
    await Appointment.findByIdAndUpdate(appointmentId, { prefetchStep: "similar_cases" });
    console.log(`${tag} Building embedding + vector search…`);

    let similarCases: Array<Record<string, unknown>> = [];
    try {
      const pc = preConsultation as { symptoms?: string; duration?: string; severity?: string; additionalNotes?: string } | undefined;
      const embText = buildSymptomsEmbeddingText({
        symptoms:        pc?.symptoms        ?? "",
        duration:        pc?.duration,
        severity:        pc?.severity,
        additionalNotes: pc?.additionalNotes,
      });
      const embedding = await embedText(embText);
      similarCases = await Case.aggregate([
        {
          $vectorSearch: {
            index: "case_vector_index", path: "embedding",
            queryVector: embedding, numCandidates: 50, limit: 5,
          },
        },
        { $project: { embedding: 0, _id: 0 } },
      ]);
      console.log(`${tag} ✔ Found ${similarCases.length} similar cases`);
    } catch (ragErr) {
      console.warn(`${tag} ⚠ Vector search failed (non-fatal):`, ragErr);
    }

    // ── Save pre-fetched data ─────────────────────────────────────────────
    await Appointment.findByIdAndUpdate(appointmentId, {
      prefetchStep: "ready",
      patientHistory,
      similarCases: similarCases.map(c => ({
        patient:      c.patient,
        symptoms:     c.symptoms,
        duration:     c.duration,
        severity:     c.severity,
        diagnosis:    c.diagnosis,
        prescription: c.prescription,
        advice:       c.advice,
      })),
    });
    console.log(`${tag} ✔ Pre-fetch complete in ${Date.now() - t0}ms`);
  } catch (err) {
    console.error(`${tag} ✖ Pre-fetch error:`, err);
  }
}

// Type alias to make preConsultation typeable in function signature
type Appointment = import("@/lib/models/Appointment").IAppointment;
