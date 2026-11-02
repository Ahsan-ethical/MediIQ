import { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  padded?: boolean;
  variant?: "solid" | "glass" | "subtle";
}

export default function Card({
  children,
  hover = false,
  padded = false,
  variant = "solid",
  className = "",
  ...props
}: CardProps) {
  const base =
    variant === "glass"
      ? "glass"
      : variant === "subtle"
        ? "bg-surface-2 border border-border"
        : "bg-surface border border-border shadow-[var(--shadow-1)]";
  return (
    <div
      className={cn(
        "rounded-2xl",
        base,
        padded && "p-6",
        hover &&
          "transition-all duration-300 hover:shadow-[var(--shadow-3)] hover:-translate-y-1 hover:border-border-strong cursor-pointer",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
