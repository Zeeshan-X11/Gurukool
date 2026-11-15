// GET /api/jobs?q=<query>&location=<location>&remote=true
// Uses Remotive API (free, no key needed) for remote tech jobs
// Falls back to Adzuna if ADZUNA_APP_ID + ADZUNA_APP_KEY are set
import { NextResponse } from "next/server";

type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  salary: string;
  postedAt: string;
  tags: string[];
  remote: boolean;
};

async function fetchRemotive(q: string): Promise<Job[]> {
  const search = q ? `&search=${encodeURIComponent(q)}` : "";
  const url = `https://remotive.com/api/remote-jobs?category=software-dev&limit=30${search}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error("Remotive fetch failed");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.jobs ?? []).map((j: any) => ({
    id: String(j.id),
    title: j.title ?? "",
    company: j.company_name ?? "",
    location: j.candidate_required_location || "Remote",
    url: j.url ?? "",
    salary: j.salary || "",
    postedAt: j.publication_date ?? "",
    tags: Array.isArray(j.tags) ? j.tags.slice(0, 6) : [],
    remote: true,
  }));
}

async function fetchAdzuna(q: string, location: string): Promise<Job[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) return [];
  const country = "in";
  const what = encodeURIComponent(q || "software engineer");
  const where = encodeURIComponent(location || "india");
  const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${appId}&app_key=${appKey}&results_per_page=20&what=${what}&where=${where}&content-type=application/json`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.results ?? []).map((j: any) => ({
    id: j.id ?? String(Math.random()),
    title: j.title ?? "",
    company: j.company?.display_name ?? "",
    location: j.location?.display_name ?? location,
    url: j.redirect_url ?? "",
    salary: j.salary_min ? `₹${Math.round(j.salary_min / 100000)}–${Math.round((j.salary_max || j.salary_min) / 100000)} LPA` : "",
    postedAt: j.created ?? "",
    tags: [],
    remote: false,
  }));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const location = searchParams.get("location") ?? "";
  const remoteOnly = searchParams.get("remote") === "true";

  try {
    // Try Adzuna first (India jobs), then Remotive (remote jobs)
    const [adzuna, remotive] = await Promise.allSettled([
      fetchAdzuna(q, location),
      fetchRemotive(q),
    ]);

    const adzunaJobs = adzuna.status === "fulfilled" ? adzuna.value : [];
    const remotiveJobs = remotive.status === "fulfilled" ? remotive.value : [];

    let jobs: Job[] = remoteOnly
      ? remotiveJobs
      : [...adzunaJobs, ...remotiveJobs];

    // Deduplicate by title+company
    const seen = new Set<string>();
    jobs = jobs.filter((j) => {
      const key = `${j.title}::${j.company}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json({ jobs: jobs.slice(0, 40) });
  } catch {
    return NextResponse.json({ jobs: [] });
  }
}
