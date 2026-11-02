import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";
import { isDemoMode } from "@/lib/models/Settings";
import { matchDemoScenario, SCENARIO_A, SCENARIO_B } from "@/lib/agents/demo-cache";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "patient") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;
    const appt = await Appointment.findOne({ _id: id, patientRef: user.userId });
    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (appt.preConsultationLocked) {
      return NextResponse.json({ ok: true, alreadyLocked: true });
    }

    // Lock immediately
    appt.preConsultationLocked = true;
    appt.agentPipelineStep = "agents_345_running";
    await appt.save();

    // Demo mode: return cached agent 3/4/5 instantly
    const demo = await isDemoMode();
    if (demo) {
      const symptoms = appt.preConsultation?.symptoms ?? "";
      const scenarioKey = matchDemoScenario(symptoms);
      if (scenarioKey) {
        const scenario = scenarioKey === "A" ? SCENARIO_A : SCENARIO_B;
        await Appointment.findByIdAndUpdate(id, {
          agentOutputs: {
            agent3: { topCases: scenario.agent3.topCases, overallSummary: scenario.agent3.overallSummary },
            agent4: scenario.agent4,
            agent5: scenario.agent5,
          },
          agentPipelineStep: "agents_345_done",
        });
        return NextResponse.json({ ok: true });
      }
    }

    // Real mode: the patient page triggers the pre-call agents (3/4/5) via
    // POST /api/appointments/[id]/run-precall, which AWAITS them so they survive on
    // serverless. (setImmediate here would be killed on Vercel the moment we respond.)
    // agentPipelineStep is already "agents_345_running" — run-precall claims it.
    return NextResponse.json({ ok: true, runPrecall: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
