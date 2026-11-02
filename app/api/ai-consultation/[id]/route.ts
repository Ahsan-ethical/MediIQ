import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import AiConsultation from "@/lib/models/AiConsultation";
import PatientProfile from "@/lib/models/PatientProfile";
import User from "@/lib/models/User";
import { embedText, buildSymptomsEmbeddingText } from "@/lib/gemini";
import { buildFeedbackSummary } from "@/lib/feedbackUtils";
import Case from "@/lib/models/Case";
import Appointment from "@/lib/models/Appointment";
import mongoose from "mongoose";
import { refreshPatientSummaryPostConsultation } from "@/lib/agents/agent1";

type Params = { params: Promise<{ id: string }> };

// GET — fetch single consultation (+ patient profile for VAPI variables)
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();
    const { id } = await params;

    const consultation = await AiConsultation.findById(id).lean() as Record<string, unknown> | null;
    if (!consultation) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isPatient = consultation.patientRef?.toString() === user.userId;
    if (!isPatient && user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Also return patient profile so the consultation room can build VAPI variables
    const patientId  = String(consultation.patientRef);
    const patientOid = new mongoose.Types.ObjectId(patientId);
    const profile = await PatientProfile.findOne({ userRef: patientOid }).lean();
    const dbUser  = await User.findById(patientOid).select("name").lean() as { name: string } | null;

    return NextResponse.json({ consultation, profile, patientName: dbUser?.name });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// PATCH — update status (start call, end call)
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "patient") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();
    const { id } = await params;
    const { status, transcript } = await req.json();

    const consultation = await AiConsultation.findOne({ _id: id, patientRef: user.userId });
    if (!consultation) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (status === "in_consultation") {
      consultation.status = "in_consultation";
      consultation.consultationStartedAt = new Date();
      await consultation.save();
      // Kick off pre-fetch while the call is happening so generateReport is faster
      prefetchForReport(id, user.userId).catch((e: unknown) => console.error("[Prefetch] failed:", e));
      return NextResponse.json({ ok: true });
    }

    if (status === "generating_report" && transcript) {
      consultation.status      = "generating_report";
      consultation.transcript  = transcript;
      consultation.consultationEndedAt = new Date();
    }

    await consultation.save();

    // If call ended, trigger async report generation
    if (status === "generating_report") {
      generateReport(id, user.userId).catch(console.error);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ── Pre-fetch during call so generateReport is fast when call ends ────────────
async function prefetchForReport(consultationId: string, patientUserId: string) {
  const tag = `[Prefetch ${consultationId.slice(-6)}]`;
  console.log(`${tag} ▶ Starting pre-fetch (call in progress — this runs while patient is talking)`);
  const t0 = Date.now();

  try {
    await connectDB();
    const consultation = await AiConsultation.findById(consultationId);
    if (!consultation) { console.warn(`${tag} Consultation not found`); return; }

    const patientOid = new mongoose.Types.ObjectId(patientUserId);

    // ── Patient history ───────────────────────────────────────────────────────
    consultation.prefetchStep = "patient_history";
    await consultation.save();
    console.log(`${tag} Fetching patient history…`);

    const [pastAppts, pastAiCons] = await Promise.all([
      Appointment.find({ patientRef: patientOid, status: "completed", "prescription.diagnosis": { $exists: true } })
        .select("preConsultation prescription prescriptionFeedback consultationStartsAt createdAt")
        .sort({ createdAt: -1 }).limit(5).lean(),
      AiConsultation.find({ patientRef: patientOid, status: "report_ready", _id: { $ne: consultationId } })
        .select("preConsultation report createdAt")
        .sort({ createdAt: -1 }).limit(5).lean(),
    ]);

    const fmt = (d: Date) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

    const prefetchedHistory = [
      ...(pastAppts as unknown as Record<string,unknown>[]).map(a => {
        const pc = a.preConsultation as Record<string,unknown>;
        const rx = a.prescription   as Record<string,unknown>;
        const fb = a.prescriptionFeedback as Record<string,unknown> | undefined;
        const meds = (rx?.medicines as Array<Record<string,unknown>>)?.map(m => `${m.medicine} ${m.dosage ?? ""}`.trim()).join(", ") ?? "";
        return { date: fmt((a.consultationStartsAt || a.createdAt) as Date), symptoms: pc?.symptoms, severity: pc?.severity, diagnosis: rx?.diagnosis, medicines: meds, feedback: fb ? buildFeedbackSummary(fb) : undefined, source: "doctor" };
      }),
      ...(pastAiCons as unknown as Record<string,unknown>[]).map(c => {
        const pc = c.preConsultation as Record<string,unknown>;
        const r  = c.report as Record<string,unknown>;
        return { date: fmt(c.createdAt as Date), symptoms: pc?.symptoms, severity: pc?.severity, diagnosis: r?.diagnosis, medicines: (r?.medicines as Array<Record<string,unknown>>)?.map(m => `${m.medicine} ${m.dosage ?? ""}`.trim()).join(", ") ?? "", source: "ai" };
      }),
    ].sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime());

    console.log(`${tag} ✔ Patient history: ${prefetchedHistory.length} entries`);

    // ── Symptom embedding + vector search ────────────────────────────────────
    consultation.prefetchStep = "similar_cases";
    await consultation.save();

    const pc = consultation.preConsultation;
    const embeddingText = buildSymptomsEmbeddingText({
      symptoms:        pc?.symptoms ?? "",
      duration:        pc?.duration,
      severity:        pc?.severity,
      additionalNotes: pc?.additionalNotes,
    });
    console.log(`${tag} Generating embedding…`);
    const tEmbed = Date.now();
    const embedding = await embedText(embeddingText);
    console.log(`${tag} ✔ Embedding done in ${Date.now() - tEmbed}ms`);

    const tRag = Date.now();
    const prefetchedSimilarCases = await Case.aggregate([
      { $vectorSearch: { index: "case_vector_index", path: "embedding", queryVector: embedding, numCandidates: 50, limit: 5 } },
      { $project: { embedding: 0 } },
    ]);
    console.log(`${tag} ✔ Vector search done in ${Date.now() - tRag}ms — ${prefetchedSimilarCases.length} similar cases`);

    // ── Save pre-fetched data ─────────────────────────────────────────────────
    consultation.prefetchedHistory      = prefetchedHistory;
    consultation.prefetchedSimilarCases = prefetchedSimilarCases;
    consultation.prefetchStep           = "ready";
    await consultation.save();
    console.log(`${tag} ✔ Pre-fetch complete in ${Date.now() - t0}ms — waiting for call to end`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${tag} ✖ Pre-fetch failed: ${msg}`);
  }
}

async function generateReport(consultationId: string, patientUserId: string) {
  const tag = `[AI Report ${consultationId.slice(-6)}]`;
  console.log(`${tag} ▶ Starting report generation`);
  const t0 = Date.now();

  await connectDB();
  const consultation = await AiConsultation.findById(consultationId);
  if (!consultation) {
    console.error(`${tag} ✖ Consultation not found in DB — aborting`);
    return;
  }

  console.log(`${tag} Transcript length: ${consultation.transcript?.length ?? 0} chars`);
  consultation.reportStep = "transcribed";
  await consultation.save();

  const patientOid = new mongoose.Types.ObjectId(patientUserId);
  const profile = await PatientProfile.findOne({ userRef: patientOid }).lean() as {
    age?: number; gender?: string; weight?: number; height?: number; bloodGroup?: string;
    knownConditions?: string[]; allergies?: string[]; currentMedications?: string[];
  } | null;

  // ── Patient history (use pre-fetched if available) ─────────────────────────
  type HistEntry = Record<string, unknown>;
  let patientHistory: HistEntry[] = [];

  if (consultation.prefetchedHistory?.length) {
    console.log(`${tag} ✔ Using pre-fetched patient history (${consultation.prefetchedHistory.length} entries) — skipping fetch`);
    patientHistory = consultation.prefetchedHistory as HistEntry[];
    consultation.reportStep = "patient_history";
    await consultation.save();
  } else {
    console.log(`${tag} Fetching patient history (pre-fetch not available)…`);
    consultation.reportStep = "patient_history";
    await consultation.save();
  try {
    const [pastAppts, pastAiCons] = await Promise.all([
      Appointment.find({
        patientRef: patientOid,
        status: "completed",
        "prescription.diagnosis": { $exists: true },
      }).select("preConsultation prescription prescriptionFeedback consultationStartsAt createdAt")
        .sort({ createdAt: -1 }).limit(5).lean(),
      AiConsultation.find({
        patientRef: patientOid,
        status: "report_ready",
        _id: { $ne: consultationId },
      }).select("preConsultation report createdAt")
        .sort({ createdAt: -1 }).limit(5).lean(),
    ]);

    const fmt = (d: Date) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

    patientHistory = [
      ...(pastAppts as unknown as Record<string,unknown>[]).map(a => {
        const pc = a.preConsultation as Record<string,unknown>;
        const rx = a.prescription   as Record<string,unknown>;
        const fb = a.prescriptionFeedback as Record<string,unknown> | undefined;
        const meds = (rx?.medicines as Array<Record<string,unknown>>)?.map(m => `${m.medicine} ${m.dosage ?? ""}`.trim()).join(", ") ?? "";
        return {
          date:      fmt((a.consultationStartsAt || a.createdAt) as Date),
          symptoms:  pc?.symptoms, severity:  pc?.severity,
          diagnosis: rx?.diagnosis,
          medicines: meds,
          feedback:  fb ? buildFeedbackSummary(fb) : undefined,
          source:    "doctor",
        };
      }),
      ...(pastAiCons as unknown as Record<string,unknown>[]).map(c => {
        const pc = c.preConsultation as Record<string,unknown>;
        const r  = c.report as Record<string,unknown>;
        return {
          date:      fmt(c.createdAt as Date),
          symptoms:  pc?.symptoms, severity:  pc?.severity,
          diagnosis: r?.diagnosis,
          medicines: (r?.medicines as Array<Record<string,unknown>>)?.map(m => `${m.medicine} ${m.dosage ?? ""}`.trim()).join(", ") ?? "",
          source:    "ai",
        };
      }),
    ].sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime());

    console.log(`${tag} ✔ Found ${patientHistory.length} past consultations`);
  } catch (histErr) {
    const msg = histErr instanceof Error ? histErr.message : String(histErr);
    console.warn(`${tag} ⚠ Patient history fetch failed (non-fatal): ${msg}`);
  }
  }  // end else (no pre-fetched history)

  // ── Similar cases (use pre-fetched if available) ───────────────────────────
  let similarCases: unknown[] = [];
  if (consultation.prefetchedSimilarCases?.length) {
    console.log(`${tag} ✔ Using pre-fetched similar cases (${consultation.prefetchedSimilarCases.length}) — skipping embedding + vector search`);
    similarCases = consultation.prefetchedSimilarCases;
    consultation.reportStep = "similar_cases";
    await consultation.save();
  } else {
    console.log(`${tag} Running embedding + vector search (pre-fetch not available)…`);
    try {
      const pc2 = consultation.preConsultation;
      const embeddingText = buildSymptomsEmbeddingText({
        symptoms:        pc2?.symptoms ?? "",
        duration:        pc2?.duration,
        severity:        pc2?.severity,
        additionalNotes: pc2?.additionalNotes,
      });
      consultation.reportStep = "embedding";
      await consultation.save();
      const tEmbed = Date.now();
      const embedding = await embedText(embeddingText);
      console.log(`${tag} ✔ Embedding done in ${Date.now() - tEmbed}ms`);
      consultation.reportStep = "similar_cases";
      await consultation.save();
      const tRag = Date.now();
      similarCases = await Case.aggregate([
        { $vectorSearch: { index: "case_vector_index", path: "embedding", queryVector: embedding, numCandidates: 50, limit: 5 } },
        { $project: { embedding: 0 } },
      ]);
      console.log(`${tag} ✔ Vector search done in ${Date.now() - tRag}ms — ${similarCases.length} cases`);
    } catch (ragErr) {
      const msg = ragErr instanceof Error ? ragErr.message : String(ragErr);
      console.warn(`${tag} ⚠ RAG failed (non-fatal): ${msg}`);
      consultation.reportStep = "similar_cases";
      await consultation.save();
    }
  }

  // ── Drug check step (check happens inside main LLM call) ──────────────────
  console.log(`${tag} Preparing drug interaction analysis…`);
  consultation.reportStep = "drug_check";
  await consultation.save();

  const patientContext = [
    `Patient: ${consultation.patientName}`,
    `Age: ${profile?.age ?? "unknown"}, Gender: ${profile?.gender ?? "unknown"}`,
    `Weight: ${profile?.weight ?? "?"}kg, Height: ${profile?.height ?? "?"}cm, Blood Group: ${profile?.bloodGroup ?? "unknown"}`,
    `Known Conditions: ${profile?.knownConditions?.join(", ") || "none"}`,
    `Allergies: ${profile?.allergies?.join(", ") || "none"}`,
    `Ongoing Medications: ${profile?.currentMedications?.join(", ") || "none"}`,
  ].join("\n");

  const pc = consultation.preConsultation;
  const preConsContext = [
    `Chief Complaint: ${pc?.symptoms}`,
    `Duration: ${pc?.duration}, Severity: ${pc?.severity}`,
    pc?.currentMedications ? `Medications mentioned: ${pc.currentMedications}` : "",
    pc?.additionalNotes ? `Notes: ${pc.additionalNotes}` : "",
  ].filter(Boolean).join("\n");

  const historyText = patientHistory.length
    ? patientHistory.map((h, i) => {
        const feedbackLine = h.feedback ? `\n     └ Patient feedback: ${h.feedback}` : "";
        return `  ${i+1}. ${h.date} | ${h.source === "ai" ? "AI" : "Doctor"} | ${h.symptoms} (${h.severity}) → ${h.diagnosis} → Rx: ${h.medicines || "none"}${feedbackLine}`;
      }).join("\n")
    : "  No prior consultations on record.";

  const similarText = similarCases.length
    ? (similarCases as Array<Record<string, unknown>>).map((c, i) =>
        `Case ${i+1}: Symptoms: ${c.symptoms}, Diagnosis: ${c.diagnosis}, Rx: ${JSON.stringify(c.prescription)}`
      ).join("\n")
    : "No similar cases found.";

  const { generateTextGeminiFirst } = await import("@/lib/agents/llm");

  console.log(`${tag} Calling LLM (AI-mode aware, prescription task)…`);
  consultation.reportStep = "llm_sending";
  await consultation.save();

  const tLlm = Date.now();
  let llmText: string;
  try {
    const r = await generateTextGeminiFirst(`You are an AI clinical decision system generating a complete medical report for a telemedicine consultation. There is NO supervising doctor — your report goes directly to the patient, so be clear, accurate, and safe.

## Patient Profile
${patientContext}

## This Patient's Consultation History (WEAK REFERENCE — do NOT repeat same medicines blindly)
${historyText}
If a symptom is recurring or worsening, consider chronic condition or specialist referral. Do NOT copy past prescriptions.

## Pre-Consultation Form
${preConsContext}

## AI Consultation Transcript
${consultation.transcript || "No transcript available."}

## Similar Historical Cases (reference only)
${similarText}

IMPORTANT: The similar cases above are WEAK EPIDEMIOLOGICAL REFERENCES. Do NOT follow their prescriptions. Each patient is unique. Use cases only to understand what conditions present similarly in this clinic.

For SOS/conditional medicines, use the "condition" field in the medicine object to explain when to take it.

Generate a complete medical report. Be specific about medicines — include correct dosage, standard frequency, timing relative to food, and appropriate duration.

Respond ONLY with valid JSON (no markdown):
{
  "summary": "2-3 sentence clinical summary of what the patient likely has",
  "diagnosis": "Primary diagnosis with brief reasoning",
  "medicines": [
    {
      "medicine": "Drug name (generic)",
      "dosage": "e.g. 500mg",
      "timing": "before food | after food | with food",
      "frequency": "once daily | twice daily | thrice daily | as needed",
      "duration": "e.g. 5 days",
      "condition": "empty for regular, or when to take for SOS",
      "purpose": "Brief plain-language reason in max 7 words (e.g. To reduce fever and relieve pain)"
    }
  ],
  "advice": [
    "Brief practical point 1 (max 10 words)",
    "Brief practical point 2",
    "Brief practical point 3",
    "Brief practical point 4",
    "Brief practical point 5"
  ],
  "drugSafetyNote": "One-line note about drug interactions or safety concerns with patient's current medications, or empty string if none"
}
Advice must be exactly 5 short practical points. No "Do:/Don't:" prefixes, no markdown, no headings.`, 60_000, { task: "prescription" });
    llmText = r.text;
    if (r.geminiError && r.provider === "deepseek") {
      console.warn(`${tag} Gemini unavailable (${r.geminiError}) — DeepSeek generated this report`);
    }
    console.log(`${tag} ✔ LLM responded via ${r.provider} in ${Date.now() - tLlm}ms`);
  } catch (llmErr) {
    const msg = llmErr instanceof Error ? llmErr.message : String(llmErr);
    console.error(`${tag} ✖ LLM call FAILED after ${Date.now() - tLlm}ms`);
    console.error(`${tag} Error: ${msg}`);
    if (llmErr && typeof llmErr === "object" && "status" in llmErr) {
      console.error(`${tag} HTTP status: ${(llmErr as { status: number }).status}`);
    }
    consultation.status = "report_ready";
    consultation.reportStep = "done";
    consultation.reportGeneratedAt = new Date();
    await consultation.save();
    return;
  }

  consultation.reportStep = "llm_success";
  await consultation.save();

  console.log(`${tag} Parsing JSON response…`);
  consultation.reportStep = "parsing";
  await consultation.save();

  try {
    const text  = llmText.trim();
    console.log(`${tag} Raw response length: ${text.length} chars`);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) console.warn(`${tag} ⚠ No JSON object found in response — attempting full parse`);

    const data  = JSON.parse(match ? match[0] : text) as {
      summary: string; diagnosis: string;
      medicines: Array<{ medicine: string; dosage: string; timing: string; frequency: string; duration: string; condition?: string; purpose?: string }>;
      advice: string | string[];
      drugSafetyNote?: string;
    };

    const adviceStr = Array.isArray(data.advice)
      ? data.advice.slice(0, 5).join("\n")
      : (data.advice ?? "");

    console.log(`${tag} ✔ Parsed: diagnosis="${data.diagnosis?.slice(0,60)}…", medicines=${data.medicines?.length ?? 0}`);

    consultation.report = {
      summary:        data.summary        ?? "",
      diagnosis:      data.diagnosis      ?? "",
      medicines:      data.medicines      ?? [],
      advice:         adviceStr,
      dosAndDonts:    [],
      drugSafetyNote: data.drugSafetyNote ?? "",
    };
    consultation.status            = "report_ready";
    consultation.reportStep        = "done";
    consultation.reportGeneratedAt = new Date();
    await consultation.save();
    console.log(`${tag} ✔ Report saved. Total time: ${Date.now() - t0}ms`);

    // Auto-trigger Agent 1: update running summary after AI consultation
    try {
      await refreshPatientSummaryPostConsultation(patientUserId);
      console.log(`${tag} ✔ Running summary + recent consultations updated`);
    } catch (a1Err) {
      console.error(`${tag} Agent 1 running summary failed (non-fatal):`, a1Err);
    }
  } catch (parseErr) {
    const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    console.error(`${tag} ✖ JSON parse FAILED: ${msg}`);
    console.error(`${tag} Raw response (first 500 chars): ${llmText.slice(0, 500)}`);
    consultation.status            = "report_ready";
    consultation.reportStep        = "done";
    consultation.reportGeneratedAt = new Date();
    await consultation.save();
    console.log(`${tag} Marked report_ready despite parse failure. Total time: ${Date.now() - t0}ms`);
  }
}
