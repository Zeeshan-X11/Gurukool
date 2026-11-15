// Skill prerequisite graph (a DAG) and graph algorithms used by the roadmap planner.
// Edges point from a skill to the skills that must be learned before it.

export const PREREQUISITES: Record<string, string[]> = {
  JavaScript: [],
  HTML: [],
  Python: [],
  Git: [],
  SQL: [],
  "Data Structures & Algorithms": [],
  "Linear Algebra & Statistics": [],
  CSS: ["HTML"],
  "Node.js": ["JavaScript"],
  TypeScript: ["JavaScript"],
  MongoDB: ["JavaScript"],
  "REST APIs": ["Node.js"],
  "Authentication & Security": ["REST APIs"],
  Docker: ["Git"],
  "System Design": ["REST APIs", "SQL", "Data Structures & Algorithms"],
  React: ["JavaScript", "HTML", "CSS"],
  "Tailwind CSS": ["CSS"],
  "Responsive Design": ["CSS"],
  "Web Accessibility": ["HTML"],
  "Next.js": ["React"],
  "Deployment & Cloud": ["Git"],
  "NumPy & Pandas": ["Python"],
  "Data Visualization": ["NumPy & Pandas"],
  "Machine Learning": ["NumPy & Pandas", "Linear Algebra & Statistics"],
  "Deep Learning": ["Machine Learning"],
  PyTorch: ["Deep Learning"],
  "LLMs & Prompt Engineering": ["Deep Learning"],
  MLOps: ["Machine Learning", "Docker"],
};

export class CycleError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`Prerequisite cycle detected: ${cycle.join(" → ")}`);
  }
}

/** All skills needed to reach `targets`, including transitive prerequisites. O(V + E). */
export function prerequisiteClosure(targets: string[], graph = PREREQUISITES): Set<string> {
  const out = new Set<string>();
  const stack = [...targets];
  while (stack.length) {
    const s = stack.pop()!;
    if (out.has(s)) continue;
    out.add(s);
    for (const p of graph[s] ?? []) stack.push(p);
  }
  return out;
}

/** Throws CycleError if the graph is not a DAG (three-colour DFS). */
export function assertAcyclic(graph = PREREQUISITES) {
  const colour = new Map<string, 0 | 1 | 2>(); // 0 new, 1 on stack, 2 done
  const path: string[] = [];
  const visit = (n: string) => {
    colour.set(n, 1);
    path.push(n);
    for (const p of graph[n] ?? []) {
      const c = colour.get(p) ?? 0;
      if (c === 1) throw new CycleError([...path.slice(path.indexOf(p)), p]);
      if (c === 0) visit(p);
    }
    path.pop();
    colour.set(n, 2);
  };
  for (const n of Object.keys(graph)) if (!colour.get(n)) visit(n);
}

/** Binary max-heap keyed by priority; ties broken by name for deterministic output. */
class MaxHeap<T extends { key: number; name: string }> {
  private a: T[] = [];
  get size() { return this.a.length; }
  private better = (i: number, j: number) =>
    this.a[i].key > this.a[j].key || (this.a[i].key === this.a[j].key && this.a[i].name < this.a[j].name);
  push(x: T) {
    this.a.push(x);
    let i = this.a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.better(i, p)) break;
      [this.a[i], this.a[p]] = [this.a[p], this.a[i]];
      i = p;
    }
  }
  pop(): T {
    const top = this.a[0];
    const last = this.a.pop()!;
    if (this.a.length) {
      this.a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.a.length && this.better(l, m)) m = l;
        if (r < this.a.length && this.better(r, m)) m = r;
        if (m === i) break;
        [this.a[i], this.a[m]] = [this.a[m], this.a[i]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Priority-aware topological sort (Kahn's algorithm with a max-heap).
 * Every skill appears after all of its prerequisites that are in `nodes`;
 * among skills whose prerequisites are satisfied, the most urgent comes first.
 * O((V + E) log V).
 */
export function prioritizedTopoSort(nodes: Set<string>, urgency: (s: string) => number, graph = PREREQUISITES): string[] {
  const indeg = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const n of nodes) {
    const pre = (graph[n] ?? []).filter((p) => nodes.has(p));
    indeg.set(n, pre.length);
    for (const p of pre) dependents.set(p, [...(dependents.get(p) ?? []), n]);
  }
  const heap = new MaxHeap<{ key: number; name: string }>();
  for (const [n, d] of indeg) if (d === 0) heap.push({ key: urgency(n), name: n });
  const order: string[] = [];
  while (heap.size) {
    const { name } = heap.pop();
    order.push(name);
    for (const d of dependents.get(name) ?? []) {
      const left = indeg.get(d)! - 1;
      indeg.set(d, left);
      if (left === 0) heap.push({ key: urgency(d), name: d });
    }
  }
  if (order.length !== nodes.size) throw new CycleError([...nodes].filter((n) => !order.includes(n)));
  return order;
}
