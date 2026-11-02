"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Radio, User, X, Clock } from "lucide-react";
import toast from "react-hot-toast";
import { useSocket } from "@/hooks/useSocket";
import Button from "@/components/ui/Button";

interface ActiveAppt {
  _id:                string;
  patientName:        string;
  status:             string;
  waitingRoomAt?:     string;
  callStartedAt?:     string;  // set when call begins
  prescriptionSentAt?: string; // set when Rx sent → post_call row auto-clears
}

export default function DoctorConsultationNotification() {
  const router      = useRouter();
  const socketRef   = useSocket();
  const [appts, setAppts]           = useState<ActiveAppt[]>([]);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      // Include confirmed so we catch patients who enter the waiting room before the 10-min timer
      const res  = await fetch("/api/appointments?role=doctor&status=confirmed,active,in_call,post_call");
      const data = await res.json();
      setAppts(data.appointments ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Subscribe to waiting-room socket events for all tracked appointments
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || appts.length === 0) return;
    appts.forEach(a => socket.emit("doctor:watch", { appointmentId: a._id }));

    const onWaiting = ({ appointmentId }: { appointmentId: string }) => {
      setAppts(prev =>
        prev.map(a => a._id === appointmentId ? { ...a, waitingRoomAt: new Date().toISOString() } : a)
      );
    };
    socket.on("patient:waiting", onWaiting);
    return () => { socket.off("patient:waiting", onWaiting); };
  }, [appts, socketRef]);

  const handleCancel = useCallback(async (apptId: string, patientName: string) => {
    if (!confirm(`Cancel the appointment with ${patientName}? This cannot be undone.`)) return;
    setCancelling(apptId);
    try {
      const res = await fetch(`/api/appointments/${apptId}/cancel`, { method: "POST" });
      if (!res.ok) { toast.error("Could not cancel"); return; }
      socketRef.current?.emit("appointment:cancel", { appointmentId: apptId });
      toast.success("Appointment cancelled");
      setAppts(prev => prev.filter(a => a._id !== apptId));
    } catch {
      toast.error("Network error");
    } finally {
      setCancelling(null);
    }
  }, [socketRef]);

  // Categorise — exclude any appointment where call already started (callStartedAt set)
  // so the green "patient waiting" banner doesn't linger after the call ends
  const patientWaiting = appts.filter(a =>
    ["confirmed", "active"].includes(a.status) && !!a.waitingRoomAt && !a.callStartedAt
  );
  const waitingNoPatient = appts.filter(a =>
    ["confirmed", "active"].includes(a.status) && !a.waitingRoomAt && !a.callStartedAt
  );
  const inCall   = appts.filter(a => a.status === "in_call");
  // Only show post_call until prescription is sent
  const postCall = appts.filter(a => a.status === "post_call" && !a.prescriptionSentAt);

  if (appts.length === 0) return null;

  return (
    <div className="space-y-3 mb-2">

      {/* ── Patient in waiting room — Connect NOW + Cancel ── */}
      {patientWaiting.map(a => (
        <div key={a._id}
          className="bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-5 flex items-center justify-between gap-3 animate-fade-in"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-emerald-800 text-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block shrink-0" />
                {a.patientName} is in the waiting room
              </p>
              <p className="text-emerald-600 text-xs">Ready now — join anytime</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" onClick={() => router.push(`/doctor/consultation/${a._id}`)}>
              Connect
            </Button>
            <button
              onClick={() => handleCancel(a._id, a.patientName)}
              disabled={cancelling === a._id}
              title="Cancel appointment"
              className="flex items-center gap-1 text-xs text-white bg-red-600 hover:bg-red-700 rounded-lg px-3 py-1.5 font-semibold transition-colors disabled:opacity-50 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
              {cancelling === a._id ? "..." : "Cancel"}
            </button>
          </div>
        </div>
      ))}

      {/* ── Confirmed / active but patient not in waiting room yet — Cancel always visible ── */}
      {waitingNoPatient.map(a => (
        <div key={a._id}
          className="bg-surface border border-brand-500/20 rounded-2xl p-4 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-brand-500" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-text text-sm truncate">{a.patientName}</p>
              <p className="text-subtle text-xs">Waiting for patient to join room</p>
            </div>
          </div>
          <button
            onClick={() => handleCancel(a._id, a.patientName)}
            disabled={cancelling === a._id}
            title="Cancel appointment"
            className="flex items-center gap-1 text-xs text-white bg-red-600 hover:bg-red-700 rounded-lg px-3 py-1.5 font-semibold transition-colors disabled:opacity-50 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
            {cancelling === a._id ? "..." : "Cancel"}
          </button>
        </div>
      ))}

      {/* ── Active call ── */}
      {inCall.map(a => (
        <div key={a._id}
          className="bg-brand-500/10 border border-brand-500/25 rounded-2xl p-5 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <Radio className="w-5 h-5 text-brand-600 dark:text-brand-300 animate-pulse shrink-0" />
            <div>
              <p className="font-bold text-brand-700 dark:text-brand-300 text-sm">Call with {a.patientName}</p>
              <p className="text-brand-600 dark:text-brand-300 text-xs">In progress</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push(`/doctor/consultation/${a._id}`)}>
            Rejoin
          </Button>
        </div>
      ))}

      {/* ── Post call — write prescription ── */}
      {postCall.map(a => (
        <div key={a._id}
          className="bg-violet-50 border border-violet-200 rounded-2xl p-5 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="font-bold text-violet-800 text-sm">{a.patientName} — Write Prescription</p>
              <p className="text-violet-600 text-xs">Call ended · Patient waiting</p>
            </div>
          </div>
          <Button size="sm" onClick={() => router.push(`/doctor/post-call/${a._id}`)}>
            Write Rx
          </Button>
        </div>
      ))}
    </div>
  );
}
