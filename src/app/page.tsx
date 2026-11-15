"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, ErrorAlert, PageHeader, Spinner, api, toErr, useStudent, type ApiErr } from "@/components/ui";
import { CAREER_GOALS } from "@/lib/careers";

type Status = { db: { configured: boolean; connected: boolean; error?: string }; ai: { configured: boolean; model: string | null }; connectUrlConfigured: boolean };

// Empty form; name/email come from the signed-in account (single source of truth: MongoDB).
const EMPTY_FORM = {
  name: "", email: "", college: "", branch: "", semester: 1, skills: "", careerGoal: "Full Stack Developer", interests: "",
};

const MODULE_ITEMS = [
  { href: "/learn",   title: "Learn",    desc: "Skill gaps, quiz, roadmap" },
  { href: "/build",   title: "CodeLab",  desc: "Code + AI mentor" },
  { href: "/connect", title: "Connect",  desc: "Peer community" },
  { href: "/compete", title: "Compete",  desc: "Hackathons" },
  { href: "/grow",    title: "Grow",     desc: "Resume builder" },
];

export default function Dashboard() {
  const { student, setStudent, loading, error } = useStudent();
  const [status, setStatus] = useState<Status | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<ApiErr | null>(null);

  useEffect(() => { api<Status>("/api/status").then(setStatus).catch(() => {}); }, []);
  const [account, setAccount] = useState<{ name: string; email: string } | null>(null);
  useEffect(() => {
    api<{ user: { name: string; email: string } }>("/api/auth/me").then((d) => {
      setAccount(d.user);
      setForm((f) => ({ ...f, name: f.name || d.user.name, email: d.user.email }));
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (student) setForm({ ...student, skills: student.skills.join(", "), interests: student.interests.join(", ") });
  }, [student]);

  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(null); setSaveErr(null);
    try {
      const d = await api<{ student: typeof student }>("/api/student", { method: "PUT", body: JSON.stringify(form) });
      setStudent(d.student);
      setMsg("Profile saved.");
      window.dispatchEvent(new Event("gk-account-updated"));
    } catch (e) {
      setSaveErr(toErr(e));
    } finally {
      setSaving(false);
    }
  }

  const Dot = ({ ok, label, detail }: { ok: boolean; label: string; detail: string }) => (
    <div className="flex items-start gap-3">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-400"}`} />
      <div><div className="text-sm font-medium text-zinc-700">{label}</div><div className="text-xs text-zinc-400 break-all">{detail}</div></div>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={student?.name || account?.name ? `${new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric"})} · Dashboard` : "Dashboard"}
        subtitle="Track your progress across learning, practice and career readiness."
        right={<Link href="/learn" className="btn-primary">Start learning →</Link>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <form onSubmit={save} className="card lg:col-span-2 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="h2">Student profile</h2>
          </div>
          {loading ? <div className="text-sm text-zinc-400"><Spinner /> Loading profile…</div> : <ErrorAlert err={error} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label">Name</label><input className="input" value={form.name} onChange={set("name")} required /></div>
            <div><label className="label">Email (account)</label><input className="input bg-zinc-50" type="email" value={form.email} readOnly title="Your sign-in email. Change it in Account settings." /></div>
            <div className="sm:col-span-2"><label className="label">College</label><input className="input" value={form.college} onChange={set("college")} required /></div>
            <div><label className="label">Engineering branch</label><input className="input" value={form.branch} onChange={set("branch")} required /></div>
            <div><label className="label">Semester</label>
              <select className="input" value={form.semester} onChange={set("semester")}>
                {Array.from({ length: 8 }, (_, i) => i + 1).map((s) => <option key={s} value={s}>Semester {s}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2"><label className="label">Existing skills (comma separated)</label><input className="input" value={form.skills} onChange={set("skills")} /></div>
            <div><label className="label">Career goal</label>
              <select className="input" value={form.careerGoal} onChange={set("careerGoal")}>
                {CAREER_GOALS.map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div><label className="label">Interests (for Compete)</label><input className="input" value={form.interests} onChange={set("interests")} /></div>
          </div>
          <div className="flex items-center gap-3">
            <button className="btn-primary" disabled={saving}>{saving && <Spinner />} Save profile</button>
            {msg && <span className="text-sm font-medium text-emerald-600">✓ {msg}</span>}
          </div>
          <ErrorAlert err={saveErr} />
        </form>

        <div className="space-y-6">
          <div className="card space-y-3">
            <h2 className="h2">System status</h2>
            {!status ? <div className="text-sm text-zinc-400"><Spinner /> Checking…</div> : (
              <>
                <Dot ok={status.db.connected} label="MongoDB"
                  detail={status.db.connected ? "Connected" : status.db.configured ? `Configured but not reachable: ${status.db.error ?? ""}` : "Set MONGODB_URI"} />
                <Dot ok={status.ai.configured} label="AI API"
                  detail={status.ai.configured ? `Configured (${status.ai.model})` : "Set AI_API_KEY, AI_MODEL, AI_BASE_URL"} />
                <Dot ok={status.connectUrlConfigured} label="Connect link"
                  detail={status.connectUrlConfigured ? "Configured" : "Set NEXT_PUBLIC_CONNECT_URL"} />
              </>
            )}
          </div>
          <div className="card">
            <h2 className="h2 mb-4">Modules</h2>
            <div className="grid grid-cols-2 gap-2">
              {MODULE_ITEMS.map(({ href, title, desc }) => (
                <Link key={href} href={href} className="group rounded-lg border border-zinc-200 p-3 transition-colors duration-150 hover:border-zinc-300 hover:bg-zinc-50">
                  <div className="mb-1 text-sm font-medium text-zinc-800">{title}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">{desc}</div>
                </Link>
              ))}
            </div>
          </div>
          {student && <Alert kind="info">Goal: <b>{student.careerGoal}</b> · {student.skills.length} skills listed</Alert>}
        </div>
      </div>
    </div>
  );
}
