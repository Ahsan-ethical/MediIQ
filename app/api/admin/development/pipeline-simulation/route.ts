import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/lib/models/User";
import PatientProfile from "@/lib/models/PatientProfile";
import Appointment from "@/lib/models/Appointment";
import SystemDetected from "@/lib/models/SystemDetected";
import { getAgentFn } from "@/lib/agents";
import mongoose from "mongoose";
import type {
  Agent6Input,
  Agent7Input,
  Agent8Input,
  Agent9Input,
  TranscriptResult,
  SimilarCase,
  Agent4EvidenceSummary,
  Agent6Output,
  Agent7Output,
  ExpandedAllergyBlock,
  Prescription,
} from "@/lib/agents/types";

const MOCK_PATIENT_EMAIL = "john@gmail.com";

async function getMockPatientUserId(): Promise<string | null> {
  const user = await User.findOne({ email: MOCK_PATIENT_EMAIL }).select("_id").lean();
  return user ? (user._id as { toString(): string }).toString() : null;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const patientUser = await User.findOne({ email: MOCK_PATIENT_EMAIL }).lean();
    if (!patientUser) {
      return NextResponse.json({ error: "Mock patient (john@gmail.com) not found in database" }, { status: 404 });
    }

    const patientUserId = (patientUser._id as mongoose.Types.ObjectId).toString();
    const profile = await PatientProfile.findOne({ userRef: patientUserId }).lean();
    const appointments = await Appointment.find({ patientRef: patientUserId })
      .sort({ createdAt: -1 })
      .limit(10)
      .select("status preConsultation prescription aiPrescription createdAt doctorName specialization")
      .lean();
    const systemDetected = await SystemDetected.find({ patientRef: patientUserId }).lean();

    return NextResponse.json({
      ok: true,
      patient: {
        user: { _id: patientUserId, name: patientUser.name, email: patientUser.email },
        profile,
        appointments,
        systemDetected,
      },
    });
  } catch (err) {
    console.error("pipeline-simulation GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await req.json();
    const { agentId, formData, previousOutputs } = body as {
      agentId: number;
      formData?: {
        symptoms: string;
        duration: string;
        severity: string;
        additionalNotes: string;
        currentMedications: string;
      };
      previousOutputs?: Record<string, unknown>;
    };

    const patientUserId = await getMockPatientUserId();
    if (!patientUserId) {
      return NextResponse.json({ error: "Mock patient not found" }, { status: 404 });
    }

    const profile = await PatientProfile.findOne({ userRef: patientUserId }).lean();
    const patientUser = await User.findOne({ _id: patientUserId }).select("name").lean();
    const patientName = (patientUser as { name: string } | null)?.name ?? "John";

    const fn = getAgentFn(agentId);
    if (!fn) {
      return NextResponse.json({ error: `Agent ${agentId} not found` }, { status: 404 });
    }

    let agentInput: unknown;

    switch (agentId) {
      case 1: {
        agentInput = { patientUserId };
        break;
      }

      case 3: {
        agentInput = {
          symptoms: formData?.symptoms ?? "Fever, cough",
          duration: formData?.duration,
          severity: formData?.severity,
          additionalNotes: formData?.additionalNotes,
          patientAge: profile?.age,
          patientConditions: (profile?.knownConditions as string[]) ?? [],
        };
        break;
      }

      case 4: {
        const symptoms = formData?.symptoms ?? "";
        agentInput = {
          patientId: patientUserId,
          knownConditions: (profile?.knownConditions as string[]) ?? [],
          bookingSymptoms: symptoms.split(",").map((s: string) => s.trim()).filter(Boolean),
        };
        break;
      }

      case 5: {
        agentInput = {
          patientRef: profile?._id?.toString(),
          knownAllergies: ((profile?.allergies as string[]) ?? []).map((a: string) => ({
            allergen: a,
            severity: "severe" as const,
            status: "confirmed" as const,
            source: "patient_record" as const,
          })),
          consultationMentions: [] as string[],
          suspectedFromFeedback: [] as unknown[],
        };
        break;
      }

      case 6: {
        const a1 = previousOutputs?.agent1 as Record<string, unknown> | undefined;
        const a3 = previousOutputs?.agent3 as { topCases?: SimilarCase[]; overallSummary?: string } | undefined;
        const a4 = previousOutputs?.agent4 as {
          conditions?: Array<{ inputName: string; conditionSummary: string }>;
          evidenceSummary?: Agent4EvidenceSummary;
        } | undefined;
        const a5 = previousOutputs?.agent5 as {
          expanded?: ExpandedAllergyBlock[];
          crossReactivityFlags?: string[];
          safeAlternativesSummary?: Record<string, string[]>;
        } | undefined;

        const syntheticTranscript: TranscriptResult = {
          structuredTranscript: [],
          chiefComplaint: formData?.symptoms ?? "",
          mentionedSymptoms: (formData?.symptoms ?? "").split(",").map((s: string) => s.trim()).filter(Boolean),
          mentionedMedications: [],
          mentionedAllergies: [],
          duration: formData?.duration ?? "",
          severity: formData?.severity ?? "moderate",
        };

        const agent6Input: Agent6Input = {
          patient: {
            patientId: profile?.userId as string ?? "",
            name: patientName,
            age: profile?.age ?? 0,
            gender: (profile?.gender as string) ?? "",
            weight: profile?.weight ?? 0,
            height: profile?.height ?? 0,
            bloodGroup: (profile?.bloodGroup as string) ?? "",
            knownConditions: (profile?.knownConditions as string[]) ?? [],
            allergies: (profile?.allergies as string[]) ?? [],
            currentMedications: (profile?.currentMedications as string[]) ?? [],
            profileSummary: (a1?.profileSummary as string) ?? (profile?.summary as string) ?? "",
            runningSummary: (a1?.runningSummary as string) ?? (profile?.runningSummary as string) ?? "",
            pastConsultations: (a1?.pastConsultations as Agent6Input["patient"]["pastConsultations"]) ?? [],
          },
          transcript: syntheticTranscript,
          similarCases: {
            topCases: a3?.topCases ?? [],
            overallSummary: a3?.overallSummary ?? "",
          },
          medicalContext: {
            conditionSummaries: (a4?.conditions ?? []).map((c) => ({
              name: c.inputName,
              summary: c.conditionSummary,
            })),
            evidenceSummary: a4?.evidenceSummary ?? {
              findings: [], possibleDiagnoses: [], differentials: [],
              redFlags: [], managementConsiderations: [], clinicalInsights: [],
            },
          },
          allergyContext: {
            expanded: a5?.expanded ?? [],
            crossReactivityFlags: a5?.crossReactivityFlags ?? [],
            safeAlternatives: a5?.safeAlternativesSummary ?? {},
          },
        };
        agentInput = agent6Input;
        break;
      }

      case 7: {
        const a6 = previousOutputs?.agent6 as Agent6Output | undefined;
        const rx = a6?.prescription;
        if (!rx) {
          return NextResponse.json({ error: "Agent 6 output required to run Agent 7" }, { status: 400 });
        }
        const patientSummaryShort = `${patientName}, ${profile?.age ?? "?"}yo ${(profile?.gender as string) ?? "?"}, conditions: ${((profile?.knownConditions as string[]) ?? []).join(", ") || "none"}`;
        const a7Input: Agent7Input = {
          prescription: rx,
          diagnosis: rx.diagnosis,
          patientMeds: (profile?.currentMedications as string[]) ?? [],
          patientConditions: (profile?.knownConditions as string[]) ?? [],
          patientAge: profile?.age ?? 0,
          patientWeight: profile?.weight ?? 0,
          patientGender: (profile?.gender as string) ?? "",
          patientSummaryShort,
          allergyList: (profile?.allergies as string[]) ?? [],
        };
        agentInput = a7Input;
        break;
      }

      case 8: {
        const a6Out = previousOutputs?.agent6 as Agent6Output | undefined;
        const a7Out = previousOutputs?.agent7 as Agent7Output | undefined;
        const a5Out = previousOutputs?.agent5 as {
          expanded?: ExpandedAllergyBlock[];
          crossReactivityFlags?: string[];
        } | undefined;
        const rx = a7Out?.revisedPrescription ?? a6Out?.prescription;
        if (!rx) {
          return NextResponse.json({ error: "Agent 6/7 output required to run Agent 8" }, { status: 400 });
        }
        const patientSummaryShort = `${patientName}, ${profile?.age ?? "?"}yo ${(profile?.gender as string) ?? "?"}, conditions: ${((profile?.knownConditions as string[]) ?? []).join(", ") || "none"}`;
        const a8Input = {
          prescription: rx,
          diagnosis: rx.diagnosis,
          allergyBlocks: a5Out?.expanded ?? [],
          crossReactivityFlags: a5Out?.crossReactivityFlags ?? [],
          patientSummaryShort,
          allergyList: (profile?.allergies as string[]) ?? [],
        };
        agentInput = a8Input;
        break;
      }

      case 9: {
        const a6Out = previousOutputs?.agent6 as Agent6Output | undefined;
        const a7Out = previousOutputs?.agent7 as Agent7Output | undefined;
        const a8Out = previousOutputs?.agent8 as { revisedPrescription?: Prescription } | undefined;
        const finalRx = a8Out?.revisedPrescription ?? a7Out?.revisedPrescription ?? a6Out?.prescription;
        if (!finalRx) {
          return NextResponse.json({ error: "Prescription output required to run Agent 9" }, { status: 400 });
        }
        const a9Input: Agent9Input = {
          patientUserId,
          existingAllergies: (profile?.allergies as string[]) ?? [],
          existingMedications: (profile?.currentMedications as string[]) ?? [],
          prescription: finalRx,
          transcript: {
            structuredTranscript: [],
            chiefComplaint: formData?.symptoms ?? "",
            mentionedSymptoms: (formData?.symptoms ?? "").split(",").map((s: string) => s.trim()).filter(Boolean),
            mentionedMedications: [],
            mentionedAllergies: [],
            duration: formData?.duration ?? "",
            severity: formData?.severity ?? "moderate",
          },
        };
        agentInput = a9Input;
        break;
      }

      default:
        return NextResponse.json({ error: `Agent ${agentId} not supported in simulation` }, { status: 400 });
    }

    const result = await fn(agentInput);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("pipeline-simulation POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
