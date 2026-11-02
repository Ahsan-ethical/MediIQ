import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAgentFn, PIPELINE_ORDER } from "@/lib/agents";
import { getAgentMeta } from "@/lib/agents/registry";
import { getMockInputForAgent } from "@/lib/agents/mockData";
import { connectDB } from "@/lib/mongodb";
import User from "@/lib/models/User";
import PatientProfile from "@/lib/models/PatientProfile";
import Appointment from "@/lib/models/Appointment";

const DEV_PATIENT_EMAIL = "devpatient@mediiq.dev";

async function getDevPatientUserId(): Promise<string | null> {
  await connectDB();
  const user = await User.findOne({ email: DEV_PATIENT_EMAIL }).select("_id").lean();
  return user ? (user._id as { toString(): string }).toString() : null;
}

async function getDevPatientAgent5Input(): Promise<Record<string, unknown> | null> {
  await connectDB();
  const user = await User.findOne({ email: DEV_PATIENT_EMAIL }).select("_id").lean();
  if (!user) return null;
  const profile = await PatientProfile.findOne({ userRef: user._id }).lean();
  const allergies = (profile?.allergies as string[]) ?? [];

  // DevPatient has "Penicillin" confirmed-severe + suspected "Sulfonamides" from consultation 3
  return {
    knownAllergies: allergies.map((a: string) => ({
      allergen: a,
      severity: "severe" as const,
      status: "confirmed" as const,
      source: "patient_record" as const,
    })),
    consultationMentions: [],
    suspectedFromFeedback: [
      {
        allergen: "Sulfonamides",
        severity: "mild" as const,
        status: "suspected" as const,
        source: "feedback_suspected" as const,
      },
    ],
  };
}

async function getDevPatientAgent4Input(): Promise<Record<string, unknown> | null> {
  await connectDB();
  const user = await User.findOne({ email: DEV_PATIENT_EMAIL }).select("_id").lean();
  if (!user) return null;
  const profile = await PatientProfile.findOne({ userRef: user._id }).lean();
  const latestAppt = await Appointment.findOne({ patientRef: user._id, status: "completed" })
    .sort({ createdAt: -1 }).select("preConsultation").lean();
  const pc = latestAppt?.preConsultation as Record<string, unknown> | undefined;
  const symptoms = pc?.symptoms ? String(pc.symptoms).split(",").map((s: string) => s.trim()).filter(Boolean) : ["Fever", "Cough"];
  return {
    patientId: (user._id as { toString(): string }).toString(),
    knownConditions: profile?.knownConditions ?? [],
    bookingSymptoms: symptoms,
  };
}

async function getDevPatientAgent3Input(): Promise<Record<string, unknown> | null> {
  await connectDB();
  const user = await User.findOne({ email: DEV_PATIENT_EMAIL }).select("_id").lean();
  if (!user) return null;
  const profile = await PatientProfile.findOne({ userRef: user._id }).lean();
  const latestAppt = await Appointment.findOne({ patientRef: user._id, status: "completed" })
    .sort({ createdAt: -1 }).select("preConsultation").lean();
  const pc = latestAppt?.preConsultation as Record<string, unknown> | undefined;
  return {
    symptoms: pc?.symptoms ?? "Fever, cough, body ache",
    duration: pc?.duration,
    severity: pc?.severity,
    additionalNotes: pc?.additionalNotes,
    patientAge: profile?.age,
    patientConditions: profile?.knownConditions ?? [],
  };
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { agentId, input, useMockInput, runFullPipeline } = body as {
      agentId?: number;
      input?: unknown;
      useMockInput?: boolean;
      runFullPipeline?: boolean;
    };

    if (runFullPipeline) {
      const results = [];
      const outputs: Record<number, unknown> = {};

      const devPatientId = await getDevPatientUserId();

      for (const id of PIPELINE_ORDER) {
        const fn = getAgentFn(id);
        if (!fn) continue;

        let agentInput: unknown;
        if (id === 1 && devPatientId) {
          agentInput = { patientUserId: devPatientId };
        } else {
          agentInput = outputs[id] ?? getMockInputForAgent(id);
        }

        const result = await fn(agentInput);
        results.push(result);
        outputs[id] = result.output;

        const meta = getAgentMeta(id);
        if (meta) {
          for (const targetId of meta.feedsInto) {
            if (!outputs[targetId]) {
              outputs[targetId] = {};
            }
          }
        }
      }

      return NextResponse.json({ ok: true, results });
    }

    if (!agentId || agentId < 1 || agentId > 9) {
      return NextResponse.json({ error: "Invalid agentId (1-9)" }, { status: 400 });
    }

    const fn = getAgentFn(agentId);
    if (!fn) {
      return NextResponse.json({ error: `Agent ${agentId} not found` }, { status: 404 });
    }

    let agentInput: unknown;
    if (useMockInput && agentId === 1) {
      const devPatientId = await getDevPatientUserId();
      if (!devPatientId) {
        return NextResponse.json(
          { error: "DevPatient not found — run: npx tsx scripts/seed-dev-patient.ts" },
          { status: 404 },
        );
      }
      agentInput = { patientUserId: devPatientId };
    } else if (useMockInput && agentId === 3) {
      const a3Input = await getDevPatientAgent3Input();
      if (!a3Input) {
        return NextResponse.json(
          { error: "DevPatient not found — run: npx tsx scripts/seed-dev-patient.ts" },
          { status: 404 },
        );
      }
      agentInput = a3Input;
    } else if (useMockInput && agentId === 4) {
      const a4Input = await getDevPatientAgent4Input();
      if (!a4Input) {
        return NextResponse.json(
          { error: "DevPatient not found — run: npx tsx scripts/seed-dev-patient.ts" },
          { status: 404 },
        );
      }
      agentInput = a4Input;
    } else if (useMockInput && agentId === 5) {
      const a5Input = await getDevPatientAgent5Input();
      if (!a5Input) {
        return NextResponse.json(
          { error: "DevPatient not found — run: npx tsx scripts/seed-dev-patient.ts" },
          { status: 404 },
        );
      }
      agentInput = a5Input;
    } else if (useMockInput && agentId === 9) {
      const devPatientId = await getDevPatientUserId();
      if (!devPatientId) {
        return NextResponse.json(
          { error: "DevPatient not found — run: npx tsx scripts/seed-dev-patient.ts" },
          { status: 404 },
        );
      }
      const profile = await PatientProfile.findOne({ userRef: devPatientId }).lean();
      agentInput = {
        patientUserId: devPatientId,
        existingAllergies: profile?.allergies ?? [],
        existingMedications: profile?.currentMedications ?? [],
        prescription: getMockInputForAgent(6) && (await import("@/lib/agents/mockData")).MOCK_PRESCRIPTION,
        transcript: (await import("@/lib/agents/mockData")).MOCK_TRANSCRIPT_RESULT,
      };
    } else if (useMockInput) {
      agentInput = getMockInputForAgent(agentId);
    } else {
      agentInput = input;
    }

    const result = await fn(agentInput);

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("run-agent error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
