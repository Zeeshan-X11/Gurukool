"use client";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, ErrorAlert, PageHeader, Spinner, api, toErr, type ApiErr } from "@/components/ui";
import { MatchBreakdown, type MatchRec } from "@/components/MentorRecommendations";
import {
  CONNECT_URL, JoinSessionButton, MentorCard, PersonaGate, ProfileBadge, StatusBadge, usePersona,
  type Booking, type Mentor,
} from "@/components/connect";

type Facets = { domains: string[]; days: string[]; formats: string[] };
type Rec = MatchRec;
const TABS = [
  { id: "find", label: "Find Mentors" },
  { id: "sessions", label: "My Sessions" },
  { id: "meetings", label: "Meetings" },
  { id: "network", label: "Industry Network" },
] as const;

function useMentors(params: Record<string, string>) {
  const [mentors, setMentors] = useState<Mentor[] | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [err, setErr] = useState<ApiErr | null>(null);
  const [loading, setLoading] = useState(false);
  const key = JSON.stringify(params);
  useEffect(() => {
    const qs = new URLSearchParams(Object.entries(JSON.parse(key)).filter(([, v]) => v) as [string, string][]);
    setLoading(true);
    const t = setTimeout(() => {
      api<{ mentors: Mentor[]; facets: Facets }>(`/api/mentors?${qs}`)
        .then((d) => { setMentors(d.mentors); setFacets(d.facets); setErr(null); })
        .catch((e) => setErr(toErr(e)))
        .finally(() => setLoading(false));
    }, 250); // debounce typing
    // Keep the expert list fresh: refetch when the tab regains focus and every 30s.
    const refresh = () => api<{ mentors: Mentor[]; facets: Facets }>(`/api/mentors?${qs}`).then((d) => { setMentors(d.mentors); setFacets(d.facets); }).catch(() => {});
    const iv = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => { clearTimeout(t); clearInterval(iv); window.removeEventListener("focus", refresh); };
  }, [key]);
  return { mentors, facets, err, loading };
}

function FindMentors() {
  const [q, setQ] = useState(""), [domain, setDomain] = useState(""), [day, setDay] = useState(""), [format, setFormat] = useState("");
  const { mentors, facets, err, loading } = useMentors({ q, domain, day, format });
  const [recs, setRecs] = useState<Rec[] | null>(null);
  const [recNote, setRecNote] = useState<string | null>(null);
  useEffect(() => {
    api<{ recommendations: Rec[]; reason?: string }>("/api/mentors/recommendations?limit=3")
      .then((d) => { setRecs(d.recommendations); setRecNote(d.reason ?? null); })
      .catch(() => setRecs([]));
  }, []);
  const reset = () => { setQ(""); setDomain(""); setDay(""); setFormat(""); };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Learn Directly from Industry Professionals</h2>
        <p className="mt-1 text-sm text-slate-500">Connect with experienced developers, request weekend masterclasses, and receive guidance based on your learning needs.</p>
      </div>
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="h2">Recommended for your learning path</h2>
          <span className="text-xs text-slate-500">GURUKOOL Mentor Match Engine: weak skills 40% · roadmap 30% · career goal 20% · weekend slots 10%</span>
        </div>
        {recs === null ? <div className="text-sm text-slate-500"><Spinner /> Matching mentors…</div>
          : recs.length === 0 ? (
            <Alert kind="info">{recNote ?? <>No matches yet. Complete <Link href="/learn" className="font-semibold underline">Learn</Link> (skill gaps, assessment, roadmap) to get personalised mentor recommendations.</>}</Alert>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">{recs.map((r) => <MentorCard key={r.mentor.id} m={r.mentor} reason={[r.explanation]} extra={<MatchBreakdown r={r} />} />)}</div>
          )}
      </section>

      <section>
        <h2 className="h2 mb-3">All mentors</h2>
        <div className="card mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input className="input lg:col-span-2" placeholder="Search expertise (e.g. Node.js, React, DSA)…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search expertise" />
          <select className="input" value={domain} onChange={(e) => setDomain(e.target.value)} aria-label="Career domain">
            <option value="">All domains</option>{facets?.domains.map((d) => <option key={d}>{d}</option>)}
          </select>
          <select className="input" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Available day">
            <option value="">Any day</option>{facets?.days.map((d) => <option key={d}>{d}</option>)}
          </select>
          <select className="input" value={format} onChange={(e) => setFormat(e.target.value)} aria-label="Session type">
            <option value="">Any session type</option>{facets?.formats.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <ErrorAlert err={err} />
        {!mentors ? <div className="text-sm text-slate-500"><Spinner /> Loading mentors…</div> : (
          <>
            <p className="mb-3 text-sm text-slate-500">{loading ? "Filtering…" : `${mentors.length} mentor${mentors.length === 1 ? "" : "s"} found`}</p>
            {mentors.length === 0 ? (
              <Alert kind="info">No mentors match these filters. <button className="font-semibold underline" onClick={reset}>Clear filters</button></Alert>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{mentors.map((m) => <MentorCard key={m.id} m={m} />)}</div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function MySessions() {
  const { info } = usePersona();
  const [list, setList] = useState<Booking[] | null>(null);
  const [err, setErr] = useState<ApiErr | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => {
    api<{ sessions: Booking[] }>("/api/mentor-sessions").then((d) => { setList(d.sessions); setErr(null); }).catch((e) => setErr(toErr(e)));
  }, []);
  useEffect(() => { if (info?.persona.role === "student") load(); }, [info, load]);

  async function cancel(id: string) {
    if (!confirm("Cancel this session request?")) return;
    setBusy(id);
    try { await api(`/api/mentor-sessions/${id}`, { method: "PATCH", body: JSON.stringify({ status: "CANCELLED" }) }); load(); }
    catch (e) { setErr(toErr(e)); } finally { setBusy(null); }
  }

  return (
    <PersonaGate need="student" info={info}>
      <ErrorAlert err={err} />
      {!list ? <div className="text-sm text-slate-500"><Spinner /> Loading your sessions…</div>
        : list.length === 0 ? <Alert kind="info">No session requests yet. Open a mentor profile from <b>Find Mentors</b> and request a weekend session.</Alert>
        : (
          <div className="space-y-3">
            {list.map((b) => (
              <div key={b.id} className="card flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={b.status} />
                    <span className="font-semibold">{b.topic}</span>
                    <span className="text-sm text-slate-500">with <Link className="text-blue-700 hover:underline" href={`/connect/mentors/${b.mentorId}`}>{b.mentorName}</Link></span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{b.when} · {b.durationMinutes} min</p>
                  <p className="mt-1 text-sm text-slate-500">“{b.message}”</p>
                  {b.status === "PENDING" && <p className="mt-1 text-xs text-amber-700">Waiting for the mentor to respond.</p>}
                  {b.statusNote && <p className="mt-1 text-xs text-slate-500">Note: {b.statusNote}</p>}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {b.status === "ACCEPTED" && <JoinSessionButton startAt={b.startAt} endAt={b.endAt} />}
                  {(b.status === "PENDING" || b.status === "ACCEPTED") && (
                    <button className="text-xs text-red-600 hover:underline" disabled={busy === b.id} onClick={() => cancel(b.id)}>Cancel request</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
    </PersonaGate>
  );
}

function IndustryNetwork() {
  const [q, setQ] = useState("");
  const { mentors, err } = useMentors({ q });
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3">
        <input className="input max-w-md" placeholder="Search professionals by expertise…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search professionals" />
        <span className="text-xs text-slate-500">A focused directory of professionals: no feeds, followers or endorsements.</span>
      </div>
      <ErrorAlert err={err} />
      {!mentors ? <div className="text-sm text-slate-500"><Spinner /> Loading…</div>
        : mentors.length === 0 ? <Alert kind="info">No professionals match “{q}”.</Alert>
        : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {mentors.map((m) => (
              <div key={m.id} className="flex flex-wrap items-start gap-4 p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 font-semibold text-blue-700">
                  {m.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{m.name}</span><ProfileBadge isDemo={m.isDemo} verified={m.verified} /></div>
                  <p className="text-sm text-slate-600">{m.designation} · {m.organization} · {m.yearsOfExperience} yrs</p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">{m.bio}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">{m.expertise.map((e) => <span key={e} className="chip bg-slate-100 text-slate-700">{e}</span>)}</div>
                </div>
                <div className="flex gap-2">
                  <Link href={`/connect/mentors/${m.id}`} className="btn-ghost">View Profile</Link>
                  <Link href={`/connect/mentors/${m.id}#book`} className="btn-primary">Request Session</Link>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

// ── Meetings (ported from SparkMeet home.jsx + history.jsx) ──
type MeetingRecord = { _id: string; meetingCode: string; date: string };

function Meetings() {
  const router = useRouter();
  const { info } = usePersona();
  const [meetingCode, setMeetingCode] = useState("");
  const [inputErr, setInputErr] = useState("");
  const [history, setHistory] = useState<MeetingRecord[] | null>(null);
  const [histErr, setHistErr] = useState<ApiErr | null>(null);

  const loadHistory = useCallback(() => {
    api<{ meetings: MeetingRecord[] }>("/api/meetings/history")
      .then((d) => { setHistory(d.meetings); setHistErr(null); })
      .catch((e) => setHistErr(toErr(e)));
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = meetingCode.trim();
    if (!code) { setInputErr("Enter a meeting code to continue."); return; }
    setInputErr("");
    // Record in history (non-blocking)
    api("/api/meetings/add", { method: "POST", body: JSON.stringify({ meeting_code: code }) }).catch(() => {});
    router.push(`/connect/meeting?room=${encodeURIComponent(code)}`);
  };

  const handleNew = () => {
    // Create a room with a random code
    const code = `gurukool-${Math.random().toString(36).slice(2, 8)}`;
    api("/api/meetings/add", { method: "POST", body: JSON.stringify({ meeting_code: code }) }).catch(() => {});
    router.push(`/connect/meeting?room=${encodeURIComponent(code)}`);
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return "Date unavailable";
    return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" }).format(date);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Video Meetings</h2>
        <p className="mt-1 text-sm text-gray-500">Start a new meeting or join with a code. Powered by WebRTC — no downloads needed.</p>
      </div>

      {/* Join / Start cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-1">Join a meeting</h3>
          <p className="text-sm text-gray-500 mb-4">Enter the code shared by your host.</p>
          <form onSubmit={handleJoin} className="space-y-3">
            <input
              className="input"
              placeholder="Meeting code (e.g. cs301-study)"
              value={meetingCode}
              onChange={(e) => setMeetingCode(e.target.value)}
            />
            {inputErr && <p className="text-xs text-red-600">{inputErr}</p>}
            <button type="submit" className="btn-primary w-full">Join →</button>
          </form>
        </div>

        <div className="card flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">Start a new meeting</h3>
            <p className="text-sm text-gray-500 mb-4">Create an instant room and share the code with others.</p>
          </div>
          <button onClick={handleNew} className="btn-ghost w-full">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
            </svg>
            New meeting room
          </button>
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-center text-sm">
        {[
          ["🎥", "Video & Audio"],
          ["🖥", "Screen Share"],
          ["💬", "In-call Chat"],
          ["🔗", "Share by Code"],
        ].map(([icon, label]) => (
          <div key={label} className="card py-4">
            <div className="text-2xl mb-1">{icon}</div>
            <div className="text-xs font-medium text-gray-700">{label}</div>
          </div>
        ))}
      </div>

      {/* Meeting history */}
      <section>
        <h3 className="font-semibold text-gray-900 mb-3">Recent meetings</h3>
        <ErrorAlert err={histErr} />
        {history === null ? (
          <div className="text-sm text-gray-500"><Spinner /> Loading history…</div>
        ) : history.length === 0 ? (
          <Alert kind="info">Your past meetings will appear here once you join one.</Alert>
        ) : (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {history.map((m, i) => (
              <div key={`${m._id}-${i}`} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{m.meetingCode}</div>
                    <div className="text-xs text-gray-400">{formatDate(m.date)}</div>
                  </div>
                </div>
                <button
                  onClick={() => router.push(`/connect/meeting?room=${encodeURIComponent(m.meetingCode)}`)}
                  className="btn-ghost text-xs"
                >Rejoin</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-gray-400">
        Meetings use browser WebRTC (no recordings stored). Signed in as <b>{info?.current?.label ?? "you"}</b>.
      </p>
    </div>
  );
}

function ConnectInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const tab = (TABS.find((t) => t.id === sp.get("tab"))?.id ?? "find") as (typeof TABS)[number]["id"];
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Connect with Industry. Learn from Experience."
        subtitle="Discover professionals, book mentorship sessions, attend weekend masterclasses, and grow your professional network."
      />
      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <div className="card flex flex-col">
          <h2 className="h2">Connect with Peers</h2>
          <p className="mt-1 flex-1 text-sm text-slate-500">Study, pair-program and discuss with fellow students on the GURUKOOL collaboration platform.</p>
          <div className="mt-3">
            {CONNECT_URL
              ? <a href={CONNECT_URL} target="_blank" rel="noopener noreferrer" className="btn-primary">Open peer collaboration ↗</a>
              : <p className="text-sm text-amber-700">Video collaboration is not configured. Please contact the administrator.</p>}
          </div>
        </div>
        <div className="card flex flex-col">
          <h2 className="h2">Connect with Experts</h2>
          <p className="mt-1 flex-1 text-sm text-slate-500">Browse admin-verified industry experts below, view their background and availability, and request a weekend mentorship session.</p>
          <div className="mt-3"><button className="btn-ghost" onClick={() => router.replace("/connect?tab=find", { scroll: false })}>Find an expert ↓</button></div>
        </div>
      </div>
      <div role="tablist" className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id} role="tab" aria-selected={tab === t.id}
            onClick={() => router.replace(`/connect?tab=${t.id}`, { scroll: false })}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${tab === t.id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >{t.label}</button>
        ))}
      </div>
      {tab === "find" && <FindMentors />}
      {tab === "sessions" && <MySessions />}
      {tab === "meetings" && <Meetings />}
      {tab === "network" && <IndustryNetwork />}
      <p className="mt-10 text-xs text-slate-400">All times are in IST (Asia/Kolkata). Profiles marked “Demo · fictional” are illustrative and do not represent real people or companies.</p>
    </div>
  );
}

export default function ConnectPage() {
  return <Suspense fallback={<div className="text-sm text-slate-500"><Spinner /> Loading…</div>}><ConnectInner /></Suspense>;
}
