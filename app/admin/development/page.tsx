"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Play,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  Zap,
  Brain,
  FileText,
  Search,
  BookOpen,
  Shield,
  Pill,
  Siren,
  ScanSearch,
  Workflow,
} from "lucide-react";

/* ── Registry (client-side copy to avoid server import) ─────────────────────── */

interface AgentMeta {
  id: number;
  name: string;
  purpose: string;
  phase: "gather" | "prescribe" | "verify" | "detect";
  feedsInto: number[];
  triggeredBy: number[];
  dataSources: string[];
}

const AGENTS: AgentMeta[] = [
  { id: 1, name: "Patient Summary Agent", purpose: "Maintains a running patient summary from profile + past consultations", phase: "gather", feedsInto: [6], triggeredBy: [], dataSources: ["MongoDB: patientprofiles", "MongoDB: appointments", "MongoDB: aiconsultations"] },
  { id: 2, name: "Transcribe Agent", purpose: "Structures the consultation transcript + RxNorm drug-name normalization", phase: "gather", feedsInto: [4, 5, 6], triggeredBy: [], dataSources: ["Call Transcript", "RxNorm API"] },
  { id: 3, name: "Similar Cases Agent", purpose: "Hybrid vector search + rerank over the case library", phase: "gather", feedsInto: [6], triggeredBy: [], dataSources: ["MongoDB: cases (Atlas Vector Search)", "Gemini embedding-001"] },
  { id: 4, name: "Medical Context Agent", purpose: "Retrieves clinical guidelines and drug knowledge for symptoms + conditions", phase: "gather", feedsInto: [6, 7], triggeredBy: [2], dataSources: ["Clinical Guidelines DB", "Drug Knowledge Base"] },
  { id: 5, name: "Allergy Context Agent", purpose: "Expands patient allergies into full drug classes via RxClass", phase: "gather", feedsInto: [6, 8], triggeredBy: [2], dataSources: ["RxClass API", "Patient Allergy List"] },
  { id: 6, name: "Reasoning Agent", purpose: "Reads all gathered data and fills a prescription (Gemini 2.5 Flash)", phase: "prescribe", feedsInto: [7, 8], triggeredBy: [1, 2, 3, 4, 5], dataSources: ["Gemini 2.5 Flash"] },
  { id: 7, name: "Drug Medic Agent", purpose: "Checks right drug, right dose, drug-drug interactions on the prescription", phase: "verify", feedsInto: [6, 9], triggeredBy: [6], dataSources: ["Drug Interaction DB", "Dosage Reference"] },
  { id: 8, name: "Allergy Agent", purpose: "Checks the prescription against patient allergies via RxClass cross-references", phase: "verify", feedsInto: [6, 9], triggeredBy: [6], dataSources: ["RxClass API", "Expanded Allergy Context"] },
  { id: 9, name: "Finding Detector Agent", purpose: "Detects new lifelong meds + allergies, proposes updates to patient record", phase: "detect", feedsInto: [], triggeredBy: [7, 8], dataSources: ["Final Prescription", "Patient Profile"] },
];

const AGENT_ICONS: Record<number, React.ReactNode> = {
  1: <FileText className="w-4 h-4" />,
  2: <BookOpen className="w-4 h-4" />,
  3: <Search className="w-4 h-4" />,
  4: <BookOpen className="w-4 h-4" />,
  5: <Shield className="w-4 h-4" />,
  6: <Brain className="w-4 h-4" />,
  7: <Pill className="w-4 h-4" />,
  8: <Siren className="w-4 h-4" />,
  9: <ScanSearch className="w-4 h-4" />,
};

const PHASE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  gather:    { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200" },
  prescribe: { bg: "bg-violet-50",  text: "text-violet-700",  border: "border-violet-200" },
  verify:    { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200" },
  detect:    { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
};

interface AgentResult {
  agentId: number;
  agentName: string;
  status: "ok" | "flag" | "error";
  input: unknown;
  output: unknown;
  feedsInto: number[];
  triggeredBy: number[];
  logs: string[];
  durationMs: number;
  error?: string;
}

/* ── Pipeline Map ───────────────────────────────────────────────────────────── */

function PipelineMap({ selectedId, results }: { selectedId: number | null; results: Map<number, AgentResult> }) {
  const rows: { label: string; ids: number[] }[] = [
    { label: "Gather", ids: [1, 2, 3, 4, 5] },
    { label: "Prescribe", ids: [6] },
    { label: "Verify", ids: [7, 8] },
    { label: "Detect", ids: [9] },
  ];

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
      <div className="flex items-center gap-2 mb-5">
        <Workflow className="w-5 h-5 text-muted" />
        <h2 className="font-semibold text-text">Pipeline Flow</h2>
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((row, ri) => (
          <div key={row.label}>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-subtle w-16 shrink-0">
                {row.label}
              </span>
              <div className="flex flex-wrap gap-2">
                {row.ids.map((id) => {
                  const a = AGENTS.find((x) => x.id === id)!;
                  const pc = PHASE_COLORS[a.phase];
                  const result = results.get(id);
                  const isSelected = selectedId === id;
                  return (
                    <div
                      key={id}
                      className={`
                        flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                        ${pc.bg} ${pc.text} ${pc.border}
                        ${isSelected ? "ring-2 ring-offset-1 ring-blue-400 scale-105" : ""}
                        ${result?.status === "ok" ? "opacity-100" : result?.status === "error" ? "opacity-60" : "opacity-80"}
                      `}
                    >
                      {result?.status === "ok" && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                      {result?.status === "flag" && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                      {result?.status === "error" && <XCircle className="w-3 h-3 text-red-500" />}
                      <span className="font-bold">{id}</span>
                      <span className="hidden sm:inline">{a.name.replace(" Agent", "")}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {ri < rows.length - 1 && (
              <div className="ml-[4.5rem] my-1.5 flex items-center gap-1 text-subtle">
                <ArrowRight className="w-3.5 h-3.5" />
                <div className="h-px flex-1 bg-slate-200" />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-border flex items-center gap-1.5 text-[10px] text-subtle">
        <span className="inline-block w-2 h-2 rounded-full bg-amber-300" /> Agents 7,8 loop back to 6 on failure
      </div>
    </div>
  );
}

/* ── Agent Panel ────────────────────────────────────────────────────────────── */

function AgentPanel({
  agent,
  result,
  isOpen,
  onToggle,
  onRun,
  isRunning,
}: {
  agent: AgentMeta;
  result: AgentResult | null;
  isOpen: boolean;
  onToggle: () => void;
  onRun: (input: string, useMock: boolean) => void;
  isRunning: boolean;
}) {
  const [inputJson, setInputJson] = useState("{}");
  const pc = PHASE_COLORS[agent.phase];

  return (
    <div className={`bg-surface rounded-2xl border shadow-sm overflow-hidden transition-all ${
      isOpen ? `${pc.border} border-l-4` : "border-border"
    }`}>
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-surface-2/50 transition-colors"
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${pc.bg} ${pc.text}`}>
          {AGENT_ICONS[agent.id]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-text">
              #{agent.id}
            </span>
            <span className="font-semibold text-sm text-text">
              {agent.name}
            </span>
            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${pc.bg} ${pc.text}`}>
              {agent.phase}
            </span>
          </div>
          <p className="text-xs text-muted mt-0.5 truncate">{agent.purpose}</p>
        </div>
        <div className="flex items-center gap-2">
          {result && (() => {
            const out = result.output as Record<string, unknown> | null;
            const prov = out?.provider as string | undefined;
            const cache = out?.cacheStatus as string | undefined;
            return <>
              {prov ? <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold ${prov === "cache" ? "bg-cyan-50 text-cyan-600 border border-cyan-200" : prov.includes("gemini") ? "bg-blue-50 text-blue-600 border border-blue-200" : "bg-orange-50 text-orange-600 border border-orange-200"}`}>
                {prov === "cache" ? "✔ Cache" : prov.includes("gemini") ? "✔ Gemini" : "✔ Ollama"}
              </span> : null}
              {cache ? <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold ${cache === "hit" ? "bg-cyan-50 text-cyan-700 border border-cyan-200" : "bg-surface-2 text-muted border border-border"}`}>
                {cache === "hit" ? "⚡ Cache Hit" : "Cache Miss"}
              </span> : null}
            </>;
          })()}
          {result && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              result.status === "ok" ? "bg-emerald-50 text-emerald-700" :
              result.status === "flag" ? "bg-amber-50 text-amber-700" :
              "bg-red-50 text-red-700"
            }`}>
              {result.status.toUpperCase()} • {result.durationMs}ms
            </span>
          )}
          {isOpen ? <ChevronDown className="w-4 h-4 text-subtle" /> : <ChevronRight className="w-4 h-4 text-subtle" />}
        </div>
      </button>

      {/* Expanded Content */}
      {isOpen && (
        <div className="px-5 pb-5 border-t border-border">
          {/* Flow Indicators */}
          <div className="flex flex-wrap gap-3 mt-4 mb-4">
            {agent.triggeredBy.length > 0 && (
              <div className="text-xs text-muted">
                <span className="font-medium text-muted">Triggered by:</span>{" "}
                {agent.triggeredBy.map((id) => (
                  <span key={id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-mono mr-1">
                    #{id}
                  </span>
                ))}
              </div>
            )}
            {agent.feedsInto.length > 0 && (
              <div className="text-xs text-muted">
                <span className="font-medium text-muted">Feeds into:</span>{" "}
                {agent.feedsInto.map((id) => (
                  <span key={id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-mono mr-1">
                    #{id}
                  </span>
                ))}
              </div>
            )}
            <div className="text-xs text-muted">
              <span className="font-medium text-muted">Data sources:</span>{" "}
              {agent.dataSources.join(", ")}
            </div>
          </div>

          {/* Input */}
          <div className="mb-3">
            <label className="text-xs font-semibold text-muted block mb-1.5">Input JSON</label>
            <textarea
              value={inputJson}
              onChange={(e) => setInputJson(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-mono text-text focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300 resize-y"
              spellCheck={false}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => onRun(inputJson, false)}
              disabled={isRunning}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Run with custom input
            </button>
            <button
              onClick={() => onRun("", true)}
              disabled={isRunning}
              className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              Run with mock data
            </button>
          </div>

          {/* Output */}
          {result && (
            <div>
              {/* Logs */}
              <div className="mb-3">
                <label className="text-xs font-semibold text-muted block mb-1.5">Agent Logs</label>
                <div className="bg-slate-900 rounded-lg p-3 space-y-0.5">
                  {result.logs.map((log, i) => (
                    <div key={i} className="text-[11px] font-mono text-subtle">
                      <span className="text-muted mr-2">{String(i + 1).padStart(2, "0")}</span>
                      {log}
                    </div>
                  ))}
                </div>
              </div>

              {/* Status + Output */}
              <div className="mb-3">
                <label className="text-xs font-semibold text-muted block mb-1.5">Output</label>
                <pre className="bg-surface-2 border border-border rounded-lg p-3 text-[11px] font-mono text-text overflow-x-auto max-h-80 overflow-y-auto">
                  {JSON.stringify(result.output, null, 2)}
                </pre>
              </div>

              {result.error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                  <span className="font-semibold">Error:</span> {result.error}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Full Pipeline Runner ───────────────────────────────────────────────────── */

function PipelineResults({ results }: { results: AgentResult[] }) {
  if (results.length === 0) return null;

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
      <h3 className="font-semibold text-text mb-4 flex items-center gap-2">
        <Workflow className="w-4 h-4" />
        Full Pipeline Results
      </h3>
      <div className="space-y-2">
        {results.map((r, i) => (
          <div key={r.agentId} className="flex items-start gap-3">
            {/* Connector */}
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                r.status === "ok" ? "bg-emerald-500" : r.status === "flag" ? "bg-amber-500" : "bg-red-500"
              }`}>
                {r.agentId}
              </div>
              {i < results.length - 1 && <div className="w-px h-6 bg-slate-200 mt-1" />}
            </div>
            {/* Content */}
            <div className="flex-1 min-w-0 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-text">{r.agentName}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  r.status === "ok" ? "bg-emerald-50 text-emerald-700" :
                  r.status === "flag" ? "bg-amber-50 text-amber-700" :
                  "bg-red-50 text-red-700"
                }`}>
                  {r.status} • {r.durationMs}ms
                </span>
              </div>
              <div className="text-[11px] text-muted mt-0.5">
                {r.logs[r.logs.length - 1]}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-border text-xs text-muted">
        Total: {results.reduce((s, r) => s + r.durationMs, 0)}ms across {results.length} agents
      </div>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────────── */

export default function DevelopmentPage() {
  const [openAgent, setOpenAgent] = useState<number | null>(null);
  const [results, setResults] = useState<Map<number, AgentResult>>(new Map());
  const [runningAgent, setRunningAgent] = useState<number | null>(null);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineResults, setPipelineResults] = useState<AgentResult[]>([]);
  const [demoMode, setDemoMode] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings/demo-mode").then(r => r.json()).then(d => {
      if (d.demoMode !== undefined) setDemoMode(d.demoMode);
    }).catch(() => {});
  }, []);

  const toggleDemo = async () => {
    setDemoLoading(true);
    try {
      const res = await fetch("/api/admin/settings/demo-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !demoMode }),
      });
      const data = await res.json();
      if (data.ok) setDemoMode(data.demoMode);
    } catch { /* ignore */ }
    finally { setDemoLoading(false); }
  };

  const runAgent = useCallback(async (agentId: number, inputJson: string, useMock: boolean) => {
    setRunningAgent(agentId);
    try {
      let parsedInput: unknown = {};
      if (!useMock && inputJson.trim()) {
        try {
          parsedInput = JSON.parse(inputJson);
        } catch {
          setResults((prev) => {
            const next = new Map(prev);
            next.set(agentId, {
              agentId,
              agentName: AGENTS.find((a) => a.id === agentId)!.name,
              status: "error",
              input: inputJson,
              output: null,
              feedsInto: [],
              triggeredBy: [],
              logs: ["Invalid JSON input"],
              durationMs: 0,
              error: "Could not parse input JSON",
            });
            return next;
          });
          return;
        }
      }

      const res = await fetch("/api/admin/development/run-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, input: parsedInput, useMockInput: useMock }),
      });

      const data = await res.json();
      if (data.ok && data.result) {
        setResults((prev) => {
          const next = new Map(prev);
          next.set(agentId, data.result);
          return next;
        });
      }
    } finally {
      setRunningAgent(null);
    }
  }, []);

  const runFullPipeline = useCallback(async () => {
    setPipelineRunning(true);
    setPipelineResults([]);
    setResults(new Map());
    try {
      const res = await fetch("/api/admin/development/run-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runFullPipeline: true }),
      });
      const data = await res.json();
      if (data.ok && data.results) {
        setPipelineResults(data.results);
        const newMap = new Map<number, AgentResult>();
        for (const r of data.results as AgentResult[]) {
          newMap.set(r.agentId, r);
        }
        setResults(newMap);
      }
    } finally {
      setPipelineRunning(false);
    }
  }, []);

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text">Agent Development Harness</h1>
        <p className="text-muted text-sm mt-0.5">
          Test and debug the 9-agent clinical decision-support pipeline
        </p>
      </div>

      {/* Demo Mode Toggle */}
      <div className={`rounded-2xl border shadow-sm p-5 flex items-center justify-between ${demoMode ? "bg-amber-50 border-amber-200" : "bg-surface border-border"}`}>
        <div>
          <h2 className="font-semibold text-text text-sm">Demo Mode</h2>
          <p className="text-xs text-muted mt-0.5">
            {demoMode
              ? "ON — Cached responses active. Scenario A: \"Fever, body ache, sore throat\" | Scenario B: \"Itchy skin rash on arms\""
              : "OFF — All agents use live LLM calls (Gemini + Ollama)"}
          </p>
        </div>
        <button
          onClick={toggleDemo}
          disabled={demoLoading}
          className={`relative w-14 h-7 rounded-full transition-colors ${demoMode ? "bg-amber-500" : "bg-slate-300"} ${demoLoading ? "opacity-50" : ""}`}
        >
          <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-surface shadow transition-transform ${demoMode ? "translate-x-7" : "translate-x-0.5"}`} />
        </button>
      </div>

      {/* Pipeline Map */}
      <PipelineMap selectedId={openAgent} results={results} />

      {/* Run Full Pipeline */}
      <div className="flex items-center gap-3">
        <button
          onClick={runFullPipeline}
          disabled={pipelineRunning}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-semibold rounded-xl hover:from-violet-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          {pipelineRunning ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Workflow className="w-4 h-4" />
          )}
          {pipelineRunning ? "Running pipeline..." : "Run Full Pipeline (Mock Data)"}
        </button>
        {results.size > 0 && (
          <button
            onClick={() => { setResults(new Map()); setPipelineResults([]); }}
            className="text-xs text-muted hover:text-text underline"
          >
            Clear all results
          </button>
        )}
      </div>

      {/* Pipeline Results */}
      <PipelineResults results={pipelineResults} />

      {/* Agent Panels */}
      <div className="space-y-3">
        <h2 className="font-semibold text-text text-sm uppercase tracking-wide">Individual Agents</h2>
        {AGENTS.map((agent) => (
          <AgentPanel
            key={agent.id}
            agent={agent}
            result={results.get(agent.id) ?? null}
            isOpen={openAgent === agent.id}
            onToggle={() => setOpenAgent(openAgent === agent.id ? null : agent.id)}
            onRun={(input, useMock) => runAgent(agent.id, input, useMock)}
            isRunning={runningAgent === agent.id}
          />
        ))}
      </div>
    </div>
  );
}
