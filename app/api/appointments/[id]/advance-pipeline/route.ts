import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";
import PatientProfile from "@/lib/models/PatientProfile";
import SystemDetected from "@/lib/models/SystemDetected";
import { isDemoMode } from "@/lib/models/Settings";
import { matchDemoScenario, SCENARIO_A, SCENARIO_B } from "@/lib/agents/demo-cache";

/**
 * POST — Advances the demo pipeline by ONE step per call.
 * The doctor page calls this every 2.5 seconds.
 * Each call = one visible step in the progress bar.
 * Returns the current state after advancing.
 */

// Step sequence for demo pipeline
const DEMO_STEP_SEQUENCE = [
  "agent_1_done",
  "agents_345_done",
  "call_ended",
  "agent_2_running",
  "agent_2_done",
  "agent_6_running",
  "agent_6_done",
  "agent_7_running",
  "agent_7_done",
  // Below are Scenario B only (complex)
  "loop_2_agent_6_running",
  "loop_2_agent_6_done",
  "loop_2_agent_7_running",
  "loop_2_agent_7_done",
  "agent_8_running",
  "agent_8_done",
  "pipeline_done",
];

const SIMPLE_STEPS = [
  "agent_1_done", "agents_345_done", "call_ended",
  "agent_2_running", "agent_2_done",
  "agent_6_running", "agent_6_done",
  "agent_7_running", "agent_7_done",
  "agent_8_running", "agent_8_done",
  "pipeline_done",
];

function adviceToString(advice: unknown): string {
  if (Array.isArray(advice)) return (advice as string[]).join("\n");
  return String(advice ?? "");
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const { id } = await params;
    const demo = await isDemoMode();
    if (!demo) return NextResponse.json({ error: "Not in demo mode" }, { status: 400 });

    const appt = await Appointment.findById(id);
    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const currentStep = (appt.agentPipelineStep as string) ?? "idle";
    if (currentStep === "pipeline_done" || currentStep === "pipeline_failed") {
      return NextResponse.json({
        pipelineStep: currentStep,
        aiPrescription: appt.aiPrescription,
        flaggedDrugs: appt.flaggedDrugs ?? [],
        agentOutputs: appt.agentOutputs ?? {},
        aiHistorySummary: (appt as unknown as Record<string, unknown>).aiHistorySummary ?? "",
      });
    }

    // Match scenario
    const symptoms = appt.preConsultation?.symptoms ?? "";
    const scenarioKey = matchDemoScenario(symptoms);
    if (!scenarioKey) {
      return NextResponse.json({ error: "Symptoms don't match demo scenario" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scenario = (scenarioKey === "A" ? SCENARIO_A : SCENARIO_B) as any;
    const isComplex = scenarioKey === "B";
    const steps = isComplex ? DEMO_STEP_SEQUENCE : SIMPLE_STEPS;

    // Find current position and advance to next step
    const curIdx = steps.indexOf(currentStep);
    const nextIdx = curIdx + 1;
    if (nextIdx >= steps.length) {
      return NextResponse.json({ pipelineStep: "pipeline_done" });
    }

    const nextStep = steps[nextIdx];
    const agentOutputs = (appt.agentOutputs as Record<string, unknown>) ?? {};
    const updates: Record<string, unknown> = { agentPipelineStep: nextStep };

    // Apply data for each step
    switch (nextStep) {
      case "agent_1_done": {
        const prof = await PatientProfile.findOne({ userRef: appt.patientRef }).lean();
        if (prof) {
          agentOutputs.agent1 = {
            profileSummary: (prof as unknown as Record<string, unknown>).summary ?? "",
            runningSummary: (prof as unknown as Record<string, unknown>).runningSummary ?? "",
          };
        }
        updates.agentOutputs = agentOutputs;
        break;
      }
      case "agents_345_done":
        if (!agentOutputs.agent3) agentOutputs.agent3 = { topCases: scenario.agent3.topCases, overallSummary: scenario.agent3.overallSummary };
        if (!agentOutputs.agent4) agentOutputs.agent4 = scenario.agent4;
        if (!agentOutputs.agent5) agentOutputs.agent5 = scenario.agent5;
        updates.agentOutputs = agentOutputs;
        break;
      case "agent_2_done":
        agentOutputs.agent2 = scenario.agent2;
        updates.agentOutputs = agentOutputs;
        break;
      case "agent_6_done": {
        const a6 = isComplex ? scenario.agent6_pass1 : scenario.agent6;
        agentOutputs.agent6 = a6;
        const rx = a6.prescription;
        updates.agentOutputs = agentOutputs;
        updates.aiPrescription = { ...rx, advice: adviceToString(rx.advice) };
        updates.prescriptionStep = "done";
        break;
      }
      case "agent_7_done": {
        const a7 = isComplex ? scenario.agent7_pass1 : scenario.agent7;
        agentOutputs.agent7 = a7;
        updates.agentOutputs = agentOutputs;
        if (isComplex) {
          updates.flaggedDrugs = [{
            drug: "Amoxicillin",
            reason: "CRITICAL: Amoxicillin is a Penicillin-class drug. Patient has confirmed SEVERE Penicillin allergy. Hard block.",
            suggestedAlternative: "Azithromycin 500mg",
            flaggedBy: "agent7",
          }];
        }
        break;
      }
      case "loop_2_agent_6_done": {
        agentOutputs.agent6 = scenario.agent6_pass2;
        const rx2 = scenario.agent6_pass2.prescription;
        updates.agentOutputs = agentOutputs;
        updates.aiPrescription = { ...rx2, advice: adviceToString(rx2.advice) };
        break;
      }
      case "loop_2_agent_7_done":
        agentOutputs.agent7 = scenario.agent7_pass2;
        updates.agentOutputs = agentOutputs;
        break;
      case "agent_8_done":
        agentOutputs.agent8 = scenario.agent8;
        updates.agentOutputs = agentOutputs;
        if (isComplex) {
          const existingFlags = (appt.flaggedDrugs ?? []) as Array<Record<string, unknown>>;
          updates.flaggedDrugs = [...existingFlags, {
            drug: "Cephalexin",
            reason: "Cephalexin is a 1st-gen Cephalosporin — cross-reactivity with Penicillin allergy. STRONG CAUTION.",
            suggestedAlternative: "Doxycycline 100mg",
            flaggedBy: "agent8",
          }];
        }
        break;
      case "pipeline_done": {
        const a8 = scenario.agent8;
        const a6Final = isComplex ? scenario.agent6_pass2 : scenario.agent6;
        const finalRx = a8.revisedPrescription ?? a6Final.prescription;
        updates.aiPrescription = { ...finalRx, advice: adviceToString(finalRx.advice) };
        updates.flaggedDrugs = scenario.flaggedDrugs;
        updates.similarCases = scenario.agent3.topCases.slice(0, 5);
        updates.aiHistorySummary = a6Final.prescription?.historySummary ?? "";

        // Agent 9 — write findings
        const a9 = scenario.agent9;
        if (a9.findings?.length) {
          for (const f of a9.findings as Array<{ type: string; value: string; severity?: string; allergyStatus?: string; reason: string; source: string }>) {
            const profile = await PatientProfile.findOne({ userRef: appt.patientRef }).lean();
            const allergies = ((profile?.allergies ?? []) as string[]).map(a => a.toLowerCase());
            const meds = ((profile?.currentMedications ?? []) as string[]).map(m => m.toLowerCase());
            const alreadyInProfile =
              (f.type === "allergy" && allergies.includes(f.value.toLowerCase())) ||
              (f.type === "lifelong_med" && meds.some(m => m.includes(f.value.toLowerCase().split(" ")[0])));
            if (!alreadyInProfile) {
              await SystemDetected.updateOne(
                { patientRef: appt.patientRef, type: f.type, value: f.value },
                { $set: { patientRef: appt.patientRef, type: f.type, value: f.value, severity: f.severity, allergyStatus: f.allergyStatus, reason: f.reason, source: f.source, status: "pending" } },
                { upsert: true },
              ).catch(() => {});
            }
          }
        }
        break;
      }
    }

    await Appointment.findByIdAndUpdate(id, updates);

    return NextResponse.json({
      pipelineStep: nextStep,
      aiPrescription: updates.aiPrescription ?? appt.aiPrescription ?? null,
      flaggedDrugs: updates.flaggedDrugs ?? appt.flaggedDrugs ?? [],
      agentOutputs: updates.agentOutputs ?? appt.agentOutputs ?? {},
      aiHistorySummary: (updates.aiHistorySummary as string) ?? "",
    });
  } catch (err) {
    console.error("[advance-pipeline]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
