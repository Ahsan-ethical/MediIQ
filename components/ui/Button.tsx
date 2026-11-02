"use client";
import { forwardRef, type ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";

interface ButtonProps extends Omit<HTMLMotionProps<"button">, "ref" | "children"> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children?: ReactNode;
}

const variants: Record<string, string> = {
  primary:
    "text-primary-fg bg-brand-gradient shadow-[var(--shadow-2)] hover:shadow-[var(--shadow-brand)] border border-brand-700/20",
  secondary:
    "bg-surface text-text border border-border-strong shadow-[var(--shadow-1)] hover:bg-surface-2",
  outline:
    "border border-brand-500/40 text-brand-600 dark:text-brand-300 hover:bg-brand-50/60 dark:hover:bg-brand-500/10",
  ghost: "text-muted hover:text-text hover:bg-surface-2",
  danger: "text-white bg-danger shadow-[var(--shadow-2)] hover:brightness-105",
  success: "text-white bg-success shadow-[var(--shadow-2)] hover:brightness-105",
};

const sizes: Record<string, string> = {
  sm: "px-3.5 py-2 text-[13px] rounded-lg gap-1.5",
  md: "px-5 py-2.5 text-sm rounded-xl gap-2",
  lg: "px-7 py-3.5 text-[15px] rounded-xl gap-2.5",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, children, className = "", disabled, ...props }, ref) => (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.97 }}
      whileHover={{ y: -1 }}
      transition={spring}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-semibold cursor-pointer select-none",
        "transition-colors duration-200 disabled:opacity-55 disabled:cursor-not-allowed disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </motion.button>
  ),
);

Button.displayName = "Button";
export default Button;
