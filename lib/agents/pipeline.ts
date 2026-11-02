/**
 * 9-Agent Pipeline Runner
 *
 * Called after the video call ends. Executes the agent chain:
 *   Agent 2 (transcript) → Agent 6 (prescribe) → Agent 7 (drug check) → Agent 8 (allergy check)
 *   with 6↔7/8 loop if issues found (max 2 loops).
 *
 * Agents 3, 4, 5 should already have run on Lock (pre-consultation).
 * Agent 1 runs on profile save and after consultation (separate trigger).
 * Agent 9 runs after doctor sends prescription (separate trigger).
 */

import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";
import PatientProfile from "@/lib/models/PatientProfile";
import User from "@/lib/models/User";
import SystemDetected from "@/lib/models/SystemDetected";
import { isDemoMode } from "@/lib/models/Settings";
import mongoose from "mongoose";

import { runTranscribeAgent } from "./agent2";
import { runSimilarCasesAgent } from "./agent3";
import { runMedicalContextAgent } from "./agent4";
import { runAllergyContextAgent } from "./agent5";
import { runReasoningAgent } from "./agent6";
import { runDrugMedicAgent } from "./agent7";
import { runAllergyAgent } from "./agent8";
import { matchDemoScenario, SCENARIO_A, SCENARIO_B } from "./demo-cache";

import type {
  Agent6Input,
  Agent6Output,
  Agent7Input,
  Agent7Output,
  Agent8Input,
  Agent8Output,
  TranscriptResult,
  SimilarCase,
  Agent4EvidenceSummary,
  ExpandedAllergyBlock,
} from "./types";

const MAX_LOOPS = 2;

async function updateStep(apptId: string, step: string, extra?: Record<string, unknown>) {
  await Appointment.findByIdAndUpdate(apptId, {
    agentPipelineStep: step,
    ...extra,
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runDemoPipeline(appointmentId: string, symptoms: string) {
  const scenarioKey = matchDemoScenario(symptoms);
  if (!scenarioKey) return false;

  const tag = `[DEMO ${appointmentId.slice(-6)}]`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scenario = (scenarioKey === "A" ? SCENARIO_A : SCENARIO_B) as any;
  const isComplex = scenarioKey === "B";

  console.log(`${tag} ▶ Playing demo scenario ${scenarioKey}`);

  // Read existing agentOutputs (agent 3/4/5 from Lock step) — don't overwrite
  const existingAppt = await Appointment.findById(appointmentId).select("agentOutputs").lean();
  const agentOutputs: Record<string, unknown> = (existingAppt?.agentOutputs as Record<string, unknown>) ?? {};

  // If Lock wasn't clicked, fill agents 3/4/5 from cache now
  if (!agentOutputs.agent3) agentOutputs.agent3 = { topCases: scenario.agent3.topCases, overallSummary: scenario.agent3.overallSummary };
  if (!agentOutputs.agent4) agentOutputs.agent4 = scenario.agent4;
  if (!agentOutputs.agent5) agentOutputs.agent5 = scenario.agent5;

  // Add Agent 1 data (read from patient profile)
  const apptForProfile = await Appointment.findById(appointmentId).select("patientRef").lean();
  if (apptForProfile?.patientRef) {
    const prof = await PatientProfile.findOne({ userRef: apptForProfile.patientRef }).lean();
    if (prof) {
      agentOutputs.agent1 = {
        profileSummary: (prof as unknown as Record<string, unknown>).summary ?? "Profile summary not yet generated",
        runningSummary: (prof as unknown as Record<string, unknown>).runningSummary ?? "No consultations on record yet",
      };
    }
  }

  // Show agents 1,3,4,5 completing first
  await updateStep(appointmentId, "agent_1_done", { agentOutputs });
  await sleep(200);
  await updateStep(appointmentId, "agents_345_done", { agentOutputs });
  await sleep(200);

  // Agent 2 — Use cached transcript (no LLM call in demo — keeps it fast for Vercel)
  await updateStep(appointmentId, "agent_2_running", { agentOutputs });
  await sleep(300);
  agentOutputs.agent2 = scenario.agent2;
  await updateStep(appointmentId, "agent_2_done", { agentOutputs });
  console.log(`${tag} Agent 2 done (cached)`);

  // Helper to convert advice array to string for DB
  const rxForDb = (rx: Record<string, unknown>) => {
    const copy = { ...rx };
    if (Array.isArray(copy.advice)) copy.advice = (copy.advice as string[]).join("\n");
    return copy;
  };

  // Agent 6 — Prescribe (first pass)
  await sleep(300);
  await updateStep(appointmentId, "agent_6_running", { agentOutputs });
  await sleep(300);
  const a6Pass1 = isComplex ? scenario.agent6_pass1 : scenario.agent6;
  agentOutputs.agent6 = a6Pass1;
  const a6Rx1 = (a6Pass1 as { prescription: Record<string, unknown> }).prescription;
  await Appointment.findByIdAndUpdate(appointmentId, {
    agentOutputs, agentPipelineStep: "agent_6_done", aiPrescription: rxForDb(a6Rx1), prescriptionStep: "done",
  });
  console.log(`${tag} Agent 6 pass 1 done`);

  // Agent 7 — Drug Check (first pass)
  await sleep(300);
  await updateStep(appointmentId, "agent_7_running", { agentOutputs });
  await sleep(300);
  const a7Pass1 = isComplex ? scenario.agent7_pass1 : scenario.agent7;
  agentOutputs.agent7 = a7Pass1;
  const a7Flags1 = isComplex ? [{
    drug: "Amoxicillin",
    reason: "CRITICAL: Amoxicillin is a Penicillin-class drug. Patient has confirmed SEVERE Penicillin allergy. Hard block.",
    suggestedAlternative: "Azithromycin 500mg",
    flaggedBy: "agent7" as const,
  }] : [];
  await Appointment.findByIdAndUpdate(appointmentId, {
    agentOutputs, agentPipelineStep: "agent_7_done", flaggedDrugs: a7Flags1,
  });
  console.log(`${tag} Agent 7 pass 1: ${(a7Pass1 as { status: string }).status}`);

  if (isComplex) {
    await sleep(300);
    await updateStep(appointmentId, "loop_2_agent_6_running", { agentOutputs });
    await sleep(300);
    agentOutputs.agent6 = scenario.agent6_pass2;
    const a6Rx2 = (scenario.agent6_pass2 as { prescription: Record<string, unknown> }).prescription;
    await Appointment.findByIdAndUpdate(appointmentId, {
      agentOutputs, agentPipelineStep: "loop_2_agent_6_done", aiPrescription: rxForDb(a6Rx2),
    });
    console.log(`${tag} Agent 6 pass 2 done (revised)`);

    await sleep(300);
    await updateStep(appointmentId, "loop_2_agent_7_running", { agentOutputs });
    await sleep(300);
    agentOutputs.agent7 = scenario.agent7_pass2;
    await updateStep(appointmentId, "loop_2_agent_7_done", { agentOutputs });
    console.log(`${tag} Agent 7 pass 2: PASS`);
  }

  // Agent 8 — Allergy Check
  await sleep(300);
  await updateStep(appointmentId, "agent_8_running", { agentOutputs });
  await sleep(300);
  agentOutputs.agent8 = scenario.agent8;
  await updateStep(appointmentId, "agent_8_done", { agentOutputs });
  console.log(`${tag} Agent 8: ${(scenario.agent8 as { status: string }).status}`);

  // Determine final prescription
  const a8 = scenario.agent8 as { revisedPrescription?: Record<string, unknown>; status: string };
  const a6Final = isComplex ? scenario.agent6_pass2 : scenario.agent6;
  const rawRx = a8.revisedPrescription ?? (a6Final as { prescription: Record<string, unknown> }).prescription;

  // Convert advice array → string (schema expects String)
  const finalRx = { ...rawRx } as Record<string, unknown>;
  if (Array.isArray(finalRx.advice)) {
    finalRx.advice = (finalRx.advice as string[]).join("\n");
  }

  // Save everything
  await Appointment.findByIdAndUpdate(appointmentId, {
    agentOutputs,
    agentPipelineStep: "pipeline_done",
    aiPrescription: finalRx,
    prescriptionStep: "done",
    flaggedDrugs: scenario.flaggedDrugs,
    similarCases: scenario.agent3.topCases.slice(0, 5),
    aiHistorySummary: (a6Final as { prescription: { historySummary?: string } }).prescription?.historySummary ?? "",
  });

  // Agent 9 — write findings to SystemDetected
  // In demo mode: RESET any existing findings back to "pending" so they always appear
  const a9 = scenario.agent9 as { findings: Array<{ type: string; value: string; severity?: string; allergyStatus?: string; reason: string; source: string }> };
  if (a9.findings.length > 0) {
    const appt = await Appointment.findById(appointmentId).select("patientRef").lean();
    if (appt?.patientRef) {
      for (const f of a9.findings) {
        // Check if value is already in the patient's profile (already accepted previously)
        const profile = await PatientProfile.findOne({ userRef: appt.patientRef }).lean();
        const allergies = ((profile?.allergies ?? []) as string[]).map(a => a.toLowerCase());
        const meds = ((profile?.currentMedications ?? []) as string[]).map(m => m.toLowerCase());
        const alreadyInProfile =
          (f.type === "allergy" && allergies.includes(f.value.toLowerCase())) ||
          (f.type === "lifelong_med" && meds.some(m => m.includes(f.value.toLowerCase().split(" ")[0])));

        if (alreadyInProfile) {
          console.log(`${tag} Agent 9: "${f.value}" already in patient profile — skipping`);
          continue;
        }

        // Force upsert back to "pending" (even if previously rejected)
        await SystemDetected.updateOne(
          { patientRef: appt.patientRef, type: f.type, value: f.value },
          {
            $set: {
              patientRef: appt.patientRef,
              type: f.type,
              value: f.value,
              severity: f.severity,
              allergyStatus: f.allergyStatus,
              reason: f.reason,
              source: f.source,
              status: "pending",
            },
          },
          { upsert: true },
        ).catch(() => {});
      }
      console.log(`${tag} Agent 9: wrote ${a9.findings.length} finding(s) to SystemDetected`);
    }
  }

  console.log(`${tag} ✅ Demo pipeline complete`);
  return true;
}

export async function runPostCallPipeline(
  appointmentId: string,
  transcript: string,
) {
  const tag = `[Pipeline ${appointmentId.slice(-6)}]`;
  console.log(`${tag} ▶ Starting 9-agent pipeline`);
  const t0 = Date.now();

  try {
    await connectDB();

    // ── Demo mode check ──────────────────────────────────────────────────────
    const demo = await isDemoMode();
    if (demo) {
      const appt = await Appointment.findById(appointmentId).select("preConsultation").lean();
      const symptoms = (appt?.preConsultation as unknown as Record<string, unknown>)?.symptoms as string ?? "";
      const played = await runDemoPipeline(appointmentId, symptoms);
      if (played) return;
      console.log(`${tag} Demo mode ON but symptoms don't match any scenario — running real pipeline`);
    }

    const appt = await Appointment.findById(appointmentId);
    if (!appt) { console.error(`${tag} Appointment not found`); return; }

    const patientOid = new mongoose.Types.ObjectId(appt.patientRef.toString());
    const [profile, patientUser] = await Promise.all([
      PatientProfile.findOne({ userRef: patientOid }).lean(),
      User.findById(patientOid).select("name").lean(),
    ]);

    const patientName = (patientUser as { name: string } | null)?.name ?? "Patient";
    const agentOutputs = (appt.agentOutputs as Record<string, unknown>) ?? {};

    // ── Ensure pre-call agents 3/4/5 are present ─────────────────────────────
    // If the pre-warm (run-precall) didn't finish before the call ended (short call),
    // run them now so Agent 6 gets real similar-cases / medical-context / allergy data.
    if (!agentOutputs.agent3 || !agentOutputs.agent4 || !agentOutputs.agent5) {
      // Re-read the latest outputs first: run-precall (pre-warm) may have just finished
      // some of them. We only (re)run the ones still genuinely missing — completed work
      // is preserved, never redone.
      const fresh = await Appointment.findById(appointmentId).select("agentOutputs").lean() as { agentOutputs?: Record<string, unknown> } | null;
      const freshOut = fresh?.agentOutputs ?? {};
      for (const k of ["agent3", "agent4", "agent5"] as const) {
        if (freshOut[k] != null && agentOutputs[k] == null) agentOutputs[k] = freshOut[k];
      }

      const need3 = agentOutputs.agent3 == null;
      const need4 = agentOutputs.agent4 == null;
      const need5 = agentOutputs.agent5 == null;

      if (need3 || need4 || need5) {
        console.log(`${tag} Pre-call agents missing — running inline (3:${need3} 4:${need4} 5:${need5})`);
        const pcx = appt.preConsultation;
        const sym = pcx?.symptoms ?? "";
        const symArr = sym.split(",").map((s: string) => s.trim()).filter(Boolean);

        // Fire only the missing ones, in parallel + independently (allSettled so one
        // failure never sinks the others).
        const [r3, r4, r5] = await Promise.allSettled([
          need3 ? runSimilarCasesAgent({ symptoms: sym, duration: pcx?.duration, severity: pcx?.severity, additionalNotes: pcx?.additionalNotes, patientAge: profile?.age, patientConditions: (profile?.knownConditions as string[]) ?? [] }) : Promise.resolve(null),
          need4 ? runMedicalContextAgent({ patientId: appt.patientRef.toString(), knownConditions: (profile?.knownConditions as string[]) ?? [], bookingSymptoms: symArr }) : Promise.resolve(null),
          need5 ? runAllergyContextAgent({ knownAllergies: ((profile?.allergies as string[]) ?? []).map((a: string) => ({ allergen: a, severity: "severe" as const, status: "confirmed" as const, source: "patient_record" as const })), consultationMentions: [], suspectedFromFeedback: [] }) : Promise.resolve(null),
        ]);

        const set: Record<string, unknown> = {};
        if (need3) {
          const v = r3.status === "fulfilled" ? r3.value : null;
          agentOutputs.agent3 = v?.output ?? { topCases: [], overallSummary: "No similar cases found.", status: v?.status ?? "error" };
          set["agentOutputs.agent3"] = agentOutputs.agent3;
        }
        if (need4) {
          const v = r4.status === "fulfilled" ? r4.value : null;
          agentOutputs.agent4 = v?.output ?? { status: v?.status ?? "error", note: "No medical context produced." };
          set["agentOutputs.agent4"] = agentOutputs.agent4;
        }
        if (need5) {
          const v = r5.status === "fulfilled" ? r5.value : null;
          agentOutputs.agent5 = v?.output ?? { expanded: [], crossReactivityFlags: [], status: v?.status ?? "error" };
          set["agentOutputs.agent5"] = agentOutputs.agent5;
        }
        if (Object.keys(set).length) await Appointment.findByIdAndUpdate(appointmentId, { $set: set });
      }
    }

    // ── Agent 2: Transcribe (ONLY if real audio/speech was captured) ─────────
    // No fabrication: if the call produced no transcript, we skip Agent 2 entirely,
    // mark it "No audio detected", and continue with the real pre-consultation data.
    const hasSpeech = (transcript ?? "").trim().length > 0;
    let a2Output: TranscriptResult | null = null;

    if (hasSpeech) {
      await updateStep(appointmentId, "agent_2_running");
      console.log(`${tag} Running Agent 2 (Transcribe)...`);
      const a2Result = await runTranscribeAgent({ rawTranscript: transcript });
      a2Output = a2Result.output as TranscriptResult | null;
      // Never store null — so the UI shows the agent as completed, not "Waiting".
      agentOutputs.agent2 = a2Output ?? { status: "no_output", reason: "Transcription produced no structured output." };
      await updateStep(appointmentId, "agent_2_done", { agentOutputs });
      console.log(`${tag} Agent 2 done (${a2Result.durationMs}ms)`);
    } else {
      console.log(`${tag} No audio/speech captured — skipping Agent 2 (Transcribe)`);
      agentOutputs.agent2 = {
        skipped: true,
        status: "no_audio",
        reason: "No audio detected — the consultation produced no captured speech, so there is nothing to transcribe.",
      };
      // Advance the step so the pipeline continues; the output above tells the UI it was skipped.
      await updateStep(appointmentId, "agent_2_done", { agentOutputs });
    }

    // ── Gather pre-lock outputs (Agents 3, 4, 5) ────────────────────────────
    const a3Output = agentOutputs.agent3 as { topCases?: SimilarCase[]; overallSummary?: string } | null;
    const a4Output = agentOutputs.agent4 as {
      conditions?: Array<{ inputName: string; conditionSummary: string }>;
      evidenceSummary?: Agent4EvidenceSummary;
    } | null;
    const a5Output = agentOutputs.agent5 as {
      expanded?: ExpandedAllergyBlock[];
      crossReactivityFlags?: string[];
      safeAlternativesSummary?: Record<string, string[]>;
    } | null;

    // ── Build Agent 6 input ──────────────────────────────────────────────────
    const pc = appt.preConsultation;
    const vitals = pc?.vitals;

    const agent6Input: Agent6Input = {
      patient: {
        patientId: profile?.userId ?? "",
        name: patientName,
        age: profile?.age ?? 0,
        gender: (profile?.gender as string) ?? "",
        weight: profile?.weight ?? 0,
        height: profile?.height ?? 0,
        bloodGroup: (profile?.bloodGroup as string) ?? "",
        knownConditions: (profile?.knownConditions as string[]) ?? [],
        allergies: (profile?.allergies as string[]) ?? [],
        currentMedications: (profile?.currentMedications as string[]) ?? [],
        profileSummary: (profile?.summary as string) ?? "",
        runningSummary: (profile?.runningSummary as string) ?? "",
        pastConsultations: [],
      },
      transcript: a2Output ?? {
        structuredTranscript: [],
        chiefComplaint: pc?.symptoms ?? "",
        mentionedSymptoms: [],
        mentionedMedications: [],
        mentionedAllergies: [],
        duration: pc?.duration ?? "",
        severity: (pc?.severity as "mild" | "moderate" | "severe") ?? "moderate",
      },
      similarCases: {
        topCases: a3Output?.topCases ?? [],
        overallSummary: a3Output?.overallSummary ?? "",
      },
      medicalContext: {
        conditionSummaries: (a4Output?.conditions ?? []).map((c) => ({
          name: c.inputName,
          summary: c.conditionSummary,
        })),
        evidenceSummary: a4Output?.evidenceSummary ?? {
          findings: [], possibleDiagnoses: [], differentials: [],
          redFlags: [], managementConsiderations: [], clinicalInsights: [],
        },
      },
      allergyContext: {
        expanded: a5Output?.expanded ?? [],
        crossReactivityFlags: a5Output?.crossReactivityFlags ?? [],
        safeAlternatives: a5Output?.safeAlternativesSummary ?? {},
      },
    };

    // ── Agent 6 → 7 + 8 verify → loop if flagged ─────────────────────────────
    let currentPrescription = null as Agent6Output | null;
    let a7Output: Agent7Output | null = null;
    let a8Output: Agent8Output | null = null;
    const allFlagged: Array<{
      drug: string; reason: string;
      flaggedBy: "agent7" | "agent8";
    }> = [];

    for (let loop = 0; loop < MAX_LOOPS; loop++) {
      // ── Agent 6: Reasoning ─────────────────────────────────────────────────
      const stepPrefix = loop > 0 ? `loop_${loop + 1}_` : "";
      await updateStep(appointmentId, `${stepPrefix}agent_6_running`);
      console.log(`${tag} Running Agent 6 (Reasoning)${loop > 0 ? ` — loop ${loop + 1}` : ""}...`);

      const a6Result = await runReasoningAgent(
        loop === 0 ? agent6Input : {
          ...agent6Input,
          loopContext: {
            loopNumber: loop + 1,
            flaggedDrugs: allFlagged.map(f => ({
              drug: f.drug,
              reason: f.reason,
              flaggedBy: f.flaggedBy,
            })),
          },
        },
      );
      currentPrescription = a6Result.output as Agent6Output | null;
      agentOutputs.agent6 = currentPrescription;
      await updateStep(appointmentId, `${stepPrefix}agent_6_done`, { agentOutputs });
      console.log(`${tag} Agent 6 done (${a6Result.durationMs}ms)`);

      if (!currentPrescription?.prescription) {
        console.error(`${tag} Agent 6 produced no prescription — aborting loop`);
        break;
      }

      const rx = currentPrescription.prescription;
      const patientSummaryShort = `${patientName}, ${profile?.age ?? "?"}yo ${(profile?.gender as string) ?? "?"}, conditions: ${((profile?.knownConditions as string[]) ?? []).join(", ") || "none"}`;
      const allergyList = (profile?.allergies as string[]) ?? [];

      // ── Agent 7: Drug Medic (verify only — no replacements) ───────────────
      await updateStep(appointmentId, `${stepPrefix}agent_7_running`);
      console.log(`${tag} Running Agent 7 (Drug Medic — verify only)...`);

      const a7Input: Agent7Input = {
        prescription: rx,
        diagnosis: rx.diagnosis,
        patientMeds: (profile?.currentMedications as string[]) ?? [],
        patientConditions: (profile?.knownConditions as string[]) ?? [],
        patientAge: profile?.age ?? 0,
        patientWeight: profile?.weight ?? 0,
        patientGender: (profile?.gender as string) ?? "",
        patientSummaryShort,
        allergyList,
      };

      const a7Result = await runDrugMedicAgent(a7Input);
      a7Output = a7Result.output as Agent7Output | null;
      agentOutputs.agent7 = a7Output;
      await updateStep(appointmentId, `${stepPrefix}agent_7_done`, { agentOutputs });
      console.log(`${tag} Agent 7 done: ${a7Output?.status} (${a7Result.durationMs}ms)`);

      // ── Agent 8: Allergy Check (verify only — same prescription, no revised) ──
      await updateStep(appointmentId, `${stepPrefix}agent_8_running`);
      console.log(`${tag} Running Agent 8 (Allergy Check — verify only)...`);

      const a8Input: Agent8Input = {
        prescription: rx,
        diagnosis: rx.diagnosis,
        allergyBlocks: a5Output?.expanded ?? [],
        crossReactivityFlags: a5Output?.crossReactivityFlags ?? [],
        patientSummaryShort,
        allergyList,
      };

      const a8Result = await runAllergyAgent(a8Input);
      a8Output = a8Result.output as Agent8Output | null;
      agentOutputs.agent8 = a8Output;
      await updateStep(appointmentId, `${stepPrefix}agent_8_done`, { agentOutputs });
      console.log(`${tag} Agent 8 done: ${a8Output?.status} (${a8Result.durationMs}ms)`);

      // If both passed clean, stop looping
      if (a7Output?.status === "PASS" && a8Output?.status === "PASS") {
        console.log(`${tag} ✅ Agents 7+8 PASS — pipeline complete`);
        break;
      }

      // Collect ALL flags from BOTH agents for the next loop
      allFlagged.length = 0;
      for (const v of (a7Output?.perMedicine ?? [])) {
        if (v.verdict === "FLAG" && v.flagReason) {
          allFlagged.push({ drug: v.drug, reason: v.flagReason, flaggedBy: "agent7" });
        }
      }
      for (const c of (a8Output?.checks ?? [])) {
        if (c.verdict !== "PASS" && c.violates) {
          allFlagged.push({ drug: c.drug, reason: `Allergy violation: ${c.violates}`, flaggedBy: "agent8" });
        }
      }

      if (loop < MAX_LOOPS - 1) {
        console.log(`${tag} ⚠ ${allFlagged.length} flag(s) from Agent 7+8 — looping back to Agent 6 with ALL flags`);
      } else {
        console.log(`${tag} ⚠ Max loops reached — ${allFlagged.length} unresolved flag(s), escalating to doctor`);
      }
    }

    // ── Save final state ─────────────────────────────────────────────────────
    const rawFinalRx = currentPrescription?.prescription ?? null;

    // Convert advice array → string for MongoDB (schema expects String)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalRx = rawFinalRx ? { ...rawFinalRx } as any : null;
    if (finalRx && Array.isArray(finalRx.advice)) {
      finalRx.advice = finalRx.advice.join("\n");
    }

    await Appointment.findByIdAndUpdate(appointmentId, {
      agentOutputs,
      agentPipelineStep: "pipeline_done",
      aiPrescription: finalRx,
      prescriptionStep: "done",
      flaggedDrugs: allFlagged,
      similarCases: a3Output?.topCases?.slice(0, 5) ?? [],
      aiHistorySummary: currentPrescription?.prescription?.historySummary ?? "",
    });

    console.log(`${tag} ✅ Pipeline complete in ${Date.now() - t0}ms. Flagged: ${allFlagged.length}`);
  } catch (err) {
    console.error(`${tag} Pipeline FAILED:`, err);
    await updateStep(appointmentId, "pipeline_failed").catch(() => {});
  }
}
