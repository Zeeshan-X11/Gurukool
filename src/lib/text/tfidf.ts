// Small, dependency-free TF-IDF vector space model used for explainable relevance ranking.
//
//  tf(t,d)  = 1 + ln(count)                    sublinear: the 5th "ai" adds less than the 1st
//  idf(t)   = ln((1 + N) / (1 + df(t))) + 1    smoothed (scikit-learn style): never zero, never divides by zero
//  score    = cos(q, d) = (q · d) / (|q| |d|)  length-normalised, so long descriptions don't win by size
//
// Phrases that matter as a unit ("machine learning") are kept as single tokens, and a small synonym
// table folds common variants together before weighting.
const STOP = new Set(("a an and are as at be by for from has have in into is it its of on or our the this to with your you we " +
  "hackathon hackathons challenge online virtual global edition season build").split(" "));

const PHRASES: [RegExp, string][] = [
  [/\bai\/ml\b/g, "ai machine_learning"],
  [/\bmachine[\s-]learning\b|\bml\b/g, "machine_learning"], [/\bartificial intelligence\b|\bgen(erative)?[\s-]?ai\b|\bllms?\b/g, "ai"],
  [/\bdeep[\s-]learning\b/g, "deep_learning"], [/\bdata[\s-]science\b/g, "data_science"], [/\bopen[\s-]source\b/g, "open_source"],
  [/\bfull[\s-]stack\b/g, "web"], [/\bfront[\s-]?end\b|\bback[\s-]?end\b/g, "web"], [/\bcyber[\s-]?security\b|\bsecurity\b/g, "cybersecurity"],
  [/\bblock[\s-]?chain\b|\bweb3\b|\bcrypto\b/g, "blockchain"], [/\bdev[\s-]?ops\b|\bcloud\b|\bdocker\b/g, "devops"],
  [/\binternet of things\b/g, "iot"], [/\bnode\.?js\b|\breact\b|\bnext\.?js\b|\bhtml\b|\bcss\b|\bjavascript\b/g, "web"],
[/\bpython\b|\bpytorch\b|\bnumpy\b|\bpandas\b/g, "python"],
  [/\bsql\b|\bmongodb\b|\bdatabases?\b/g, "databases"], [/\bmobile apps?\b|\bandroid\b|\bios\b/g, "mobile"],
  [/\bgames?\b|\bgaming\b/g, "gaming"], [/\bhealth ?care\b|\bmedical\b|\bhealth\b/g, "health"], [/\bfinance\b|\bfintech\b/g, "fintech"],
  [/\bedtech\b|\beducation(al)?\b|\blearning\b/g, "education"],
];

export function tokenize(text: string): string[] {
  let s = ` ${text.toLowerCase()} `;
  for (const [re, rep] of PHRASES) s = s.replace(re, ` ${rep} `);
  return s.split(/[^a-z0-9_+#]+/).filter((t) => t.length > 1 && !STOP.has(t) && !/^\d+$/.test(t));
}

export type Vector = Map<string, number>;
export type FieldDoc = { text: string; weight: number }[];

export class TfIdf {
  private idf = new Map<string, number>();
  private n = 0;

  fit(docs: string[][]): this {
    this.n = docs.length;
    const df = new Map<string, number>();
    for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
    this.idf = new Map([...df].map(([t, c]) => [t, Math.log((1 + this.n) / (1 + c)) + 1]));
    return this;
  }

  idfOf(t: string) {
    return this.idf.get(t) ?? Math.log(1 + this.n) + 1; // unseen term: maximal rarity
  }

  /** Weighted bag of fields (e.g. themes count double) → L2-normalised TF-IDF vector. */
  vector(fields: FieldDoc): Vector {
    const tf = new Map<string, number>();
    for (const f of fields) for (const t of tokenize(f.text)) tf.set(t, (tf.get(t) ?? 0) + f.weight);
    const v: Vector = new Map([...tf].map(([t, c]) => [t, (1 + Math.log(c)) * this.idfOf(t)]));
    const norm = Math.sqrt([...v.values()].reduce((a, x) => a + x * x, 0));
    if (norm) for (const [t, x] of v) v.set(t, x / norm);
    return v;
  }
}

/** Cosine similarity of two normalised vectors plus the terms that contributed most (for "why"). */
export function cosine(a: Vector, b: Vector, topK = 3): { score: number; terms: string[] } {
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  const contrib: [string, number][] = [];
  let dot = 0;
  for (const [t, x] of small) {
    const y = big.get(t);
    if (y) { dot += x * y; contrib.push([t, x * y]); }
  }
  return { score: dot, terms: contrib.sort((p, q) => q[1] - p[1]).slice(0, topK).map(([t]) => t.replace(/_/g, " ")) };
}
