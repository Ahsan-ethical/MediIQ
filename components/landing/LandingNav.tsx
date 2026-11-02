"use client";
import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from "framer-motion";
import { Activity, Menu, X } from "lucide-react";
import { Magnetic } from "@/components/motion";
import ThemeToggle from "@/components/ui/ThemeToggle";

const links = [
  { href: "#agents", label: "AI Agents" },
  { href: "#technology", label: "Technology" },
  { href: "#workflow", label: "Workflow" },
  { href: "#security", label: "Security" },
  { href: "/about", label: "How it works" },
];

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 24));

  return (
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-x-0 top-0 z-50"
    >
      <div
        className={`mx-auto mt-3 flex max-w-6xl items-center justify-between rounded-2xl px-4 py-2.5 transition-all duration-300 sm:px-5 ${
          scrolled ? "glass shadow-[var(--shadow-2)] mx-3 md:mx-auto" : "bg-transparent"
        }`}
      >
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient shadow-[var(--shadow-brand)]">
            <Activity className="h-5 w-5 text-white" />
          </span>
          <span className="text-lg font-bold tracking-tight text-text">MediIQ</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="group relative px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:text-text"
            >
              {l.label}
              <span className="absolute inset-x-3.5 -bottom-0.5 h-px origin-left scale-x-0 bg-brand-500 transition-transform duration-300 group-hover:scale-x-100" />
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />
          <Link
            href="/login"
            className="hidden rounded-lg px-3.5 py-2 text-sm font-semibold text-muted transition-colors hover:text-text sm:block"
          >
            Sign in
          </Link>
          <Magnetic className="hidden sm:inline-flex">
            <Link
              href="/register"
              className="rounded-xl bg-brand-gradient px-4 py-2 text-sm font-semibold text-white shadow-[var(--shadow-2)] transition-shadow hover:shadow-[var(--shadow-brand)]"
            >
              Get started
            </Link>
          </Magnetic>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-3 mt-2 rounded-2xl glass p-3 shadow-[var(--shadow-3)] md:hidden"
          >
            <div className="flex flex-col">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted hover:bg-surface-2 hover:text-text"
                >
                  {l.label}
                </Link>
              ))}
              <div className="mt-2 flex items-center gap-2 border-t border-border pt-3">
                <Link href="/login" className="flex-1 rounded-lg border border-border py-2.5 text-center text-sm font-semibold text-text">
                  Sign in
                </Link>
                <Link href="/register" className="flex-1 rounded-lg bg-brand-gradient py-2.5 text-center text-sm font-semibold text-white">
                  Get started
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
