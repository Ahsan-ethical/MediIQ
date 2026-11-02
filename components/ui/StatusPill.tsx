import { cn } from "@/lib/cn";

type Tone = "amber" | "blue" | "green" | "slate" | "red" | "violet";

const toneClass: Record<Tone, string> = {
  amber: "bg-warning/12 text-[color-mix(in_srgb,var(--warning)_78%,black)] dark:text-warning border-warning/20",
  blue: "bg-brand-500/12 text-brand-700 dark:text-brand-300 border-brand-500/20",
  green: "bg-success/12 text-success border-success/20",
  slate: "bg-surface-3 text-muted border-border",
  red: "bg-danger/12 text-danger border-danger/20",
  violet: "bg-violet-500/12 text-violet-600 dark:text-violet-300 border-violet-500/20",
};

// Unified status vocabulary across the app.
const STATUS: Record<string, { label: string; tone: Tone; live?: boolean }> = {
  pending_approval: { label: "Pending", tone: "amber" },
  confirmed: { label: "Confirmed", tone: "blue" },
  active: { label: "Live", tone: "green", live: true },
  in_call: { label: "In call", tone: "violet", live: true },
  post_call: { label: "Completed", tone: "slate" },
  completed: { label: "Completed", tone: "slate" },
  rejected: { label: "Rejected", tone: "red" },
  cancelled: { label: "Cancelled", tone: "slate" },
  // AI consultation states
  report_ready: { label: "Report ready", tone: "green" },
  generating_report: { label: "Processing", tone: "amber" },
  in_consultation: { label: "Live", tone: "green", live: true },
  ready_to_consult: { label: "Ready", tone: "violet" },
  pre_consultation: { label: "Draft", tone: "slate" },
};

export default function StatusPill({ status, className = "" }: { status: string; className?: string }) {
  const s = STATUS[status] ?? { label: status, tone: "slate" as Tone };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize",
        toneClass[s.tone],
        className,
      )}
    >
      {s.live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {s.label}
    </span>
  );
}
