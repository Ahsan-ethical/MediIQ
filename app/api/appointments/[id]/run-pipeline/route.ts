import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";
import { runPostCallPipeline } from "@/lib/agents/pipeline";

// Allow the multi-agent LLM pipeline (Agent 2 → 6 → 7 → 8 → 9) to run to completion.
// Vercel Pro honours up to 300s; Hobby caps at 60s (enough for Gemini, tight for DeepSeek).
export const maxDuration = 300;

/**
 * POST — Runs the REAL post-call pipeline (non-demo) and AWAITS it, so it survives
 * on serverless (unlike end-call's setImmediate, which is killed when the response
 * returns on Vercel). The doctor's post-call page calls this once after the call ends.
 *
 * An atomic claim (call_ended → agent_2_running) guarantees the pipeline runs exactly
 * once even though the page polls repeatedly.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const { id } = await params;

    const appt = await Appointment.findById(id).select("doctorRef status agentPipelineStep transcript").lean() as
      | { doctorRef: { toString(): string }; status?: string; agentPipelineStep?: string; transcript?: string }
      | null;
    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (appt.doctorRef.toString() !== user.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // The call must have ended before we run the post-call pipeline.
    if (appt.status !== "post_call") {
      return NextResponse.json({ ok: true, notEnded: true, step: appt.agentPipelineStep ?? "idle" });
    }

    // Kick off when the pipeline is at ANY pre-Agent-2 state — the pre-call step
    // ("agents_345_done"/"processing"/…) can linger or overwrite "call_ended" if the
    // pre-warm finished late. If it's already in the post-call sequence, don't restart.
    const PRE_AGENT2 = ["idle", "agent_1_done", "agents_345_running", "agents_345_processing", "agents_345_done", "agents_345_failed", "call_ended"];
    if (!PRE_AGENT2.includes(appt.agentPipelineStep ?? "idle")) {
      return NextResponse.json({ ok: true, alreadyRunning: true, step: appt.agentPipelineStep });
    }

    // Atomic claim to avoid duplicate runs from concurrent polls.
    const claimed = await Appointment.findOneAndUpdate(
      { _id: id, agentPipelineStep: { $in: PRE_AGENT2 } },
      { $set: { agentPipelineStep: "agent_2_running" } },
    ).select("_id").lean();
    if (!claimed) {
      return NextResponse.json({ ok: true, alreadyRunning: true });
    }

    // Run the real 9-agent pipeline (awaited — it updates agentPipelineStep as it goes,
    // which the doctor page reads on each poll to render progress).
    await runPostCallPipeline(id, appt.transcript ?? "");

    const done = await Appointment.findById(id).select("agentPipelineStep").lean() as { agentPipelineStep?: string } | null;
    return NextResponse.json({ ok: true, step: done?.agentPipelineStep ?? "pipeline_done" });
  } catch (err) {
    console.error("[run-pipeline]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
