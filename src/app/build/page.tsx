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
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-slate-50">

      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-2 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-slate-900">⚡ CodeLab</span>
          <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 sm:inline">sandboxed · no network</span>
        </div>
        {/* Language tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {(Object.keys(LANGS) as Lang[]).map((l) => (
            <button key={l} onClick={() => setLang(l)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${lang === l ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}>
              <span className={`rounded px-1 py-0.5 text-[10px] font-bold ${lang === l ? "opacity-90" : ""} ${LANG_COLOR[l]}`}>{LANGS[l].icon}</span>
              <span className="hidden sm:inline">{LANGS[l].label}</span>
              {!LANGS[l].runnable && <span className="hidden text-[9px] opacity-50 sm:inline">edit</span>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-slate-400 sm:inline">{LANGS[lang].file}</span>
          <button onClick={() => { setCodes((c) => ({ ...c, [lang]: STARTERS[lang] })); setLogs([]); }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-800 transition-all">Reset</button>
          <button onClick={run} disabled={running}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-all shadow-sm">
            {running ? <Spinner /> : <span>▶</span>}
            {running ? "Running…" : "Run"}
          </button>
        </div>
      </div>

      {unavailable && (
        <div className="shrink-0 bg-amber-50 border-b border-amber-100 px-4 py-2 text-xs text-amber-700">
          ⚠ Secure sandbox not available in this browser. Try Chrome, Edge or Firefox.
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: editor + console */}
        <div className="flex flex-1 flex-col overflow-hidden border-r border-slate-200">

          {/* Editor */}
          <div className="flex-1 overflow-hidden">
            <Monaco
              height="100%"
              path={`file:///${LANGS[lang].file}`}
              language={lang}
              value={code}
              theme="vs"
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
          <div className="h-44 shrink-0 border-t border-slate-200 bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-700/60 px-4 py-1.5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                <span className="text-xs font-medium text-zinc-400">OUTPUT</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-600">{lang === "python" ? "Pyodide · 60s" : "sandbox · 5s"}</span>
                {logs.length > 0 && (
                  <button onClick={() => setLogs([])} className="text-xs text-slate-600 hover:text-slate-300 transition-colors">Clear</button>
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

        {/* Right: URBro chat */}
        <div className="flex w-80 shrink-0 flex-col bg-white xl:w-96">
          {/* Chat header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-blue-500 text-sm font-bold text-white shadow-sm">U</div>
              <div>
                <p className="text-sm font-bold text-slate-900">URBro</p>
                <p className="text-[10px] text-slate-400">your coding buddy</p>
              </div>
              <span className="ml-1 rounded-full bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-600">● online</span>
            </div>
            {messages.length > 0 && (
              <button onClick={() => setMessages([])} className="text-xs text-slate-400 hover:text-slate-700 transition-colors">Clear</button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-auto px-3 py-3 space-y-3">
            {messages.length === 0 ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2 px-1">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-blue-500 text-xs font-bold text-white">U</div>
                  <div className="rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2.5 text-xs leading-relaxed text-slate-700">
                    Yo! I can see your code and output. Ask me anything 👀
                  </div>
                </div>
                <div className="space-y-1.5 pt-1">
                  {QUICK_ASK.map((s) => (
                    <button key={s} onClick={() => ask(s)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-xs text-slate-600 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 transition-all font-medium">
                      {s} →
                    </button>
                  ))}
                </div>
                <div className="mt-2 rounded-xl bg-gradient-to-br from-violet-50 to-blue-50 border border-violet-100 p-3 text-xs text-slate-500">
                  <p className="font-semibold text-slate-700 mb-1">💡 Try asking:</p>
                  <p className="text-slate-500">&ldquo;Why is my loop off by one?&rdquo;</p>
                  <p className="mt-1 text-slate-500">&ldquo;What&apos;s the time complexity of this?&rdquo;</p>
                </div>
              </div>
            ) : messages.map((m, i) => (
              <div key={i} className={`flex items-end gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div className="mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-blue-500 text-xs font-bold text-white">U</div>
                )}
                <div className={`max-w-[80%] rounded-2xl px-3 py-2.5 text-xs leading-relaxed ${
                  m.role === "user"
                    ? "bg-slate-900 text-white rounded-br-sm"
                    : "bg-slate-100 text-slate-800 rounded-bl-sm"
                }`}>
                  <div className="whitespace-pre-wrap break-words">{m.content}</div>
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-end gap-2 justify-start">
                <div className="mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-blue-500 text-xs font-bold text-white">U</div>
                <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex gap-1 items-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "0ms" }}></span>
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "150ms" }}></span>
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "300ms" }}></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEnd} />
          </div>

          {/* Error */}
          {chatErr && <div className="px-3 pb-2"><ErrorAlert err={chatErr} /></div>}

          {/* Input */}
          <div className="border-t border-slate-100 p-3 bg-white">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
              <input
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-100 transition-all"
                placeholder="Ask URBro anything…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button
                className="rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-30 transition-all"
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
