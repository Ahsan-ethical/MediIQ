"use client";

import { useCallback, useEffect, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, PhoneOff, Loader2, Brain, CheckCircle2, Database, Search } from "lucide-react";
import Vapi from "@vapi-ai/web";
import AiDoctorAvatar from "@/components/AiDoctorAvatar";

interface ConsultationData {
  _id: string; patientName: string; status: string;
  preConsultation?: { symptoms: string; duration: string; severity: string; currentMedications: string; additionalNotes: string };
  aiQuestions: string[];
}
interface ProfileData {
  age?: number; gender?: string; weight?: number; height?: number;
  bloodGroup?: string; knownConditions?: string[]; allergies?: string[]; currentMedications?: string[];
}
type CallState = "idle" | "connecting" | "active" | "ending";

export default function AiConsultationRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const vapiRef = useRef<Vapi | null>(null);
  const transcriptRef = useRef<string>("");

  const [consultation, setConsultation] = useState<ConsultationData | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [callState, setCallState] = useState<CallState>("idle");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [transcriptLines, setTranscriptLines] = useState<Array<{ role: string; text: string }>>([]);
  const [interimText, setInterimText] = useState<{ role: string; text: string } | null>(null);
  const [prefetchStep, setPrefetchStep] = useState<string | null>(null);

  useEffect(() => {
    if (callState !== "active") return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/ai-consultation/${id}`);
        const data = await res.json();
        const step = data.consultation?.prefetchStep;
        if (step) setPrefetchStep(step);
        if (step === "ready") clearInterval(poll);
      } catch { /* keep polling */ }
    }, 2000);
    return () => clearInterval(poll);
  }, [callState, id]);

  useEffect(() => {
    fetch(`/api/ai-consultation/${id}`).then((r) => r.json()).then((d) => { setConsultation(d.consultation); setProfile(d.profile); });
  }, [id]);

  const endCall = useCallback(async () => {
    if (callState === "ending") return;
    setCallState("ending");
    vapiRef.current?.stop();
    await fetch(`/api/ai-consultation/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "generating_report", transcript: transcriptRef.current }) }).catch(() => {});
    router.replace(`/patient/ai-consultation/${id}/waiting`);
  }, [id, router, callState]);

  const startCall = useCallback(async () => {
    if (!consultation || callState !== "idle") return;
    setCallState("connecting");
    const pc = consultation.preConsultation;
    const qs = consultation.aiQuestions;
    const vapi = new Vapi(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY!);
    vapiRef.current = vapi;

    vapi.on("call-start", () => {
      setCallState("active");
      fetch(`/api/ai-consultation/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "in_consultation" }) }).catch(() => {});
    });
    vapi.on("call-end", () => { endCall(); });
    vapi.on("speech-start", () => setIsSpeaking(true));
    vapi.on("speech-end", () => setIsSpeaking(false));
    vapi.on("message", (msg: { type: string; role?: string; transcript?: string; transcriptType?: string }) => {
      if (msg.type !== "transcript" || !msg.transcript) return;
      const label = msg.role === "assistant" ? "Doctor" : "Patient";
      if (msg.transcriptType === "final") {
        setTranscriptLines((prev) => [...prev, { role: label, text: msg.transcript! }]);
        setInterimText(null);
        transcriptRef.current += `${label}: ${msg.transcript}\n`;
      } else if (msg.transcriptType === "partial") {
        setInterimText({ role: label, text: msg.transcript });
      }
    });
    vapi.on("error", (e: unknown) => { console.error("[VAPI]", e); setCallState("idle"); });

    await vapi.start(process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID!, {
      variableValues: {
        patientName: consultation.patientName, age: String(profile?.age ?? "unknown"), gender: profile?.gender ?? "unknown",
        weight: String(profile?.weight ?? "unknown"), height: String(profile?.height ?? "unknown"), bloodGroup: profile?.bloodGroup ?? "unknown",
        knownConditions: profile?.knownConditions?.join(", ") || "none", allergies: profile?.allergies?.join(", ") || "none",
        currentMedications: profile?.currentMedications?.join(", ") || "none", symptoms: pc?.symptoms ?? "", duration: pc?.duration ?? "",
        severity: pc?.severity ?? "", formMedications: pc?.currentMedications || "none", additionalNotes: pc?.additionalNotes || "none",
        question1: qs[0] ?? "", question2: qs[1] ?? "", question3: qs[2] ?? "", question4: qs[3] ?? "", question5: qs[4] ?? "",
      },
    });
  }, [consultation, profile, callState, id, endCall]);

  const toggleMute = useCallback(() => {
    if (!vapiRef.current) return;
    const next = !isMuted;
    vapiRef.current.setMuted(next);
    setIsMuted(next);
  }, [isMuted]);

  if (!consultation) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#0a0c11]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
      </div>
    );
  }

  const lastLine = transcriptLines[transcriptLines.length - 1];

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-8 bg-[#0a0c11] p-6 text-white">
      {callState === "active" && (
        <div className="absolute inset-x-0 top-0 z-20 border-b border-white/10 bg-[#0a0c11]/95 px-6 py-2.5 backdrop-blur-sm">
          <PrefetchBar prefetchStep={prefetchStep} />
        </div>
      )}

      <div className="text-center">
        <div className="mb-1 flex items-center justify-center gap-2">
          <Brain className="h-5 w-5 text-brand-400" />
          <span className="text-sm font-semibold text-brand-400">AI consultation</span>
        </div>
        <p className="text-xs text-white/50">Your conversation is private and secure</p>
      </div>

      <div className="flex w-full max-w-2xl gap-4 sm:gap-6">
        {/* Doctor */}
        <div className={`relative aspect-square flex-1 overflow-hidden rounded-3xl transition-all duration-300 ${callState === "active" && isSpeaking ? "shadow-2xl shadow-brand-500/30 ring-4 ring-brand-500" : "ring-2 ring-white/10"}`}>
          <AiDoctorAvatar className="absolute inset-0 h-full w-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          {callState === "active" && isSpeaking && (
            <div className="absolute right-3 top-3 flex items-end gap-1">
              {[0, 1, 2].map((i) => <div key={i} className="w-1.5 animate-pulse rounded-full bg-brand-400" style={{ height: `${12 + i * 6}px`, animationDelay: `${i * 150}ms` }} />)}
            </div>
          )}
          <div className="absolute bottom-3 left-3 rounded-lg bg-black/50 px-3 py-1 backdrop-blur-sm">
            <p className="text-xs font-semibold">Dr. MediIQ AI</p>
            <p className="text-xs text-brand-300">AI Doctor</p>
          </div>
        </div>

        {/* Patient */}
        <div className={`relative flex aspect-square flex-1 items-center justify-center overflow-hidden rounded-3xl bg-[#14161d] transition-all duration-300 ${callState === "active" && !isSpeaking && transcriptLines.some((l) => l.role === "Patient") ? "shadow-2xl shadow-success/20 ring-4 ring-success" : "ring-2 ring-white/10"}`}>
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 text-4xl font-bold text-white">
            {consultation.patientName.charAt(0).toUpperCase()}
          </div>
          {isMuted && <div className="absolute right-3 top-3 rounded-full bg-danger p-1.5"><MicOff className="h-3 w-3" /></div>}
          <div className="absolute bottom-3 left-3 rounded-lg bg-black/50 px-3 py-1 backdrop-blur-sm">
            <p className="text-xs font-semibold">{consultation.patientName}</p>
            <p className="text-xs text-white/50">You</p>
          </div>
        </div>
      </div>

      {/* Subtitle */}
      <div className="flex h-12 w-full max-w-2xl items-center justify-center">
        {callState === "active" && (interimText || lastLine) && (() => {
          const display = interimText ?? lastLine!;
          return (
            <p className={`max-w-full truncate rounded-full bg-black/40 px-5 py-2 text-center text-sm text-white/80 backdrop-blur-sm ${interimText ? "opacity-80" : "opacity-100"}`}>
              <span className={`mr-1 font-semibold ${display.role === "Doctor" ? "text-brand-400" : "text-emerald-400"}`}>{display.role}:</span>
              {display.text}
              {interimText && <span className="ml-1 animate-pulse">▌</span>}
            </p>
          );
        })()}
        {callState === "connecting" && <p className="flex items-center gap-2 text-sm text-white/60"><Loader2 className="h-4 w-4 animate-spin" /> Connecting to Dr. MediIQ AI…</p>}
        {callState === "idle" && <p className="text-sm text-white/40">Click Start to begin your consultation</p>}
        {callState === "ending" && <p className="flex items-center gap-2 text-sm text-white/60"><Loader2 className="h-4 w-4 animate-spin" /> Ending call and generating your report…</p>}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        {callState === "idle" && (
          <button onClick={startCall} className="flex items-center gap-2 rounded-2xl bg-brand-gradient px-8 py-3.5 font-semibold text-white shadow-brand transition-transform hover:brightness-105 active:scale-95">
            <Brain className="h-5 w-5" /> Start consultation
          </button>
        )}
        {callState === "active" && (
          <>
            <button onClick={toggleMute} className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${isMuted ? "bg-danger hover:brightness-110" : "bg-white/10 hover:bg-white/15"}`}>
              {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            <button onClick={endCall} className="flex h-14 w-14 items-center justify-center rounded-full bg-danger shadow-lg transition-transform hover:brightness-110 active:scale-95">
              <PhoneOff className="h-6 w-6" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const PREFETCH_STEPS = [
  { key: "patient_history", label: "Loading your history", icon: Database },
  { key: "similar_cases", label: "Finding similar cases", icon: Search },
  { key: "ready", label: "AI data ready", icon: CheckCircle2 },
];

function PrefetchBar({ prefetchStep }: { prefetchStep: string | null }) {
  const currentIdx = prefetchStep ? PREFETCH_STEPS.findIndex((s) => s.key === prefetchStep) : -1;
  const done = prefetchStep === "ready";
  return (
    <div className="flex items-center justify-center gap-6">
      <span className="shrink-0 text-xs text-white/50">Preparing AI data</span>
      {PREFETCH_STEPS.map((step, i) => {
        const isDone = i < currentIdx || done;
        const isActive = i === currentIdx && !done;
        const Icon = step.icon;
        return (
          <div key={step.key} className="flex items-center gap-1.5">
            {isDone ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" /> : isActive ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-400" /> : <Icon className="h-3.5 w-3.5 shrink-0 text-white/30" />}
            <span className={`text-xs ${isDone ? "text-success" : isActive ? "text-brand-300" : "text-white/30"}`}>{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}
