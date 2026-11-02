"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Clock, CheckCircle2, Radio, AlertCircle, Stethoscope, PhoneCall, ClipboardList } from "lucide-react";
import Button from "@/components/ui/Button";

interface Appointment {
  _id: string;
  doctorName: string;
  specialization: string;
  status: string;
  bookedAt: string;
  consultationStartsAt: string;
  approvedAt?: string;
  preConsultation?: { filledAt: string };
  prescriptionSentAt?: string;
}

function useCountdown(targetMs: number) {
  const [remaining, setRemaining] = useState(() => Math.max(0, targetMs - Date.now()));
  useEffect(() => {
    const interval = setInterval(() => setRemaining(Math.max(0, targetMs - Date.now())), 1000);
    return () => clearInterval(interval);
  }, [targetMs]);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return { remaining, mins, secs, expired: remaining === 0 };
}

export default function ActiveAppointmentBanner() {
  const router = useRouter();
  const [appt, setAppt] = useState<Appointment | null>(null);
  const [checked, setChecked] = useState(false);

  const poll = useCallback(async () => {
    const res  = await fetch("/api/appointments/active");
    const data = await res.json();
    setAppt(data.appointment ?? null);
    setChecked(true);
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [poll]);

  // ALL hooks must be called unconditionally before any early return
  const patientDeadlineMs = appt
    ? new Date(appt.bookedAt).getTime() + 5 * 60 * 1000
    : Date.now();
  const consultMs = appt
    ? new Date(appt.consultationStartsAt).getTime()
    : Date.now();

  const patientTimer = useCountdown(patientDeadlineMs);
  const consultTimer = useCountdown(consultMs);

  if (!checked || !appt) return null;

  const { status } = appt;
  const isRejected  = status === "rejected" || status === "cancelled";
  const isConfirmed = status === "confirmed";
  const isActive    = status === "active";
  const isInCall    = status === "in_call";
  const isPostCall  = status === "post_call";
  const isCompleted = status === "completed";
  const preConsFilled = !!appt.preConsultation?.filledAt;

  if (isRejected) return null;

  return (
    <div className="animate-fade-in-up opacity-0" style={{ animationFillMode: "forwards" }}>

      {/* Live call — rejoin */}
      {isInCall && (
        <div className="bg-linear-to-r from-emerald-600 to-teal-600 rounded-2xl p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Radio className="w-6 h-6 animate-pulse" />
            <div>
              <p className="font-bold">Consultation is Live!</p>
              <p className="text-emerald-100 text-sm">Dr. {appt.doctorName} · {appt.specialization}</p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => router.push(`/patient/consultation/${appt._id}`)}>
            Rejoin
          </Button>
        </div>
      )}

      {/* Post call — doctor reviewing */}
      {isPostCall && (
        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
              <ClipboardList className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="font-bold text-violet-800 text-sm">Call ended — prescription coming</p>
              <p className="text-violet-600 text-xs">Dr. {appt.doctorName} is reviewing your case...</p>
            </div>
          </div>
          <Button size="sm" onClick={() => router.push(`/patient/consultation/${appt._id}`)}>
            View
          </Button>
        </div>
      )}

      {/* Completed — prescription ready */}
      {isCompleted && appt.prescriptionSentAt && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
            <div>
              <p className="font-bold text-emerald-800 text-sm">Prescription Ready</p>
              <p className="text-emerald-600 text-xs">Dr. {appt.doctorName}</p>
            </div>
          </div>
          <Button size="sm" onClick={() => router.push(`/patient/consultation/${appt._id}`)}>
            View Rx
          </Button>
        </div>
      )}

      {/* Pending / confirmed / active (pre-call state) */}
      {(isActive || isConfirmed || status === "pending_approval") && (
        <div className="bg-surface rounded-2xl border border-brand-500/20 shadow-sm p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-500/12 flex items-center justify-center shrink-0">
                <Stethoscope className="w-5 h-5 text-brand-600 dark:text-brand-300" />
              </div>
              <div>
                <p className="font-bold text-text text-sm">Dr. {appt.doctorName}</p>
                <p className="text-muted text-xs capitalize">{appt.specialization}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {!preConsFilled && !patientTimer.expired && (
                <div className="text-center bg-brand-500/10 rounded-xl px-4 py-2 border border-brand-500/20">
                  <p className="text-xs font-semibold text-brand-600 dark:text-brand-300 mb-0.5">Fill details in</p>
                  <p className="text-xl font-bold text-brand-700 dark:text-brand-300 tabular-nums">
                    {String(patientTimer.mins).padStart(2, "0")}:{String(patientTimer.secs).padStart(2, "0")}
                  </p>
                </div>
              )}
              {preConsFilled && (
                <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-semibold bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-100">
                  <CheckCircle2 className="w-4 h-4" />
                  Details filled
                </div>
              )}

              <div className={`text-center rounded-xl px-4 py-2 border ${
                (isConfirmed || isActive) ? "bg-emerald-50 border-emerald-100" : "bg-amber-50 border-amber-100"
              }`}>
                {(isConfirmed || isActive) ? (
                  <>
                    <p className="text-xs font-semibold text-emerald-600 mb-0.5">Starts in</p>
                    <p className="text-xl font-bold text-emerald-700 tabular-nums">
                      {String(consultTimer.mins).padStart(2, "0")}:{String(consultTimer.secs).padStart(2, "0")}
                    </p>
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4 text-amber-500 mx-auto mb-0.5 animate-pulse" />
                    <p className="text-xs font-semibold text-amber-700">Awaiting approval</p>
                  </>
                )}
              </div>

              {/* Connect button replaces "View" once form filled and approved */}
              {preConsFilled && (isConfirmed || isActive) ? (
                <Button size="sm" onClick={() => router.push(`/patient/waiting-room/${appt._id}`)}>
                  <PhoneCall className="w-3.5 h-3.5 mr-1" />
                  Connect
                </Button>
              ) : (
                <Button size="sm" onClick={() => router.push(`/patient/pre-consultation/${appt._id}`)}>
                  {preConsFilled ? "View" : "Fill Details"}
                </Button>
              )}
            </div>
          </div>

          {!preConsFilled && !patientTimer.expired && (
            <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2 border border-amber-100">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Please fill your pre-consultation details within 5 minutes of booking.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
