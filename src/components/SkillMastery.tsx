"use client";
import { useEffect, useState } from "react";
import { Spinner, api } from "./ui";

type M = { skill: string; mean: number; sd: number; lower: number; evidenceCount: number; selfReported: boolean; verified: boolean; status: "mastered" | "developing" | "gap" };
type Profile = { mastery: M[]; evidenceCount: number; nextTopics: string[]; model: { halfLifeDays: number; masteredLowerBound: number } };

const STATUS = {
  mastered: { label: "Mastered", cls: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500" },
  developing: { label: "Developing", cls: "bg-amber-100 text-amber-800", bar: "bg-amber-500" },
  gap: { label: "Gap", cls: "bg-red-100 text-red-700", bar: "bg-red-400" },
} as const;

/** Bayesian mastery per skill: bar = posterior mean, shaded band = ±1 sd (uncertainty). */
export default function SkillMastery({ goal, refreshKey }: { goal: string; refreshKey: string }) {
  const [p, setP] = useState<Profile | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    setP(null);
    api<Profile>(`/api/learn/mastery?goal=${encodeURIComponent(goal)}`).then((d) => { setP(d); setErr(false); }).catch(() => setErr(true));
  }, [goal, refreshKey]);

  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="h2">Skill Mastery (Skill Intelligence Engine)</h2>
        <span className="text-xs text-slate-500">Bayesian estimate from quiz answers and trainer-graded assignments{p ? ` · ${p.evidenceCount} evidence points` : ""}</span>
      </div>
      {err ? <p className="text-sm text-slate-500">Mastery estimates are unavailable right now.</p>
        : !p ? <div className="text-sm text-slate-500"><Spinner /> Estimating…</div>
        : (
          <>
            <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
              {p.mastery.map((m) => {
                const s = STATUS[m.status];
                const lo = Math.max(0, m.mean - m.sd) * 100, hi = Math.min(1, m.mean + m.sd) * 100;
                return (
                  <div key={m.skill} className="text-sm">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-slate-700">{m.skill}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {!m.verified && <span className="text-[10px] text-slate-400">{m.selfReported ? "self-reported" : "no evidence"}</span>}
                        <span className={`chip ${s.cls}`}>{s.label} · {Math.round(m.mean * 100)}%</span>
                      </span>
                    </div>
                    <div className="relative h-2 rounded-full bg-slate-100" title={`mean ${Math.round(m.mean * 100)}%, ±${Math.round(m.sd * 100)}% uncertainty, ${m.evidenceCount} evidence`}>
                      <div className="absolute h-2 rounded-full bg-slate-300/70" style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
                      <div className={`absolute h-2 rounded-full ${s.bar}`} style={{ width: `${m.mean * 100}%`, opacity: 0.85 }} />
                    </div>
                  </div>
                );
              })}
            </div>
            {p.nextTopics.length > 0 && (
              <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
                <b>Next assessment will focus on:</b> {p.nextTopics.join(", ")}. These are the skills we are least certain about (uncertainty sampling).
              </p>
            )}
            <p className="mt-2 text-xs text-slate-400">
              &quot;Mastered&quot; means the 80% credible lower bound is at least {Math.round(p.model.masteredLowerBound * 100)}%. Evidence older than {p.model.halfLifeDays} days counts half as much.
            </p>
          </>
        )}
    </section>
  );
}
