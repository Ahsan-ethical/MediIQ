"use client";
import { useState } from "react";
import { Radio, WifiOff } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

export default function GoLiveButton({ initialLive }: { initialLive: boolean }) {
  const router = useRouter();
  const [live, setLive] = useState(initialLive);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/doctor/toggle-live", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      setLive(data.isLive);
      toast.success(data.isLive ? "You are now Live! Patients can book you." : "You went offline.");
      router.refresh();
    } catch {
      toast.error("Failed to update status");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`
        flex items-center gap-2.5 px-6 py-3 rounded-2xl font-semibold text-sm
        transition-all duration-200 active:scale-95 disabled:opacity-60
        ${live
          ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 animate-pulse-glow"
          : "bg-slate-800 hover:bg-slate-700 text-white shadow-lg"
        }
      `}
    >
      {live ? (
        <>
          <Radio className="w-4 h-4 animate-pulse" />
          Live — Click to go Offline
        </>
      ) : (
        <>
          <WifiOff className="w-4 h-4" />
          Go Live
        </>
      )}
    </button>
  );
}
