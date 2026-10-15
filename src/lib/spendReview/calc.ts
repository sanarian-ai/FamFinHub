import { MIN_TX, type Group, type SrData, type SrTx } from "./types";

export type Person = "all" | "0" | "1";
export type PType = "month" | "range" | "year" | "fy";
export type Mode = "sum" | "avg";

/** Everything the numbers depend on. Serialisable so it can be persisted. */
export type Opts = {
  ptype: PType;
  month: number;
  from: number;
  to: number;
  year: number;
  fy: number; // fiscal year start year (FY 2025-26 -> 2025)
  person: Person;
  sep: boolean; // separate large one-time charges
  T: number; // ₹ limit for "large" (0 = none)
  mult: number; // multiple of the category's usual charge (0 = none)
  spread: boolean; // planned recurring: spread monthly vs as paid
  plan: Record<string, boolean>; // category id -> user override of "planned recurring"
  expected: string[]; // category ids the user marked "expected" (hidden from movers)
  /** Temporary "leave it out" lens (never persisted). Keys: g:<group> n:<nature> t:<nature>›<type> c:<catIndex> L (large charges). */
  hidden: string[];
};

export const GROUPS: Record<Group, string> = { committed: "Committed", controllable: "Controllable", planned: "Vacation", other: "Income tax & one-off" };
export const GKEYS: Group[] = ["committed", "controllable", "planned", "other"];
/** One-tap scenarios. "Typical month" leaves planned recurring items (school fees, maintenance) in. */
export const PRESETS: { name: string; keys: string[]; tip: string }[] = [
  { name: "Typical month", keys: ["g:other", "g:planned", "L"], tip: "Hides tax & one-off, vacation and large one-time charges" },
  { name: "Without tax & one-offs", keys: ["g:other"], tip: "" },
  { name: "Without trips", keys: ["g:planned"], tip: "" },
  { name: "Without large charges", keys: ["L"], tip: "" },
];
export const GSUB: Record<Group, string> = {
  committed: "household, kids' education, medical, insurance",
  controllable: "discretionary, incl. Learning",
  planned: "trips",
  other: "tax and one-off events",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const med = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0;
};

/** Compact rupee format: ₹950, ₹45k, ₹1.25L, ₹1.2Cr */
export const inr = (v: number) => {
  const a = Math.abs(v);
  const s = v < 0 ? "-" : "";
  if (a >= 1e7) return s + "₹" + (a / 1e7).toFixed(2).replace(/\.?0+$/, "") + "Cr";
  if (a >= 99500) return s + "₹" + (a / 1e5).toFixed(a >= 1e6 ? 1 : 2).replace(/\.?0+$/, "") + "L";
  if (a >= 1e3) return s + "₹" + Math.round(a / 1e3) + "k";
  return s + "₹" + Math.round(a);
};
/** Full rupee format with Indian digit grouping: ₹12,34,567 (deterministic, no Intl). */
export const full = (v: number) => {
  const n = Math.round(Math.abs(v)).toString();
  const last3 = n.slice(-3);
  const rest = n.slice(0, -3);
  const g = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3;
  return (v < 0 ? "-" : "") + "₹" + g;
};
export const cleanDesc = (d: string) => {
  const p = d.split("/");
  if (/^UPI$/i.test(p[0]) && p[1]) return p[1].trim();
  if (/^BIL$/i.test(p[0]) && p[3]) return p[3].trim();
  if (/^(GIB|NEFT|RTGS|IMPS)$/i.test(p[0])) return p[0] + " " + (p[2] || "").slice(0, 18);
  return d.trim().slice(0, 34);
};

export type Period = { s: number; e: number; label: string; prev: [number, number] | null; prevLabel: string };

export function monthLabels(months: string[]) {
  const parts = (m: number) => {
    const [y, mo] = months[m].split("-").map(Number);
    return { y, mo };
  };
  return {
    ml: (m: number) => `${MONTHS[parts(m).mo - 1]} ${String(parts(m).y).slice(2)}`,
    mlong: (m: number) => `${LONG[parts(m).mo - 1]} ${parts(m).y}`,
    shiftLabel: (m: number, k: number) => {
      const { y, mo } = parts(m);
      const t = y * 12 + (mo - 1) + k;
      return `${MONTHS[t % 12]} ${String(Math.floor(t / 12)).slice(2)}`;
    },
  };
}

/** Ledger deep link for a category over a period (real txnDate range; `to` is inclusive of the day). */
export function ledgerHref(D: SrData, categoryId: string, s: number, e: number) {
  const [y0, m0] = D.months[s].split("-").map(Number);
  const [y1, m1] = D.months[e].split("-").map(Number);
  const lastDay = new Date(Date.UTC(y1, m1, 0)).getUTCDate();
  const p = (n: number) => String(n).padStart(2, "0");
  return `/ledger?categoryId=${encodeURIComponent(categoryId)}&from=${y0}-${p(m0)}-01&to=${y1}-${p(m1)}-${p(lastDay)}&includeHistorical=1`;
}

export function defaultOpts(D: SrData): Opts {
  const N = D.months.length;
  const last = D.partialLast && N > 1 ? N - 2 : N - 1;
  const [ly, lm] = D.months[last].split("-").map(Number);
  return {
    ptype: "month",
    month: last,
    from: Math.max(0, last - 11),
    to: last,
    year: ly,
    fy: lm >= 4 ? ly : ly - 1,
    person: "all",
    sep: true,
    T: 50000,
    mult: 3,
    spread: true,
    plan: {},
    expected: [],
    hidden: [],
  };
}

export type ChartSeries = { label: string; color?: string; hatch?: boolean; dim?: boolean; stroke?: boolean; vals: number[] };

export function createEngine(D: SrData, o: Opts) {
  const N = D.months.length;
  const CATS = D.cats;
  const TX = D.tx;
  const L10 = monthLabels(D.months);
  const mask = o.person === "all" ? [0, 1, 2] : [+o.person];

  // ---- period
  // The in-progress month would drag year / fiscal-year averages down, so those views stop at the last complete month.
  const lastFull = D.partialLast && N > 1 ? N - 2 : N - 1;
  const period = (): Period => {
    const { ptype } = o;
    if (ptype === "month") {
      const m = Math.min(Math.max(o.month, 0), N - 1);
      return { s: m, e: m, label: L10.mlong(m), prev: m > 0 ? [Math.max(0, m - 3), m - 1] : null, prevLabel: "the prior 3 months' average" };
    }
    if (ptype === "range") {
      const s = Math.min(o.from, o.to), e = Math.max(o.from, o.to), L = e - s + 1;
      return { s, e, label: `${L10.mlong(s)} – ${L10.mlong(e)}`, prev: s - L >= 0 ? [s - L, s - 1] : null, prevLabel: `the previous ${L} months` };
    }
    if (ptype === "year") {
      const idx = D.months.map((m, i) => (m.startsWith(o.year + "-") ? i : -1)).filter((i) => i >= 0);
      const s = idx.length ? idx[0] : 0, e = Math.max(s, Math.min(lastFull, idx.length ? idx[idx.length - 1] : N - 1));
      return { s, e, label: `Calendar ${o.year}`, prev: s - 12 >= 0 ? [s - 12, e - 12] : null, prevLabel: `the same months of ${o.year - 1}` };
    }
    const first = D.months.findIndex((m) => m === `${o.fy}-04`);
    const s = first < 0 ? 0 : first;
    const e = Math.max(s, Math.min(s + 11, lastFull));
    return { s, e, label: `FY ${o.fy}-${String(o.fy + 1).slice(2)}`, prev: s - 12 >= 0 ? [s - 12, e - 12] : null, prevLabel: `the same months of FY ${o.fy - 1}-${String(o.fy).slice(2)}` };
  };
  const P = period();
  const len = (p: Period = P) => p.e - p.s + 1;

  // ---- tx grouped by category (once)
  const txByCat: SrTx[][] = CATS.map(() => []);
  for (const t of TX) txByCat[t.c].push(t);
  const inMask = (t: SrTx) => mask.includes(t.h);

  // ---- planned recurring: detected on the 12 months to the period end, then user overrides
  const PLANNED = new Set<number>();
  CATS.forEach((c, i) => {
    const tx = txByCat[i].filter((t) => t.m >= P.e - 11 && t.m <= P.e && inMask(t));
    const ms = [...new Set(tx.map((t) => t.m))].sort((a, b) => a - b);
    if (ms.length < 3) return;
    const am = tx.map((t) => t.a);
    const mean = sum(am) / am.length;
    const sd = Math.sqrt(sum(am.map((a) => (a - mean) ** 2)) / am.length);
    const mg = med(ms.slice(1).map((m, k) => m - ms[k]));
    if (mean >= 25000 && sd / mean <= 0.5 && mg >= 2) PLANNED.add(i);
  });
  // Seeded rule: school fees are paid quarterly, so they are planned recurring unless the user says otherwise.
  CATS.forEach((c, i) => {
    const ov = o.plan[c.id];
    const seeded = c.n === "Kids School Fees" && ov === undefined;
    if (ov === true || seeded) PLANNED.add(i);
    else if (ov === false) PLANNED.delete(i);
  });

  // ---- large one-time charges
  const LG: number[][][] = CATS.map(() => [Array(N).fill(0), Array(N).fill(0), Array(N).fill(0)]);
  const FLAGGED: SrTx[] = [];
  for (const t of TX) {
    const c = CATS[t.c];
    if (PLANNED.has(t.c)) continue;
    const byLimit = o.T > 0 && t.a >= o.T;
    const byMultiple = o.mult > 0 && t.a >= Math.max(MIN_TX, 0.5 * o.T) && t.a >= o.mult * c.med;
    if (byLimit || byMultiple) {
      LG[t.c][t.h][t.m] += t.a;
      FLAGGED.push(t);
    }
  }
  const flaggedAllIn = (s: number, e: number) => (o.sep ? FLAGGED.filter((t) => t.m >= s && t.m <= e && inMask(t)) : []);

  // ---- hide model: a key addresses a bucket, a nature, a type, one category, or the large-charge layer
  const hidden = new Set(o.hidden);
  const natG: Record<string, Group> = {}, typG: Record<string, Group> = {};
  CATS.forEach((c) => { natG[c.nat] ??= c.g; typG[c.nat + "›" + c.t] ??= c.g; });
  const hkKind = (k: string) => ({ g: "bucket", n: "nature", t: "type", c: "category", L: "large charges" } as Record<string, string>)[k[0]];
  const hkVal = (k: string) => k.slice(2);
  const hkLabel = (k: string) => {
    const t = k[0], v = hkVal(k);
    if (t === "g") return GROUPS[v as Group];
    if (t === "n") return v;
    if (t === "t") return v.split("›")[1];
    if (t === "c") return CATS[+v]?.n ?? v;
    return "Large one-time charges";
  };
  const hkGroup = (k: string): Group | null => {
    const t = k[0], v = hkVal(k);
    if (t === "g") return v as Group;
    if (t === "n") return natG[v] ?? null;
    if (t === "t") return typG[v] ?? null;
    if (t === "c") return CATS[+v]?.g ?? null;
    return null;
  };
  const keyCats = (k: string) => {
    const t = k[0], v = hkVal(k);
    const out = new Set<number>();
    if (t === "L") return out;
    CATS.forEach((c, i) => {
      if (t === "g" ? c.g === v : t === "n" ? c.nat === v : t === "t" ? c.nat + "›" + c.t === v : i === +v) out.add(i);
    });
    return out;
  };
  const isHidS = (i: number, set: Set<string>) => { const c = CATS[i]; return set.has("g:" + c.g) || set.has("n:" + c.nat) || set.has("t:" + c.nat + "›" + c.t) || set.has("c:" + i); };
  const isHid = (i: number) => isHidS(i, hidden);
  const hidBy = (i: number) => { const c = CATS[i]; return ["c:" + i, "t:" + c.nat + "›" + c.t, "n:" + c.nat, "g:" + c.g].find((k) => hidden.has(k)) ?? null; };
  const LH = () => o.sep && hidden.has("L");
  /** New hidden list after toggling `k`; hiding a wider key drops narrower keys it already covers. */
  const toggleKey = (cur: string[], k: string) => {
    const set = new Set(cur);
    if (set.has(k)) { set.delete(k); return [...set]; }
    const a = keyCats(k);
    [...set].forEach((b) => { if (b === "L" || k === "L") return; if ([...keyCats(b)].every((x) => a.has(x))) set.delete(b); });
    set.add(k);
    return [...set];
  };
  /** Un-hide everything inside `k` (used when a partly-hidden node is ticked again). */
  const clearInside = (cur: string[], k: string) => {
    const kc = keyCats(k);
    return cur.filter((x) => x === "L" || ![...keyCats(x)].every((i) => kc.has(i)));
  };

  const flaggedIn = (s: number, e: number) => (LH() ? [] : flaggedAllIn(s, e).filter((t) => !isHid(t.c)));

  // ---- totals
  const catTot = (ci: number, s: number, e: number) => {
    let v = 0;
    if (o.spread && PLANNED.has(ci) && o.ptype === "month") {
      for (let m = s; m <= e; m++) {
        let a = 0;
        const q0 = Math.max(0, m - 11);
        for (let q = q0; q <= m; q++) for (const h of mask) a += CATS[ci].by[h][q];
        v += a / (m - q0 + 1);
      }
      return v;
    }
    for (const h of mask) for (let m = s; m <= e; m++) v += CATS[ci].by[h][m];
    return v;
  };
  const catLg = (ci: number, s: number, e: number) => {
    if (!o.sep) return 0;
    let v = 0;
    for (const h of mask) for (let m = s; m <= e; m++) v += LG[ci][h][m];
    return v;
  };
  const catReg = (ci: number, s: number, e: number) => catTot(ci, s, e) - catLg(ci, s, e);
  const vReg = (i: number, s: number, e: number) => (isHid(i) ? 0 : catReg(i, s, e));
  const vLg = (i: number, s: number, e: number) => (isHid(i) || LH() ? 0 : catLg(i, s, e));
  /** Everything, ignoring hides (used to show what a hidden bucket would have been). */
  const groupRegAll = (g: Group, s: number, e: number) => sum(CATS.map((c, i) => (c.g === g ? catReg(i, s, e) : 0)));
  const largeAllRaw = (s: number, e: number) => (o.sep ? sum(CATS.map((c, i) => catLg(i, s, e))) : 0);
  /** Visible (after hides). */
  const groupReg = (g: Group, s: number, e: number) => sum(CATS.map((c, i) => (c.g === g ? vReg(i, s, e) : 0)));
  const largeAll = (s: number, e: number) => (o.sep ? sum(CATS.map((c, i) => vLg(i, s, e))) : 0);
  const chartCat = (ci: number, m: number) =>
    o.spread && PLANNED.has(ci) && o.ptype !== "month" && m >= P.s && m <= P.e ? catTot(ci, P.s, P.e) / len() : catReg(ci, m, m);
  const allV = (i: number, m: number) => chartCat(i, m) + catLg(i, m, m);
  const visV = (i: number, m: number) => (isHid(i) ? 0 : chartCat(i, m) + (LH() ? 0 : catLg(i, m, m)));
  const prevAvg = (fn: (s: number, e: number) => number) => (P.prev ? fn(P.prev[0], P.prev[1]) / (P.prev[1] - P.prev[0] + 1) : null);

  // ---- chart
  const chartWindow = () => (o.ptype === "month" ? { s0: Math.max(0, P.e - 11), e0: P.e } : { s0: P.s, e0: P.e });
  function chart(sel: Group[], drill: Group | null, focus: number | null) {
    const { s0, e0 } = chartWindow();
    const ms: number[] = [];
    for (let m = s0; m <= e0; m++) ms.push(m);
    const ser: ChartSeries[] = [];
    let title = "All buckets";
    const mix = (g: Group, pct: number) => `color-mix(in srgb, var(--sr-${g}) ${pct}%, var(--sr-surface))`;
    if (focus !== null) {
      const c = CATS[focus];
      title = c.n;
      ser.push({ label: c.n + (isHid(focus) ? " (hidden)" : ""), color: `var(--sr-${c.g})`, vals: ms.map((m) => (isHid(focus) ? 0 : chartCat(focus, m))) });
      if (o.sep) ser.push({ label: "Large charges", hatch: true, vals: ms.map((m) => vLg(focus, m, m)) });
    } else if (drill) {
      title = GROUPS[drill];
      const idx = CATS.map((_, i) => i).filter((i) => CATS[i].g === drill && !isHid(i)).map((i) => ({ i, v: catReg(i, P.s, P.e) + vLg(i, P.s, P.e) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
      const top = idx.slice(0, 6), rest = idx.slice(6), pct = [100, 80, 62, 48, 38, 30];
      top.forEach((x, k) => ser.push({ label: CATS[x.i].n, color: mix(drill, pct[k]), vals: ms.map((m) => chartCat(x.i, m)), stroke: true }));
      if (rest.length) ser.push({ label: `${rest.length} other categories`, color: mix(drill, 18), vals: ms.map((m) => sum(rest.map((x) => chartCat(x.i, m)))), stroke: true });
      if (o.sep && !LH()) ser.push({ label: "Large charges in " + GROUPS[drill], hatch: true, vals: ms.map((m) => sum(CATS.map((c, i) => (c.g === drill ? vLg(i, m, m) : 0)))) });
    } else {
      GKEYS.forEach((g) => {
        if (hidden.has("g:" + g)) return;
        ser.push({ label: GROUPS[g], color: `var(--sr-${g})`, dim: sel.length > 0 && !sel.includes(g), vals: ms.map((m) => sum(CATS.map((c, i) => (c.g === g && !isHid(i) ? chartCat(i, m) : 0)))) });
      });
      if (o.sep && !LH()) ser.push({ label: "Large one-time charges", hatch: true, vals: ms.map((m) => sum(CATS.map((_, i) => vLg(i, m, m)))) });
    }
    const scope = focus !== null ? [focus] : drill ? CATS.map((_, i) => i).filter((i) => CATS[i].g === drill) : CATS.map((_, i) => i);
    const ghost = ms.map((m) => sum(scope.map((i) => allV(i, m) - visV(i, m))));
    const totals = ms.map((_, i) => sum(ser.map((q) => q.vals[i])));
    const inWin = ms.map((m) => o.ptype === "month" || (m >= P.s && m <= P.e));
    const win = totals.filter((_, i) => inWin[i]);
    const avgT = win.length ? sum(win) / win.length : 0;
    const w3 = totals.map((v, i) => v + ghost[i]).filter((_, i) => inWin[i]);
    const avgAll = w3.length ? sum(w3) / w3.length : 0;
    let selAvg: number | null = null;
    if (sel.length && !drill && focus === null) {
      const sv = ms.map((m) => sum(CATS.map((c, i) => (sel.includes(c.g) && !isHid(i) ? chartCat(i, m) + (LH() ? 0 : catLg(i, m, m)) : 0))));
      const w2 = sv.filter((_, i) => inWin[i]);
      selAvg = sum(w2) / Math.max(1, w2.length);
    }
    return { ms, ser, title, totals, ghost, avgT, avgAll, selAvg, inWin };
  }

  // ---- lens: what the average per month becomes if a set of keys were hidden (chart window, same basis as the average lines)
  function visAvg(set: Set<string>) {
    const { s0, e0 } = chartWindow();
    let v = 0;
    for (let m = s0; m <= e0; m++) for (let i = 0; i < CATS.length; i++) {
      if (isHidS(i, set)) continue;
      v += chartCat(i, m) + (set.has("L") && o.sep ? 0 : catLg(i, m, m));
    }
    return v / (e0 - s0 + 1);
  }
  function lens() {
    const base = visAvg(new Set());
    const acc = new Set<string>();
    let prev = base;
    const steps = o.hidden.map((k) => { acc.add(k); const v = visAvg(acc); const d = prev - v; prev = v; return { k, d }; });
    return { base, cur: prev, steps };
  }
  /** Average per month (chart window, all-in) of one category; drives the amounts in the hide tree. */
  const catAvg = (i: number) => {
    const { s0, e0 } = chartWindow();
    let v = 0;
    for (let m = s0; m <= e0; m++) v += allV(i, m);
    return v / (e0 - s0 + 1);
  };

  // ---- combined selection summary
  function selSeries(sel: Group[], incLarge: boolean) {
    const out: number[] = [];
    for (let m = P.s; m <= P.e; m++) out.push(sum(CATS.map((c, i) => (sel.includes(c.g) && !isHid(i) ? chartCat(i, m) + (incLarge && !LH() ? catLg(i, m, m) : 0) : 0))));
    return out;
  }

  // ---- planned recurring panel
  function plannedItems() {
    return [...PLANNED]
      .filter((i) => !isHid(i))
      .map((i) => {
        const tx = txByCat[i].filter((x) => x.m >= P.e - 11 && x.m <= P.e && inMask(x)).sort((a, b) => a.m - b.m);
        const ms = [...new Set(tx.map((x) => x.m))];
        const gaps = ms.slice(1).map((m, k) => m - ms[k]);
        let yr = 0;
        for (const h of mask) for (let m = Math.max(0, P.e - 11); m <= P.e; m++) yr += CATS[i].by[h][m];
        return { i, n: tx.length, typ: med(tx.map((x) => x.a)), gap: med(gaps), yr, last: ms.length ? ms[ms.length - 1] : null };
      })
      .sort((a, b) => b.yr - a.yr);
  }

  // ---- movers
  const expected = new Set(o.expected);
  function movers() {
    if (!P.prev) return null;
    const L = len(), PL = P.prev[1] - P.prev[0] + 1;
    const out: { c: (typeof CATS)[number]; i: number; cur: number; prev: number; d: number; r: number }[] = [];
    CATS.forEach((c, i) => {
      if (c.g === "other" || c.g === "planned" || expected.has(c.id) || isHid(i)) return;
      const cur = catReg(i, P.s, P.e) / L, prev = catReg(i, P.prev![0], P.prev![1]) / PL;
      out.push({ c, i, cur, prev, d: cur - prev, r: prev > 0 ? cur / prev : Infinity });
    });
    return out;
  }
  const monthlyReg = (i: number, s: number, e: number) => {
    const v: number[] = [];
    for (let m = s; m <= e; m++) v.push(catReg(i, m, m));
    return v;
  };

  // ---- savings opportunities (Discretionary categories that are rising, recurring or subscriptions)
  function opportunities() {
    const L = len();
    const mv = movers() ?? [];
    const byI = new Map(mv.map((x) => [x.i, x]));
    const out: { c: (typeof CATS)[number]; i: number; v: number; annual: number; tags: string[]; top?: SrTx; ly: number | null }[] = [];
    CATS.forEach((c, i) => {
      if (c.nat !== "Discretionary Expense" || isHid(i)) return;
      const v = catReg(i, P.s, P.e);
      if (v <= 0) return;
      const act = [...Array(L).keys()].filter((k) => catReg(i, P.s + k, P.s + k) > 0).length;
      const tags: string[] = [];
      const x = byI.get(i);
      if (x && x.d >= 1000 && (x.prev < 500 || x.r >= 1.4)) tags.push(x.prev < 500 ? "new this period" : `running ${x.r.toFixed(1)}x the previous level`);
      if (L >= 3 && act >= 0.7 * L && v / L >= 1500) tags.push(`recurring, charged in ${act} of ${L} months`);
      if (/subscription/i.test(c.n) || /subscription/i.test(c.t)) tags.push("subscription category");
      if (!tags.length) return;
      const annual = (v * 12) / L;
      if (annual < 24000) return;
      const top = txByCat[i].filter((t) => t.m >= P.s && t.m <= P.e && inMask(t)).sort((a, b) => b.a - a.a)[0];
      const ly = P.s - 12 >= 0 ? catReg(i, P.s - 12, P.e - 12) : null;
      out.push({ c, i, v, annual, tags, top, ly });
    });
    return out.sort((a, b) => b.annual - a.annual).slice(0, 6);
  }

  return {
    D, N, CATS, TX, P, len, mask, L10, lastFull, PLANNED, FLAGGED, flaggedIn, flaggedAllIn,
    catTot, catLg, catReg, groupReg, groupRegAll, largeAll, largeAllRaw, prevAvg, chart, selSeries, plannedItems, movers, monthlyReg, opportunities,
    isMonthView: o.ptype === "month", hidden, isHid, hidBy, hkKind, hkLabel, hkGroup, keyCats, toggleKey, clearInside, lens, catAvg, LH,
    topTx: (ci: number, s: number, e: number, n: number) => txByCat[ci].filter((t) => t.m >= s && t.m <= e && inMask(t)).sort((a, b) => b.a - a.a).slice(0, n),
  };
}
export type Engine = ReturnType<typeof createEngine>;
