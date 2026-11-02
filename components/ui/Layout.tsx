import { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Reveal } from "@/components/motion";

/** Centered max-width container. */
export function Container({
  size = "content",
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { size?: "prose" | "content" | "wide" | "full" }) {
  const max = {
    prose: "max-w-3xl",
    content: "max-w-6xl",
    wide: "max-w-7xl",
    full: "max-w-none",
  }[size];
  return (
    <div className={cn("mx-auto w-full px-5 sm:px-8", max, className)} {...props}>
      {children}
    </div>
  );
}

/** Vertical rhythm section with consistent padding. */
export function Section({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("py-20 md:py-28", className)} {...props}>
      {children}
    </section>
  );
}

/** Standard section heading (eyebrow + title + subtitle), reveal-animated. */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "center",
  className = "",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        align === "center" ? "items-center text-center mx-auto max-w-2xl" : "items-start text-left max-w-2xl",
        className,
      )}
    >
      {eyebrow && (
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted">
            {eyebrow}
          </span>
        </Reveal>
      )}
      <Reveal delay={0.05}>
        <h2 className="text-3xl md:text-[2.6rem] font-bold tracking-tight leading-[1.1] text-text text-balance">
          {title}
        </h2>
      </Reveal>
      {subtitle && (
        <Reveal delay={0.1}>
          <p className="text-base md:text-lg text-muted leading-relaxed">{subtitle}</p>
        </Reveal>
      )}
    </div>
  );
}
