import { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "brand" | "accent" | "success" | "warning" | "danger" | "info" | "neutral";

const tones: Record<Tone, string> = {
  brand: "bg-brand-500/12 text-brand-700 dark:text-brand-300 border-brand-500/20",
  accent: "bg-accent-500/12 text-accent-600 dark:text-accent-300 border-accent-500/20",
  success: "bg-success/12 text-success border-success/20",
  warning: "bg-warning/12 text-[color-mix(in_srgb,var(--warning)_80%,black)] dark:text-warning border-warning/25",
  danger: "bg-danger/12 text-danger border-danger/20",
  info: "bg-info/12 text-info border-info/20",
  neutral: "bg-surface-3 text-muted border-border",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  dot?: boolean;
}

export default function Badge({ tone = "neutral", dot, className = "", children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
