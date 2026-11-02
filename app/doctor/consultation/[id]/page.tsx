"use client";

import { useCallback, useEffect, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Loader2 } from "lucide-react";
import { useSocket } from "@/hooks/useSocket";
import { useAgora } from "@/hooks/useAgora";
import { PatientReportPanel } from "@/components/consultation/PatientReportPanel";
import type { CallAppointment } from "@/types/consultation";

interface Props { params: Promise<{ id: string }> }

export default function DoctorConsultationPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const socketRef = useSocket();

  const localVideoRef = useRef<HTMLDivElement>(null);
  const remoteVideoRef = useRef<HTMLDivElement>(null);
  const endingRef = useRef(false);

  const [appt, setAppt] = useState<CallAppointment | null>(null);

  const { joined, remoteUsers, micOn, camOn, toggleMic, toggleCam, leave } = useAgora({ appointmentId: id, role: "doctor", localVideoRef });

  useEffect(() => {
    fetch(`/api/appointments/${id}`).then((r) => r.json()).then((d) => { if (d.appointment) setAppt(d.appointment); }).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!joined) return;
    fetch(`/api/appointments/${id}/start-call`, { method: "POST" }).catch(() => {});
    socketRef.current?.emit("call:doctor-ready", { appointmentId: id });
  }, [joined, id, socketRef]);

  const playedRemoteRef = useRef<number | null>(null);
  useEffect(() => {
    const user = remoteUsers.find((u) => u.videoTrack);
    if (user?.videoTrack && remoteVideoRef.current) {
      if (playedRemoteRef.current === user.uid && user.videoTrack.isPlaying) return;
      remoteVideoRef.current.innerHTML = "";
      user.videoTrack.play(remoteVideoRef.current);
      playedRemoteRef.current = user.uid as number;
    }
  }, [remoteUsers]);

  const goToPostCall = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    const transcript = await leave();
    await fetch(`/api/appointments/${id}/end-call`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript }) }).catch(() => {});
    router.replace(`/doctor/post-call/${id}`);
  }, [id, leave, router]);

  useEffect(() => {
    if (endingRef.current) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/appointments/${id}`);
        const data = await res.json();
        if (data.appointment?.status === "post_call") goToPostCall();
      } catch {}
    };
    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const handler = () => goToPostCall();
    socket.on("call:ended", handler);
    return () => { socket.off("call:ended", handler); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socketRef]);

  const handleEndCall = useCallback(async () => {
    socketRef.current?.emit("call:end", { appointmentId: id });
    await goToPostCall();
  }, [id, socketRef, goToPostCall]);

  const peerConnected = remoteUsers.some((u) => u.videoTrack || u.audioTrack);

  if (!appt) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#0a0c11]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-[#0a0c11] text-white">
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Videos + controls */}
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2">
            {/* Patient */}
            <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-[#14161d]">
              <div ref={remoteVideoRef} className="absolute inset-0" />
              {!peerConnected && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
                  <p className="text-sm text-white/60">{joined ? "Waiting for patient…" : "Connecting…"}</p>
                </div>
              )}
              <span className="absolute bottom-3 left-3 rounded-lg bg-black/50 px-3 py-1 text-xs font-semibold backdrop-blur">{appt.patientName}</span>
              <span className={`absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${peerConnected ? "bg-success/20 text-emerald-300" : "bg-white/10 text-white/60"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${peerConnected ? "bg-emerald-400" : "bg-white/40"}`} /> {peerConnected ? "Connected" : "Connecting"}
              </span>
            </div>

            {/* Self */}
            <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-[#14161d]">
              <div ref={localVideoRef} className="absolute inset-0 [&_video]:h-full [&_video]:w-full [&_video]:scale-x-[-1] [&_video]:object-cover" />
              <span className="absolute bottom-3 left-3 z-10 rounded-lg bg-black/50 px-3 py-1 text-xs font-semibold backdrop-blur">You (Doctor)</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-center gap-4 py-2">
            <ControlButton onClick={toggleMic} active={micOn} label={micOn ? "Mute" : "Unmute"}>{micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}</ControlButton>
            <ControlButton onClick={toggleCam} active={camOn} label={camOn ? "Stop" : "Start"}>{camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}</ControlButton>
            <button onClick={handleEndCall} className="flex flex-col items-center gap-1.5">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-danger shadow-lg transition-transform hover:brightness-110 active:scale-95"><PhoneOff className="h-6 w-6 text-white" /></span>
              <span className="text-xs text-white/50">End call</span>
            </button>
          </div>
        </div>

        {/* Patient report panel */}
        <div className="w-full shrink-0 overflow-hidden border-t border-border bg-surface text-text lg:w-80 lg:border-l lg:border-t-0 xl:w-96">
          <PatientReportPanel appointmentId={id} appt={appt} />
        </div>
      </div>
    </div>
  );
}

function ControlButton({ children, onClick, active, label }: { children: React.ReactNode; onClick: () => void; active: boolean; label: string }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5">
      <span className={`flex h-12 w-12 items-center justify-center rounded-full shadow transition-colors ${active ? "bg-white/10 hover:bg-white/15" : "bg-danger/70 hover:bg-danger/80"}`}>{children}</span>
      <span className="text-xs text-white/50">{label}</span>
    </button>
  );
}
