"use client";

import { useEffect, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Radio, Clock, ArrowLeft, XCircle } from "lucide-react";
import { useSocket } from "@/hooks/useSocket";
import Button from "@/components/ui/Button";

export default function WaitingRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const socketRef = useSocket();
  const [dots, setDots] = useState("...");
  const [cancelled, setCancelled] = useState(false);
  const enteredRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d.length >= 3 ? "." : d + ".")), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (enteredRef.current) return;
    enteredRef.current = true;
    fetch(`/api/appointments/${id}/enter-waiting-room`, { method: "POST" }).catch(() => {});
    socketRef.current?.emit("waiting-room:enter", { appointmentId: id });
  }, [id, socketRef]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const onDoctorReady = () => router.replace(`/patient/consultation/${id}`);
    const onCancelled = () => setCancelled(true);
    socket.on("call:doctor-ready", onDoctorReady);
    socket.on("appointment:cancelled", onCancelled);
    return () => {
      socket.off("call:doctor-ready", onDoctorReady);
      socket.off("appointment:cancelled", onCancelled);
    };
  }, [id, router, socketRef]);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/appointments/${id}`);
        const data = await res.json();
        const status = data.appointment?.status;
        if (status === "in_call" || status === "post_call" || status === "completed") router.replace(`/patient/consultation/${id}`);
        if (status === "cancelled" || status === "rejected") setCancelled(true);
      } catch { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [id, router]);

  if (cancelled) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center p-6">
        <div className="max-w-md space-y-5 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-danger/12">
            <XCircle className="h-10 w-10 text-danger" />
          </div>
          <div>
            <h1 className="mb-2 text-2xl font-bold tracking-tight text-text">Appointment cancelled</h1>
            <p className="text-sm leading-relaxed text-muted">Your doctor has cancelled this appointment.<br />You can book another consultation at any time.</p>
          </div>
          <Button onClick={() => router.replace("/patient/dashboard")}>Back to dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center p-6">
      <div className="max-w-md space-y-6 text-center">
        <div className="relative mx-auto h-24 w-24">
          <motion.span className="absolute inset-0 rounded-full bg-brand-500/20" animate={{ scale: [1, 1.9], opacity: [0.5, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }} />
          <motion.span className="absolute inset-0 rounded-full bg-accent-500/20" animate={{ scale: [1, 1.9], opacity: [0.4, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 0.4 }} />
          <span className="relative flex h-full w-full items-center justify-center rounded-full bg-brand-gradient shadow-brand">
            <Radio className="h-10 w-10 text-white" />
          </span>
        </div>

        <div>
          <h1 className="mb-2 text-2xl font-bold tracking-tight text-text">Waiting for doctor{dots}</h1>
          <p className="text-sm leading-relaxed text-muted">Your doctor has been notified and can connect at any time.<br />Please stay on this page with your camera and microphone ready.</p>
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-surface p-5 text-left shadow-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">While you wait</p>
          <ul className="space-y-2 text-sm text-muted">
            <li className="flex items-center gap-2"><Clock className="h-4 w-4 shrink-0 text-brand-500" /> Sit in a quiet, well-lit place</li>
            <li className="flex items-center gap-2"><Radio className="h-4 w-4 shrink-0 text-brand-500" /> Check your camera and microphone work</li>
          </ul>
        </div>

        <button
          onClick={() => { socketRef.current?.emit("waiting-room:exit", { appointmentId: id }); router.back(); }}
          className="mx-auto flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" /> Go back
        </button>
      </div>
    </div>
  );
}
