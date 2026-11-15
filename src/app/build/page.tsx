"use client";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { ErrorAlert, Spinner, api, toErr, type ApiErr } from "@/components/ui";
import { runInSandbox, type LogLine } from "@/components/sandboxRunner";
import type { Monaco as MonacoT } from "@monaco-editor/react";

const Monaco = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-slate-400"><Spinner /> Loading editor…</div>,
});

type Lang = "javascript" | "typescript" | "python" | "cpp" | "c" | "java";
const LANGS: Record<Lang, { label: string; file: string; runnable: boolean; icon: string }> = {
  javascript: { label: "JavaScript", file: "main.js", runnable: true, icon: "JS" },
  typescript: { label: "TypeScript", file: "main.ts", runnable: true, icon: "TS" },
  python:     { label: "Python 3",   file: "main.py", runnable: true, icon: "PY" },
  cpp:        { label: "C++",        file: "main.cpp", runnable: false, icon: "C++" },
  c:          { label: "C",          file: "main.c",   runnable: false, icon: "C" },
  java:       { label: "Java",       file: "Main.java", runnable: false, icon: "☕" },
};
const LANG_COLOR: Record<Lang, string> = {
  javascript: "bg-yellow-400 text-yellow-900",
  typescript: "bg-blue-500 text-white",
  python:     "bg-green-500 text-white",
  cpp:        "bg-purple-500 text-white",
  c:          "bg-indigo-500 text-white",
  java:       "bg-orange-500 text-white",
};
const STARTERS: Record<Lang, string> = {
  javascript: `// CodeLab — JavaScript
// Hit Run to execute in a secure sandbox

function fibonacci(n) {
  const seq = [0, 1];
  for (let i = 2; i < n; i++) seq.push(seq[i - 1] + seq[i - 2]);
  return seq.slice(0, n);
}

console.log("First 10 Fibonacci numbers:", fibonacci(10));

const students = [{ name: "Aarav", score: 82 }, { name: "Diya", score: 91 }];
const topper = students.reduce((a, b) => (a.score > b.score ? a : b));
console.log(\`Topper: \${topper.name}\`);
`,
  typescript: `// CodeLab — TypeScript
type Student = { name: string; score: number };

const students: Student[] = [
  { name: "Aarav", score: 82 },
  { name: "Diya", score: 91 },
];

const average = (xs: number[]): number =>
  xs.reduce((a, b) => a + b, 0) / xs.length;

console.log("Average score:", average(students.map((s) => s.score)));
`,
  python: `# CodeLab — Python 3 (runs via Pyodide in your browser)

def fibonacci(n):
    seq = [0, 1]
    while len(seq) < n:
        seq.append(seq[-1] + seq[-2])
    return seq[:n]

print("First 10 Fibonacci numbers:", fibonacci(10))

scores = {"Aarav": 82, "Diya": 91}
print("Topper:", max(scores, key=scores.get))
`,
  cpp: `// CodeLab — C++ (edit + AI help; run needs server compiler)
#include <iostream>
using namespace std;

int main() {
    cout << "Hello from GURUKOOL!" << endl;
    return 0;
}
`,
  c: `// CodeLab — C (edit + AI help; run needs server compiler)
#include <stdio.h>

int main(void) {
    printf("Hello from GURUKOOL!\\n");
    return 0;
}
`,
  java: `// CodeLab — Java (edit + AI help; run needs server compiler)
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello from GURUKOOL!");
    }
}
`,
};

const QUICK_ASK = [
  "Explain this code",
  "Why am I getting this error?",
  "How can I optimise this?",
  "What is a closure?",
];

type Msg = { role: "user" | "assistant"; content: string };
const LOG_CLS: Record<LogLine["type"], string> = {
  log: "text-slate-100", info: "text-sky-300", warn: "text-amber-300",
  error: "text-red-400", system: "text-slate-500",
};

export default function BuildPage() {
  const [lang, setLang] = useState<Lang>("javascript");
  const [codes, setCodes] = useState<Record<Lang, string>>(STARTERS);
  const code = codes[lang];
  const setCode = (v: string) => setCodes((c) => ({ ...c, [lang]: v }));
  const monacoRef = useRef<MonacoT | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [running, setRunning] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [chatErr, setChatErr] = useState<ApiErr | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

  async function compileTs(out: LogLine[]): Promise<string | null> {
    const m = monacoRef.current;
    if (!m) { out.push({ type: "error", text: "Editor still loading, try again." }); return null; }
    const uri = m.Uri.parse(`file:///${LANGS.typescript.file}`);
    const getWorker = await m.languages.typescript.getTypeScriptWorker();
    const client = await getWorker(uri);
    const diags = [...(await client.getSyntacticDiagnostics(uri.toString())), ...(await client.getSemanticDiagnostics(uri.toString()))];
    for (const d of diags.slice(0, 8)) {
      const msg = typeof d.messageText === "string" ? d.messageText : d.messageText.messageText;
      out.push({ type: "warn", text: `TypeScript: ${msg}` });
    }
    const emitted = await client.getEmitOutput(uri.toString());
    return emitted.outputFiles[0]?.text ?? null;
  }

  async function run() {
    const L = LANGS[lang];
    setRunning(true);
    const start = performance.now();
    const out: LogLine[] = [{ type: "system", text: `▶  Running ${L.label}…` }];
    setLogs([...out]);
    if (!L.runnable) {
      out.push({ type: "error", text: `${L.label} execution needs a server-side compiler — not available yet. You can still write and ask the AI about it.` });
      setLogs([...out]); setRunning(false); return;
    }
    let source = code;
    if (lang === "typescript") {
      const js = await compileTs(out);
      setLogs([...out]);
      if (js === null) { setRunning(false); return; }
      source = js;
    }
    const r = await runInSandbox(source, (l) => { out.push(l); setLogs([...out]); }, lang === "python" ? 60000 : 5000, lang === "python" ? "python" : "javascript");
    if (r.unavailable) {
      setUnavailable(true);
      out.push({ type: "error", text: "Sandbox unavailable in this browser. Try Chrome, Edge or Firefox." });
    } else {
      out.push({ type: "system", text: `${r.ok ? "✓ Done" : "✗ Error"} · ${Math.round(performance.now() - start)} ms` });
    }
    setLogs([...out]);
    setRunning(false);
  }

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    const history = messages;
    const next: Msg[] = [...messages, { role: "user", content: question }];
    setMessages(next); setQ(""); setBusy(true); setChatErr(null);
    try {
      const output = logs.filter((l) => l.type !== "system").map((l) => `[${l.type}] ${l.text}`).join("\n");
      const d = await api<{ reply: string }>("/api/chat", { method: "POST", body: JSON.stringify({ question, code, output, history, language: LANGS[lang].label }) });
      setMessages([...next, { role: "assistant", content: d.reply }]);
    } catch (e) {
      setChatErr(toErr(e));
      setMessages(history);
      setQ(question);
    } finally {
      setBusy(false);
      setTimeout(() => chatEnd.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-[#0d1117]">

      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-[#30363d] bg-[#161b22] px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-white">⚡ CodeLab</span>
          <span className="hidden text-xs text-slate-500 sm:inline">sandboxed · no network</span>
        </div>
        {/* Language tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {(Object.keys(LANGS) as Lang[]).map((l) => (
            <button key={l} onClick={() => setLang(l)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${lang === l ? "bg-[#21262d] text-white" : "text-slate-400 hover:text-white"}`}>
              <span className={`rounded px-1 py-0.5 text-[10px] font-bold ${LANG_COLOR[l]}`}>{LANGS[l].icon}</span>
              <span className="hidden sm:inline">{LANGS[l].label}</span>
              {!LANGS[l].runnable && <span className="hidden text-[10px] text-slate-600 sm:inline">edit</span>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-slate-500 sm:inline">{LANGS[lang].file}</span>
          <button onClick={() => { setCodes((c) => ({ ...c, [lang]: STARTERS[lang] })); setLogs([]); }}
            className="rounded-md border border-[#30363d] bg-[#21262d] px-3 py-1 text-xs text-slate-400 hover:text-white transition-colors">Reset</button>
          <button onClick={run} disabled={running}
            className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors">
            {running ? <Spinner /> : <span>▶</span>}
            {running ? "Running…" : "Run"}
          </button>
        </div>
      </div>

      {unavailable && (
        <div className="shrink-0 bg-amber-900/30 px-4 py-2 text-xs text-amber-300">
          ⚠ Secure sandbox not available in this browser. Try Chrome, Edge or Firefox.
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: editor + console */}
        <div className="flex flex-1 flex-col overflow-hidden border-r border-[#30363d]">

          {/* Editor */}
          <div className="flex-1 overflow-hidden">
            <Monaco
              height="100%"
              path={`file:///${LANGS[lang].file}`}
              language={lang}
              value={code}
              theme="vs-dark"
              onChange={(v) => setCode(v ?? "")}
              onMount={(_editor, m) => {
                monacoRef.current = m;
                m.languages.typescript.typescriptDefaults.setCompilerOptions({
                  target: m.languages.typescript.ScriptTarget.ES2020,
                  module: m.languages.typescript.ModuleKind.None,
                  strict: true, noEmitOnError: false,
                });
              }}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                fontLigatures: true,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                lineNumbers: "on",
                renderLineHighlight: "line",
                cursorBlinking: "smooth",
                smoothScrolling: true,
                padding: { top: 12, bottom: 12 },
              }}
            />
          </div>

          {/* Console */}
          <div className="h-44 shrink-0 border-t border-[#30363d] bg-[#0d1117]">
            <div className="flex items-center justify-between border-b border-[#30363d] px-4 py-1.5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                <span className="text-xs font-medium text-slate-400">OUTPUT</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-600">{lang === "python" ? "Pyodide · 60s" : "sandbox · 5s"}</span>
                {logs.length > 0 && (
                  <button onClick={() => setLogs([])} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">Clear</button>
                )}
              </div>
            </div>
            <pre className="h-[calc(100%-32px)] overflow-auto p-4 font-mono text-xs leading-relaxed">
              {logs.length === 0
                ? <span className="text-slate-600">Hit Run to see output here…</span>
                : logs.map((l, i) => <div key={i} className={`whitespace-pre-wrap ${LOG_CLS[l.type]}`}>{l.text}</div>)}
            </pre>
          </div>
        </div>

        {/* Right: AI chat */}
        <div className="flex w-80 shrink-0 flex-col bg-[#161b22] xl:w-96">
          {/* Chat header */}
          <div className="flex items-center justify-between border-b border-[#30363d] px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-xs">✦</div>
              <span className="text-sm font-semibold text-white">AI Mentor</span>
              <span className="rounded-full bg-emerald-900/50 px-2 py-0.5 text-[10px] text-emerald-400">online</span>
            </div>
            {messages.length > 0 && (
              <button onClick={() => setMessages([])} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">Clear</button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-auto px-3 py-3 space-y-3">
            {messages.length === 0 ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 leading-relaxed px-1">Your code and output are sent with every question.</p>
                <div className="space-y-2">
                  {QUICK_ASK.map((s) => (
                    <button key={s} onClick={() => ask(s)}
                      className="w-full rounded-lg border border-[#30363d] bg-[#21262d] px-3 py-2.5 text-left text-xs text-slate-300 hover:border-blue-500/50 hover:bg-[#1c2128] hover:text-white transition-all">
                      {s}
                    </button>
                  ))}
                </div>
                <div className="mt-4 rounded-lg border border-dashed border-[#30363d] p-3 text-xs text-slate-600">
                  <p className="font-medium text-slate-500 mb-1">Try asking:</p>
                  <p>"Why is my for loop running one extra time?"</p>
                  <p className="mt-1">"What&apos;s the time complexity of this?"</p>
                </div>
              </div>
            ) : messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2.5 text-xs leading-relaxed ${
                  m.role === "user"
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-[#21262d] text-slate-200 border border-[#30363d] rounded-bl-sm"
                }`}>
                  <div className="whitespace-pre-wrap break-words">{m.content}</div>
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="bg-[#21262d] border border-[#30363d] rounded-xl rounded-bl-sm px-3 py-2.5">
                  <div className="flex gap-1 items-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "0ms" }}></span>
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "150ms" }}></span>
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "300ms" }}></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEnd} />
          </div>

          {/* Error */}
          {chatErr && <div className="px-3 pb-2"><ErrorAlert err={chatErr} /></div>}

          {/* Input */}
          <div className="border-t border-[#30363d] p-3">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
              <input
                className="flex-1 rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                placeholder="Ask anything about your code…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40 transition-colors"
                disabled={busy || !q.trim()}>
                {busy ? <Spinner /> : "↑"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
