import type { AgentFn, PatientSummary } from "./types";
import { connectDB } from "@/lib/mongodb";
import PatientProfile from "@/lib/models/PatientProfile";
import Appointment from "@/lib/models/Appointment";
import AiConsultation from "@/lib/models/AiConsultation";
import User from "@/lib/models/User";
import { buildFeedbackSummary } from "@/lib/feedbackUtils";
import {
  generateRunningSummary,
  generateProfileSummary,
  type ConsultationForSummary,
} from "./gemini-helpers";
import mongoose from "mongoose";
import type { IRecentConsultation, IRunningSummaryMeta } from "@/lib/models/PatientProfile";

export interface Agent1Input {
  patientUserId: string;
}

// ── Read-only agent: assemble PatientSummary from pre-computed data ─────────

export const runPatientSummaryAgent: AgentFn<Agent1Input, PatientSummary> = async (input) => {
  const start = Date.now();
  const logs: string[] = [];
  const { patientUserId } = input;

  if (!patientUserId) {
    return {
      agentId: 1, agentName: "Patient Summary Agent", status: "error",
      input, output: null, feedsInto: [6], triggeredBy: [], logs: ["No patientUserId provided"],
      durationMs: Date.now() - start, error: "Missing patientUserId",
    };
  }

  try {
    await connectDB();
    logs.push("Connected to MongoDB");

    const patientOid = new mongoose.Types.ObjectId(patientUserId);

    // Single DB call — everything we need is in the profile
    const [profile, user] = await Promise.all([
      PatientProfile.findOne({ userRef: patientOid }).lean(),
      User.findById(patientOid).select("name").lean(),
    ]);

    if (!profile || !user) {
      return {
        agentId: 1, agentName: "Patient Summary Agent", status: "error",
        input, output: null, feedsInto: [6], triggeredBy: [],
        logs: [...logs, `Profile ${profile ? "found" : "NOT found"}`, `User ${user ? "found" : "NOT found"}`],
        durationMs: Date.now() - start, error: "Patient profile or user not found",
      };
    }

    const patientName = (user as { name: string }).name;
    logs.push(`Loaded profile for ${patientName} (${profile.age}yo ${profile.gender})`);
    logs.push(`Known conditions: ${profile.knownConditions?.join(", ") || "none"}`);
    logs.push(`Allergies: ${profile.allergies?.join(", ") || "none"}`);
    logs.push(`Current medications: ${profile.currentMedications?.join(", ") || "none"}`);

    // Use pre-computed profileSummary (generated on profile save)
    let profileSummary = (profile.summary as string) ?? "";
    if (!profileSummary) {
      logs.push("No profile summary found — generating now (first time)...");
      profileSummary = await generateProfileSummary(patientName, {
        age: profile.age, gender: profile.gender,
        weight: profile.weight, height: profile.height,
        bloodGroup: profile.bloodGroup,
        city: profile.city, state: profile.state, country: profile.country,
        knownConditions: profile.knownConditions ?? [],
        allergies: profile.allergies ?? [],
        currentMedications: profile.currentMedications ?? [],
      });
      await PatientProfile.findByIdAndUpdate(profile._id, { summary: profileSummary });
      logs.push(`Profile summary generated and saved (${profileSummary.length} chars)`);
    } else {
      logs.push(`Using pre-computed profile summary (${profileSummary.length} chars)`);
    }

    // Use pre-computed runningSummary (generated post-consultation)
    const runningSummary = (profile.runningSummary as string) || "No consultations on record yet.";
    const meta = profile.runningSummaryMeta as IRunningSummaryMeta | null;
    if (meta) {
      logs.push(`Using pre-computed running summary (generated ${new Date(meta.generatedAt).toLocaleString()}, ${meta.consultationCount} consultations, latest: ${meta.latestConsultationDate})`);
    } else {
      logs.push(`Using running summary from profile (${runningSummary.length} chars)`);
    }

    // Use pre-embedded recentConsultations (last 3, generated post-consultation)
    const recentConsultations = (profile.recentConsultations as IRecentConsultation[]) ?? [];
    logs.push(`Recent consultations: ${recentConsultations.length} loaded from profile`);

    const output: PatientSummary = {
      patientId: profile.userId,
      name: patientName,
      age: profile.age,
      gender: profile.gender,
      weight: profile.weight,
      height: profile.height,
      bloodGroup: profile.bloodGroup,
      knownConditions: profile.knownConditions ?? [],
      allergies: profile.allergies ?? [],
      currentMedications: profile.currentMedications ?? [],
      pastConsultations: recentConsultations.map((c) => ({
        date: c.date,
        type: c.type,
        symptoms: c.symptoms,
        diagnosis: c.diagnosis,
        medicines: c.medicines,
      })),
      profileSummary,
      runningSummary,
    };

    logs.push(`Agent 1 completed in ${Date.now() - start}ms (0 LLM calls)`);

    return {
      agentId: 1, agentName: "Patient Summary Agent", status: "ok",
      input, output, feedsInto: [6], triggeredBy: [],
      logs, durationMs: Date.now() - start,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logs.push(`ERROR: ${msg}`);
    return {
      agentId: 1, agentName: "Patient Summary Agent", status: "error",
      input, output: null, feedsInto: [6], triggeredBy: [],
      logs, durationMs: Date.now() - start, error: msg,
    };
  }
};

// ── Post-consultation trigger: rebuild runningSummary + recentConsultations ──
// Called after a consultation is marked "completed" (from prescription route)

export async function refreshPatientSummaryPostConsultation(patientUserId: string): Promise<void> {
  const tag = `[Agent1-PostConsultation ${patientUserId.slice(-6)}]`;
  try {
    await connectDB();
    const patientOid = new mongoose.Types.ObjectId(patientUserId);

    const [profile, user] = await Promise.all([
      PatientProfile.findOne({ userRef: patientOid }).lean(),
      User.findById(patientOid).select("name").lean(),
    ]);

    if (!profile || !user) {
      console.error(`${tag} Profile or user not found`);
      return;
    }

    const patientName = (user as { name: string }).name;

    // Fetch all COMPLETED doctor appointments (exclude cancelled/rejected)
    const pastAppts = await Appointment.find({
      patientRef: patientOid,
      status: "completed",
      "prescription.diagnosis": { $exists: true },
    })
      .select("preConsultation prescription prescriptionFeedback prescriptionSentAt consultationStartsAt createdAt")
      .sort({ createdAt: -1 })
      .lean();

    // Fetch all COMPLETED AI consultations
    const pastAiCons = await AiConsultation.find({
      patientRef: patientOid,
      status: "report_ready",
    })
      .select("preConsultation report createdAt")
      .sort({ createdAt: -1 })
      .lean();

    console.log(`${tag} Found ${pastAppts.length} doctor + ${pastAiCons.length} AI completed consultations`);

    const fmt = (d: Date | string) =>
      new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

    // Build full consultation list for runningSummary generation
    const consultations: ConsultationForSummary[] = [
      ...(pastAppts as unknown as Record<string, unknown>[]).map((a) => {
        const pc = a.preConsultation as Record<string, unknown> | undefined;
        const rx = a.prescription as Record<string, unknown> | undefined;
        const fb = a.prescriptionFeedback as Record<string, unknown> | undefined;
        const meds = (rx?.medicines as Array<Record<string, unknown>>)
          ?.map((m) => `${m.medicine} ${m.dosage ?? ""}`.trim())
          .join(", ") ?? "";
        return {
          date: fmt((a.consultationStartsAt || a.createdAt) as Date),
          source: "doctor" as const,
          symptoms: String(pc?.symptoms ?? ""),
          severity: String(pc?.severity ?? ""),
          diagnosis: String(rx?.diagnosis ?? ""),
          medicines: meds,
          advice: String(rx?.advice ?? ""),
          drugSafetyNote: String(rx?.drugSafetyNote ?? ""),
          feedback: fb ? buildFeedbackSummary(fb) : undefined,
        };
      }),
      ...(pastAiCons as unknown as Record<string, unknown>[]).map((c) => {
        const pc = c.preConsultation as Record<string, unknown> | undefined;
        const r = c.report as Record<string, unknown> | undefined;
        return {
          date: fmt(c.createdAt as Date),
          source: "ai" as const,
          symptoms: String(pc?.symptoms ?? ""),
          severity: String(pc?.severity ?? ""),
          diagnosis: String(r?.diagnosis ?? ""),
          medicines: (r?.medicines as Array<Record<string, unknown>>)
            ?.map((m) => `${m.medicine} ${m.dosage ?? ""}`.trim())
            .join(", ") ?? "",
          advice: String(r?.advice ?? ""),
          drugSafetyNote: String(r?.drugSafetyNote ?? ""),
        };
      }),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Generate runningSummary via Gemini
    const profileSummary = (profile.summary as string) ?? "";
    const runningSummary = await generateRunningSummary(
      patientName,
      {
        age: profile.age, gender: profile.gender,
        weight: profile.weight, height: profile.height,
        bloodGroup: profile.bloodGroup,
        knownConditions: profile.knownConditions ?? [],
        allergies: profile.allergies ?? [],
        currentMedications: profile.currentMedications ?? [],
      },
      profileSummary,
      consultations,
    );

    // Build recentConsultations (last 3 completed)
    const recent: IRecentConsultation[] = consultations.slice(-3).reverse().map((c) => ({
      date: c.date,
      type: c.source,
      symptoms: c.symptoms,
      diagnosis: c.diagnosis,
      medicines: c.medicines.split(", ").filter(Boolean),
    }));

    const summaryMeta: IRunningSummaryMeta = {
      generatedAt: new Date(),
      consultationCount: consultations.length,
      latestConsultationDate: consultations.length > 0 ? consultations[consultations.length - 1].date : "",
    };

    // Save everything in one update
    await PatientProfile.findByIdAndUpdate(profile._id, {
      runningSummary,
      runningSummaryMeta: summaryMeta,
      recentConsultations: recent,
    });

    console.log(`${tag} ✅ Updated: runningSummary (${runningSummary.length} chars), ${recent.length} recent consultations, meta: ${consultations.length} total consultations`);
  } catch (err) {
    console.error(`${tag} Failed:`, err);
  }
}
