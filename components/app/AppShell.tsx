"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { Activity, LogOut, Menu, X, Search, ChevronDown, User as UserIcon } from "lucide-react";
import ThemeToggle from "@/components/ui/ThemeToggle";
import CommandPalette, { type CmdItem } from "@/components/app/CommandPalette";
import { spring } from "@/lib/motion";

interface NavItem { href: string; label: string; icon: ReactNode }
type Accent = "brand" | "accent" | "violet";

interface Props {
  navItems: NavItem[];
  user: { name: string; role: string; userId?: string };
  accent?: Accent;
  banner?: ReactNode;
  children: ReactNode;
}

const accentPill: Record<Accent, string> = {
  brand: "linear-gradient(120deg, var(--brand-600), var(--accent-500))",
  accent: "linear-gradient(120deg, var(--accent-600), var(--brand-500))",
  violet: "linear-gradient(120deg, #7c3aed, var(--brand-600))",
};
const accentRing: Record<Accent, string> = {
  brand: "from-brand-500 to-accent-400",
  accent: "from-accent-500 to-brand-400",
  violet: "from-violet-500 to-brand-400",
};

const AI_MODE_LABELS: Record<string, string> = {
  gemini_only: "Gemini Only",
  gemini_ollama_race: "Gemini + Ollama",
  deepseek_only: "DeepSeek Only",
  deepseek_gemini: "DeepSeek + Gemini",
};
const AI_MODE_TONE: Record<string, string> = {
  gemini_only: "text-brand-600 dark:text-brand-300 bg-brand-500/10 border-brand-500/20",
  gemini_ollama_race: "text-success bg-success/10 border-success/20",
  deepseek_only: "text-violet-600 dark:text-violet-300 bg-violet-500/10 border-violet-500/20",
  deepseek_gemini: "text-warning bg-warning/10 border-warning/25",
};

function useAppSettings() {
  const [demoMode, setDemoMode] = useState(false);
  const [aiMode, setAiMode] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/admin/settings/demo-mode").then((r) => r.json()).then((d) => d.demoMode && setDemoMode(true)).catch(() => {});
    fetch("/api/admin/settings/ai-mode").then((r) => r.json()).then((d) => d.aiMode && setAiMode(d.aiMode)).catch(() => {});
  }, []);
  return { demoMode, aiMode };
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

/* ── Sidebar contents (shared by desktop + mobile sheet) ────────────────────── */
function SidebarBody({
  navItems, user, accent, demoMode, aiMode, onNavigate,
}: {
  navItems: NavItem[]; user: Props["user"]; accent: Accent;
  demoMode: boolean; aiMode: string | null; onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    toast.success("Logged out");
    router.push("/login");
  }

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="px-5 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient shadow-[var(--shadow-brand)]">
            <Activity className="h-5 w-5 text-white" />
          </span>
          <span className="text-lg font-bold tracking-tight text-text">MediIQ{demoMode && "."}</span>
        </Link>
        {aiMode && (
          <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${AI_MODE_TONE[aiMode] ?? "border-border bg-surface-2 text-muted"}`} title="Active AI engine (Admin → AI Engine)">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {AI_MODE_LABELS[aiMode] ?? aiMode}
          </span>
        )}
      </div>

      {/* User */}
      <div className="mx-3 flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5">
        <span className={`flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br ${accentRing[accent]} text-sm font-bold text-white`}>
          {user.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">{user.name}</p>
          <p className="text-xs capitalize text-muted">{user.role}{user.userId ? ` · ${user.userId}` : ""}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="mt-4 flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? "text-white" : "text-muted hover:bg-surface-2 hover:text-text"
              }`}
            >
              {active && (
                <motion.span
                  layoutId={`nav-pill-${accent}`}
                  style={{ background: accentPill[accent] }}
                  className="absolute inset-0 -z-0 rounded-xl shadow-[var(--shadow-2)]"
                  transition={spring}
                />
              )}
              <span className="relative z-10 flex items-center gap-3">
                {item.icon}
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );
}

/* ── User menu (topbar) ─────────────────────────────────────────────────────── */
function UserMenu({ user, accent, profileHref }: { user: Props["user"]; accent: Accent; profileHref: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    toast.success("Logged out");
    router.push("/login");
  }
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-lg border border-border bg-surface py-1 pl-1 pr-2 hover:bg-surface-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br ${accentRing[accent]} text-xs font-bold text-white`}>
          {user.name.charAt(0).toUpperCase()}
        </span>
        <ChevronDown className="h-4 w-4 text-muted" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-[var(--shadow-3)]"
          >
            <div className="px-3 py-2">
              <p className="truncate text-sm font-semibold text-text">{user.name}</p>
              <p className="text-xs capitalize text-muted">{user.role}</p>
            </div>
            <Link href={profileHref} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-text">
              <UserIcon className="h-4 w-4" /> Profile
            </Link>
            <button onClick={logout} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted hover:bg-danger/10 hover:text-danger">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── AppShell ───────────────────────────────────────────────────────────────── */
export default function AppShell({ navItems, user, accent = "brand", banner, children }: Props) {
  const pathname = usePathname();
  const { demoMode, aiMode } = useAppSettings();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmdOpen((o) => !o); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const current = navItems.find((n) => isActive(pathname, n.href));
  const title = current?.label ?? pathname.split("/").filter(Boolean).slice(-1)[0]?.replace(/-/g, " ") ?? "";
  const profileHref = navItems.find((n) => n.href.includes("profile"))?.href ?? navItems[0]?.href ?? "/";
  const cmdItems: CmdItem[] = navItems.map((n) => ({ href: n.href, label: n.label }));

  return (
    <div className="min-h-screen bg-bg">
      {/* Skip to content (a11y) */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-text focus:shadow-3">
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-surface lg:block">
        <SidebarBody navItems={navItems} user={user} accent={accent} demoMode={demoMode} aiMode={aiMode} />
      </aside>

      {/* Mobile sheet */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
            <motion.aside
              initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: "spring", stiffness: 360, damping: 36 }}
              className="fixed inset-y-0 left-0 z-50 w-72 border-r border-border bg-surface lg:hidden"
            >
              <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2">
                <X className="h-5 w-5" />
              </button>
              <SidebarBody navItems={navItems} user={user} accent={accent} demoMode={demoMode} aiMode={aiMode} onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main column */}
      <div className="lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur-md sm:px-6">
          <button onClick={() => setMobileOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text lg:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold capitalize text-text">{title}</h1>
          </div>
          <button onClick={() => setCmdOpen(true)} className="hidden items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-subtle hover:bg-surface-2 sm:flex">
            <Search className="h-4 w-4" /> Search
            <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold">⌘K</kbd>
          </button>
          <ThemeToggle />
          <UserMenu user={user} accent={accent} profileHref={profileHref} />
        </header>

        {banner}
        <main id="main-content" className="min-h-[calc(100vh-4rem)]">{children}</main>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} items={cmdItems} />
    </div>
  );
}
