"use client";

import {
  motion,
  useInView,
  useScroll,
  useSpring,
  useTransform,
  useMotionValue,
  animate,
  useReducedMotion,
  type MotionValue,
  type Variants,
} from "framer-motion";
import {
  useRef,
  useEffect,
  useState,
  type ReactNode,
  type ComponentProps,
} from "react";
import { directional, staggerContainer, staggerItem, spring, EASE_REVEAL } from "@/lib/motion";

type Dir = "up" | "down" | "left" | "right" | "none";

/* ── Reveal — scroll-triggered entrance ─────────────────────────────────────── */
export function Reveal({
  children,
  direction = "up",
  delay = 0,
  once = true,
  amount = 0.3,
  className,
  as = "div",
}: {
  children: ReactNode;
  direction?: Dir;
  delay?: number;
  once?: boolean;
  amount?: number;
  className?: string;
  as?: keyof typeof motion;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once, amount });
  const reduce = useReducedMotion();
  const variants: Variants = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.3 } } }
    : directional(direction);
  const MotionTag = motion[as] as typeof motion.div;

  return (
    <MotionTag
      ref={ref}
      initial="hidden"
      animate={inView ? "show" : "hidden"}
      variants={variants}
      transition={{ delay }}
      className={className}
    >
      {children}
    </MotionTag>
  );
}

/* ── Stagger — orchestrated list reveals ────────────────────────────────────── */
export function Stagger({
  children,
  stagger = 0.08,
  delayChildren = 0,
  once = true,
  amount = 0.2,
  className,
}: {
  children: ReactNode;
  stagger?: number;
  delayChildren?: number;
  once?: boolean;
  amount?: number;
  className?: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once, amount });
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? "show" : "hidden"}
      variants={staggerContainer(stagger, delayChildren)}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={staggerItem} className={className}>
      {children}
    </motion.div>
  );
}

/* ── ScrollProgress — thin top bar ──────────────────────────────────────────── */
export function ScrollProgress({ className = "" }: { className?: string }) {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.4 });
  return (
    <motion.div
      style={{ scaleX }}
      className={`fixed left-0 top-0 z-[60] h-[3px] w-full origin-left bg-brand-gradient ${className}`}
    />
  );
}

/* ── MagneticButton — pointer-follow magnetism ──────────────────────────────── */
export function Magnetic({
  children,
  strength = 0.35,
  className,
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, spring);
  const sy = useSpring(y, spring);
  const reduce = useReducedMotion();

  function onMove(e: React.MouseEvent) {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  }
  function reset() {
    x.set(0);
    y.set(0);
  }
  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      style={{ x: sx, y: sy }}
      className={`inline-flex ${className ?? ""}`}
    >
      {children}
    </motion.div>
  );
}

/* ── TiltCard — 3D hover tilt ───────────────────────────────────────────────── */
export function TiltCard({
  children,
  className,
  max = 8,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 250, damping: 20 });
  const sry = useSpring(ry, { stiffness: 250, damping: 20 });
  const reduce = useReducedMotion();

  function onMove(e: React.MouseEvent) {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    ry.set(px * max);
    rx.set(-py * max);
  }
  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={() => {
        rx.set(0);
        ry.set(0);
      }}
      style={{ rotateX: srx, rotateY: sry, transformPerspective: 1000 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ── Parallax — scroll-linked translate ─────────────────────────────────────── */
export function Parallax({
  children,
  offset = 60,
  className,
}: {
  children: ReactNode;
  offset?: number;
  className?: string;
}) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const reduce = useReducedMotion();
  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [offset, -offset]);
  return (
    <motion.div ref={ref} style={{ y }} className={className}>
      {children}
    </motion.div>
  );
}

/* ── Counter — animated number roll-up when in view ─────────────────────────── */
export function Counter({
  to,
  from = 0,
  duration = 1.6,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
}: {
  to: number;
  from?: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [val, setVal] = useState(from);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setVal(to);
      return;
    }
    const controls = animate(from, to, {
      duration,
      ease: EASE_REVEAL,
      onUpdate: (v) => setVal(v),
    });
    return () => controls.stop();
  }, [inView, to, from, duration, reduce]);

  return (
    <span ref={ref} className={`tnum ${className ?? ""}`}>
      {prefix}
      {val.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

/* ── Marquee — infinite horizontal strip ────────────────────────────────────── */
export function Marquee({
  children,
  speed = 30,
  className,
}: {
  children: ReactNode;
  speed?: number;
  className?: string;
}) {
  return (
    <div className={`relative flex overflow-hidden ${className ?? ""}`}>
      <motion.div
        className="flex shrink-0 gap-12 pr-12"
        animate={{ x: ["0%", "-100%"] }}
        transition={{ duration: speed, ease: "linear", repeat: Infinity }}
      >
        {children}
      </motion.div>
      <motion.div
        className="flex shrink-0 gap-12 pr-12"
        animate={{ x: ["0%", "-100%"] }}
        transition={{ duration: speed, ease: "linear", repeat: Infinity }}
        aria-hidden
      >
        {children}
      </motion.div>
    </div>
  );
}

/* ── PulseDot — live status indicator ───────────────────────────────────────── */
export function PulseDot({ className = "", color = "var(--success)" }: { className?: string; color?: string }) {
  return (
    <span className={`relative inline-flex h-2.5 w-2.5 ${className}`}>
      <motion.span
        className="absolute inline-flex h-full w-full rounded-full"
        style={{ background: color }}
        animate={{ scale: [1, 2.2], opacity: [0.6, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
      />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: color }} />
    </span>
  );
}

/* ── GradientMesh — animated ambient background ─────────────────────────────── */
export function GradientMesh({ className = "" }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <motion.div
        className="absolute -left-1/4 -top-1/3 h-[60vmax] w-[60vmax] rounded-full opacity-40 blur-[100px]"
        style={{ background: "radial-gradient(circle, var(--brand-500), transparent 60%)" }}
        animate={reduce ? undefined : { x: [0, 60, 0], y: [0, 40, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-1/4 top-1/4 h-[50vmax] w-[50vmax] rounded-full opacity-30 blur-[100px]"
        style={{ background: "radial-gradient(circle, var(--accent-500), transparent 60%)" }}
        animate={reduce ? undefined : { x: [0, -50, 0], y: [0, 60, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

/* Re-export motion for convenience */
export { motion };
export type { MotionValue, ComponentProps };
