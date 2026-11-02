"use client";
import { InputHTMLAttributes, forwardRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
  hint?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, hint, className = "", ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-semibold text-text">{label}</label>}
      <div className="relative">
        {icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle pointer-events-none">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={cn(
            "w-full rounded-xl border bg-surface px-4 py-3 text-sm text-text",
            "placeholder:text-subtle transition-all duration-200",
            "focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/12",
            "disabled:bg-surface-2 disabled:cursor-not-allowed",
            error ? "border-danger focus:border-danger focus:ring-danger/15" : "border-border",
            icon ? "pl-10" : "",
            className,
          )}
          {...props}
        />
      </div>
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs text-danger font-medium">{error}</p>}
    </div>
  ),
);

Input.displayName = "Input";
export default Input;
