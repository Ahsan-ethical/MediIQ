import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";
import PatientProfile from "@/lib/models/PatientProfile";
import { runSimilarCasesAgent } from "@/lib/agents/agent3";
import { runMedicalContextAgent } from "@/lib/agents/agent4";
import { runAllergyContextAgent } from "@/lib/agents/agent5";

// Agents 3/4/5 hit external services (Atlas vector search, MedlinePlus, RxClass) —
// allow them time. Vercel Pro honours up to 300s; Hobby caps at 60s.
export const maxDuration = 300;

/**
 * POST — Runs the REAL pre-call agents (3 Similar Cases, 4 Medical Context,
 * 5 Allergy Context) and AWAITS them, so they survive on serverless. The patient's
 * pre-consultation page calls this right after locking their details.
 *
 * An atomic claim (agents_345_running → agents_345_processing) makes it run exactly
 * once. Demo mode already fills 3/4/5 synchronously in lock-preconsultation, so the
 * claim simply no-ops there.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const { id } = await params;

    // Only proceed if the pipeline is sitting at "agents_345_running" (set by lock).
    const claimed = await Appointment.findOneAndUpdate(
      { _id: id, agentPipelineStep: "agents_345_running" },
      { $set: { agentPipelineStep: "agents_345_processing" } },
    ).lean() as { _id: unknown; patientRef: Types.ObjectId; preConsultation?: { symptoms?: string; duration?: string; severity?: string; additionalNotes?: string }; agentOutputs?: Record<string, unknown> } | null;

    if (!claimed) {
      const cur = await Appointment.findById(id).select("agentPipelineStep").lean() as { agentPipelineStep?: string } | null;
      return NextResponse.json({ ok: true, alreadyRunning: true, step: cur?.agentPipelineStep ?? "idle" });
    }

    const profile = await PatientProfile.findOne({ userRef: claimed.patientRef }).lean();
    const pc = claimed.preConsultation;
    const symptoms = pc?.symptoms ?? "";
    const symptomsArr = symptoms.split(",").map((s: string) => s.trim()).filter(Boolean);

    // Fire all three in parallel — they're fully independent. Use allSettled so ONE
    // agent's failure (e.g. an external API timeout) never discards the other two's work.
    const [s3, s4, s5] = await Promise.allSettled([
      runSimilarCasesAgent({
        symptoms,
        duration: pc?.duration,
        severity: pc?.severity,
        additionalNotes: pc?.additionalNotes,
        patientAge: profile?.age,
        patientConditions: (profile?.knownConditions as string[]) ?? [],
      }),
      runMedicalContextAgent({
        patientId: claimed.patientRef.toString(),
        knownConditions: (profile?.knownConditions as string[]) ?? [],
        bookingSymptoms: symptomsArr,
      }),
      runAllergyContextAgent({
        knownAllergies: ((profile?.allergies as string[]) ?? []).map((a: string) => ({
          allergen: a, severity: "severe" as const, status: "confirmed" as const, source: "patient_record" as const,
        })),
        consultationMentions: [],
        suspectedFromFeedback: [],
      }),
    ]);

    const a3 = s3.status === "fulfilled" ? s3.value : null;
    const a4 = s4.status === "fulfilled" ? s4.value : null;
    const a5 = s5.status === "fulfilled" ? s5.value : null;
    if (s3.status === "rejected") console.error("[run-precall] agent3 threw:", s3.reason);
    if (s4.status === "rejected") console.error("[run-precall] agent4 threw:", s4.reason);
    if (s5.status === "rejected") console.error("[run-precall] agent5 threw:", s5.reason);

    // Store outputs with dot-notation $set so we NEVER clobber other agents
    // (e.g. agent2/6/7/8 written by the post-call pipeline if the call ended first).
    // Never store null — a completed agent renders with its (possibly empty) result.
    await Appointment.findByIdAndUpdate(id, {
      $set: {
        "agentOutputs.agent3": a3?.output ?? { topCases: [], overallSummary: "No similar cases found.", status: a3?.status ?? "error" },
        "agentOutputs.agent4": a4?.output ?? { status: a4?.status ?? "error", note: "No medical context produced." },
        "agentOutputs.agent5": a5?.output ?? { expanded: [], crossReactivityFlags: [], status: a5?.status ?? "error" },
      },
    });

    // Only advance the step if we're STILL in pre-call — never overwrite "call_ended"
    // or a post-call step that end-call / run-pipeline may have set while we ran.
    await Appointment.findOneAndUpdate(
      { _id: id, agentPipelineStep: "agents_345_processing" },
      { $set: { agentPipelineStep: "agents_345_done" } },
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[run-precall]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
