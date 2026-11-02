import { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  color: string;
  bgColor: string;
  delay?: number;
  trend?: string;
}

export default function StatCard({ label, value, icon, color, bgColor, delay = 0, trend }: StatCardProps) {
  return (
    <div
      className="group animate-fade-in-up rounded-2xl border border-border bg-surface p-5 opacity-0 shadow-1 transition-all duration-300 hover:-translate-y-1 hover:shadow-3"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "forwards" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted">{label}</p>
          <p className="mt-1 text-3xl font-bold tracking-tight tnum text-text">{value}</p>
          {trend && <p className="mt-1 text-xs font-medium text-success">{trend}</p>}
        </div>
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${bgColor} ${color} transition-transform duration-300 group-hover:scale-110`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
