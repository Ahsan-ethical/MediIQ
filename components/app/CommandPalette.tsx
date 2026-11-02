"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, CornerDownLeft, LogOut } from "lucide-react";
import toast from "react-hot-toast";

export interface CmdItem {
  href: string;
  label: string;
  group?: string;
}

export default function CommandPalette({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: CmdItem[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const base = q.trim().toLowerCase();
    const list = base ? items.filter((i) => i.label.toLowerCase().includes(base)) : items;
    return list.slice(0, 8);
  }, [q, items]);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
      if (e.key === "Enter") {
        const r = results[active];
        if (r) { router.push(r.href); onClose(); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, active, router, onClose]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    toast.success("Logged out");
    router.push("/login");
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-4)]"
          >
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="h-4 w-4 text-subtle" />
              <input
                autoFocus
                value={q}
                onChange={(e) => { setQ(e.target.value); setActive(0); }}
                placeholder="Search pages…"
                className="w-full bg-transparent py-4 text-sm text-text outline-none placeholder:text-subtle"
              />
              <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-subtle">ESC</kbd>
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {results.length === 0 && <p className="px-3 py-6 text-center text-sm text-subtle">No results</p>}
              {results.map((r, i) => (
                <button
                  key={r.href}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => { router.push(r.href); onClose(); }}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${
                    i === active ? "bg-brand-500/10 text-text" : "text-muted"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {r.group && <span className="text-[10px] font-semibold uppercase tracking-wide text-subtle">{r.group}</span>}
                    {r.label}
                  </span>
                  {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-subtle" />}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
              <span className="text-[11px] text-subtle">↑↓ to navigate · ↵ to open</span>
              <button onClick={signOut} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-danger">
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
