"use client";
import { useCallback, useEffect, useState } from "react";

export type Student = {
  name: string; email: string; college: string; branch: string; semester: number;
  skills: string[]; careerGoal: string; interests: string[];
};

export type ApiErr = { error: string; code?: string };

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
  if (!res.ok) throw Object.assign(new Error(data.error ?? "Request failed"), { code: data.code });
  return data as T;
}

export function useStudent() {
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErr | null>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<{ student: Student | null }>("/api/student");
      setStudent(d.student);
      setError(null);
    } catch (e) {
      setError({ error: (e as Error).message, code: (e as { code?: string }).code });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { student, setStudent, loading, error, reload };
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-zinc-400 leading-relaxed max-w-xl">{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

export function Alert({ kind = "info", children }: { kind?: "info" | "warn" | "error" | "success"; children: React.ReactNode }) {
  const cls = {
    info:    "border-zinc-200 bg-zinc-50 text-zinc-600",
    warn:    "border-amber-200/60 bg-amber-50 text-amber-700",
    error:   "border-red-200/60 bg-red-50 text-red-600",
    success: "border-emerald-200/60 bg-emerald-50 text-emerald-700",
  }[kind];
  const icon = { info: "ℹ", warn: "⚠", error: "✕", success: "✓" }[kind];
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${cls}`}>
      <span className="mt-0.5 shrink-0 text-xs opacity-60">{icon}</span>
      <div>{children}</div>
    </div>
  );
}

export function ErrorAlert({ err }: { err: ApiErr | null }) {
  if (!err) return null;
  if (err.code === "DB_NOT_CONFIGURED")
    return (
      <Alert kind="warn">
        <b>MongoDB not configured.</b> Add <code className="rounded bg-amber-100 px-1">MONGODB_URI</code> to <code className="rounded bg-amber-100 px-1">.env.local</code> and restart.
      </Alert>
    );
  if (err.code === "AI_NOT_CONFIGURED")
    return (
      <Alert kind="warn">
        <b>AI not configured.</b> Add <code className="rounded bg-amber-100 px-1">AI_API_KEY</code>, <code className="rounded bg-amber-100 px-1">AI_MODEL</code> and <code className="rounded bg-amber-100 px-1">AI_BASE_URL</code> to <code className="rounded bg-amber-100 px-1">.env.local</code>.
      </Alert>
    );
  return <Alert kind="error">{err.error}</Alert>;
}

export function SourceBadge({ source }: { source: string }) {
  const ai = source === "ai";
  return (
    <span className={`chip ${ai ? "bg-violet-100 text-violet-700" : "bg-zinc-100 text-zinc-500"}`}>
      {ai ? "✦ AI" : source === "rules" ? "⚙ Skill Engine" : "⚙ Question Bank"}
    </span>
  );
}

export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />;
}

export function StatCard({ label, value, sub, color = "blue" }: { label: string; value: string | number; sub?: string; color?: "blue" | "green" | "amber" | "violet" }) {
  const accent = {
    blue:   "from-blue-500 to-blue-600",
    green:  "from-emerald-500 to-emerald-600",
    amber:  "from-amber-500 to-amber-600",
    violet: "from-violet-500 to-violet-600",
  }[color];
  return (
    <div className="card relative overflow-hidden">
      <div className={`absolute top-0 left-0 h-1 w-full bg-gradient-to-r ${accent}`} />
      <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-[0.08em] mt-1">{label}</div>
      <div className="mt-2 text-3xl font-bold text-zinc-900">{value}</div>
      {sub && <div className="mt-1 text-xs text-zinc-400">{sub}</div>}
    </div>
  );
}

export const toErr = (e: unknown): ApiErr => ({ error: (e as Error).message, code: (e as { code?: string }).code });
