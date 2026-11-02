"use client";

import { useCallback, useEffect, useRef, useState, use } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Loader2 } from "lucide-react";
import { useSocket } from "@/hooks/useSocket";
import { useAgora } from "@/hooks/useAgora";
import { PrescriptionView } from "@/components/consultation/PrescriptionView";

export default function PatientConsultationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const socketRef = useSocket();

  const localVideoRef = useRef<HTMLDivElement>(null);
  const remoteVideoRef = useRef<HTMLDivElement>(null);
  const [callEnded, setCallEnded] = useState(false);

  const { joined, remoteUsers, micOn, camOn, toggleMic, toggleCam, leave } = useAgora({ appointmentId: id, role: "patient", localVideoRef });

  useEffect(() => {
    const user = remoteUsers.find((u) => u.videoTrack);
    if (user?.videoTrack && remoteVideoRef.current) {
      remoteVideoRef.current.innerHTML = "";
      user.videoTrack.play(remoteVideoRef.current);
    }
  }, [remoteUsers]);

  useEffect(() => {
    if (callEnded) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/appointments/${id}`);
        const data = await res.json();
        const status = data.appointment?.status;
        if (status === "post_call" || status === "completed") { await leave(); setCallEnded(true); }
      } catch {}
    };
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [id, callEnded, leave]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const handler = async () => { await leave(); setCallEnded(true); };
    socket.on("call:ended", handler);
    return () => { socket.off("call:ended", handler); };
  }, [socketRef, leave]);

  const endCall = useCallback(async () => {
    socketRef.current?.emit("call:end", { appointmentId: id });
    await fetch(`/api/appointments/${id}/end-call`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: "" }) }).catch(() => {});
    await leave();
    setCallEnded(true);
  }, [id, socketRef, leave]);

  if (callEnded) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-bg">
        <div className="sticky top-16 z-10 border-b border-border bg-surface/80 px-6 py-4 backdrop-blur">
          <h1 className="font-bold text-text">Your prescription</h1>
        </div>
        <PrescriptionView appointmentId={id} />
      </div>
    );
  }

  const peerConnected = remoteUsers.some((u) => u.videoTrack || u.audioTrack);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-[#0a0c11] text-white">
      <div className="grid flex-1 grid-cols-1 gap-3 p-4 md:grid-cols-2">
        {/* Doctor */}
        <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-[#14161d]">
          <div ref={remoteVideoRef} className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
          {!peerConnected && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
              <p className="text-sm text-white/60">{joined ? "Waiting for doctor…" : "Connecting…"}</p>
            </div>
          )}
          <span className="absolute bottom-3 left-3 rounded-lg bg-black/50 px-3 py-1 text-xs font-semibold backdrop-blur">Doctor</span>
          <span className={`absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${peerConnected ? "bg-success/20 text-emerald-300" : "bg-white/10 text-white/60"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${peerConnected ? "bg-emerald-400" : "bg-white/40"}`} /> {peerConnected ? "Connected" : "Connecting"}
          </span>
        </div>

        {/* Self */}
        <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-[#14161d]">
          <div ref={localVideoRef} className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:scale-x-[-1] [&_video]:object-cover" />
          <span className="absolute bottom-3 left-3 rounded-lg bg-black/50 px-3 py-1 text-xs font-semibold backdrop-blur">You</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 px-4 pb-6">
        <Ctrl onClick={toggleMic} active={micOn} label={micOn ? "Mute" : "Unmute"}>{micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}</Ctrl>
        <Ctrl onClick={toggleCam} active={camOn} label={camOn ? "Stop" : "Start"}>{camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}</Ctrl>
        <button onClick={endCall} className="flex flex-col items-center gap-1.5">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-danger shadow-lg transition-transform hover:brightness-110 active:scale-95">
            <PhoneOff className="h-6 w-6 text-white" />
          </span>
          <span className="text-xs text-white/50">End</span>
        </button>
      </div>
    </div>
  );
}

function Ctrl({ children, onClick, active, label }: { children: React.ReactNode; onClick: () => void; active: boolean; label: string }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5">
      <span className={`flex h-12 w-12 items-center justify-center rounded-full shadow transition-colors ${active ? "bg-white/10 hover:bg-white/15" : "bg-danger/70"}`}>{children}</span>
      <span className="text-xs text-white/50">{label}</span>
    </button>
  );
}
