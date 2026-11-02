/**
 * MediIQ motion system — the single source of truth for animation.
 * Import these variants/transitions everywhere so motion stays consistent.
 */
import type { Variants, Transition } from "framer-motion";

// ── Easings & springs ─────────────────────────────────────────────────────────
export const EASE_REVEAL = [0.16, 1, 0.3, 1] as const;
export const EASE_STANDARD = [0.4, 0, 0.2, 1] as const;

export const spring: Transition = { type: "spring", stiffness: 400, damping: 34, mass: 0.9 };
export const softSpring: Transition = { type: "spring", stiffness: 220, damping: 30 };
export const snappy: Transition = { type: "spring", stiffness: 550, damping: 30 };

export const dur = { fast: 0.15, base: 0.25, slow: 0.45, xslow: 0.7 } as const;

export const reveal: Transition = { duration: dur.slow, ease: EASE_REVEAL };

// ── Reveal variants ───────────────────────────────────────────────────────────
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: reveal },
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: reveal },
};

export const fadeInDown: Variants = {
  hidden: { opacity: 0, y: -22 },
  show: { opacity: 1, y: 0, transition: reveal },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  show: { opacity: 1, scale: 1, transition: reveal },
};

export const blurIn: Variants = {
  hidden: { opacity: 0, filter: "blur(10px)", y: 16 },
  show: { opacity: 1, filter: "blur(0px)", y: 0, transition: { duration: dur.xslow, ease: EASE_REVEAL } },
};

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -28 },
  show: { opacity: 1, x: 0, transition: reveal },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 28 },
  show: { opacity: 1, x: 0, transition: reveal },
};

export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: { opacity: 1, scale: 1, transition: spring },
};

// ── Stagger orchestration ─────────────────────────────────────────────────────
export function staggerContainer(stagger = 0.07, delayChildren = 0): Variants {
  return {
    hidden: {},
    show: { transition: { staggerChildren: stagger, delayChildren } },
  };
}

export const staggerItem: Variants = fadeInUp;

// Direction map for a generic <Reveal direction="up|down|left|right|none" />
export const directional = (d: "up" | "down" | "left" | "right" | "none"): Variants => ({
  hidden: {
    opacity: 0,
    y: d === "up" ? 22 : d === "down" ? -22 : 0,
    x: d === "left" ? 28 : d === "right" ? -28 : 0,
  },
  show: { opacity: 1, y: 0, x: 0, transition: reveal },
});

// ── Interactive presets ───────────────────────────────────────────────────────
export const hoverLift = { y: -4, transition: spring };
export const tapPress = { scale: 0.97 };

// ── Route / page transition ───────────────────────────────────────────────────
export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: dur.slow, ease: EASE_REVEAL } },
  exit: { opacity: 0, y: -8, transition: { duration: dur.base, ease: EASE_STANDARD } },
};
