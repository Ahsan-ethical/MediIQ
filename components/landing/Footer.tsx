import Link from "next/link";
import { Activity } from "lucide-react";
import { Container } from "@/components/ui/Layout";

const cols = [
  { title: "Product", links: [["AI Agents", "#agents"], ["Technology", "#technology"], ["Workflow", "#workflow"], ["Security", "#security"]] },
  { title: "Company", links: [["How it works", "/about"], ["Sign in", "/login"], ["Get started", "/register"]] },
  { title: "For doctors", links: [["Join as doctor", "/register?role=doctor"], ["Doctor login", "/login"]] },
];

export default function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <Container className="py-16">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient shadow-[var(--shadow-brand)]">
                <Activity className="h-5 w-5 text-white" />
              </span>
              <span className="text-lg font-bold tracking-tight text-text">MediIQ</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              AI-native healthcare — clinician-guided, safety-checked, and built for the way medicine
              actually works.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted">
              <span className="h-2 w-2 rounded-full bg-success" /> All systems operational
            </div>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <p className="text-xs font-semibold uppercase tracking-wider text-subtle">{c.title}</p>
              <ul className="mt-4 space-y-2.5">
                {c.links.map(([label, href]) => (
                  <li key={label}>
                    <Link href={href} className="text-sm text-muted transition-colors hover:text-text">{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 text-sm text-subtle sm:flex-row">
          <p>© {new Date().getFullYear()} MediIQ. Crafted for medical-grade care.</p>
          <div className="flex gap-6">
            <span className="cursor-default transition-colors hover:text-text">Privacy</span>
            <span className="cursor-default transition-colors hover:text-text">Terms</span>
            <span className="cursor-default transition-colors hover:text-text">Status</span>
          </div>
        </div>
      </Container>
    </footer>
  );
}
