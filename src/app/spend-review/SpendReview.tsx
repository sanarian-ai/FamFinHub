"use client";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { SrData, Group } from "@/lib/spendReview/types";
import {
  createEngine, defaultOpts, GROUPS, GKEYS, GSUB, inr, full, cleanDesc, ledgerHref, sum,
  type Opts, type Mode, type PType,
} from "@/lib/spendReview/calc";
import { TrendChart } from "./TrendChart";
import "./SpendReview.css";

const STORE = "spendReview.v1";
type Saved = Pick<Opts, "person" | "sep" | "T" | "mult" | "spread" | "plan" | "expected"> & { mode: Mode; cut: number };

export type Initial = Partial<Pick<Opts, "person" | "ptype" | "month" | "year" | "fy">>;

export function SpendReview({ data, initial = {} }: { data: SrData; initial?: Initial }) {
  const [o, setO] = useState<Opts>(() => ({ ...defaultOpts(data), ...initial }));
  const [mode, setMode] = useState<Mode>("sum");
  const [cut, setCut] = useState(0.25);
  const [sel, setSel] = useState<Group[]>([]);
  const [drill, setDrill] = useState<Group | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [unticked, setUnticked] = useState<Set<number>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const clickT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  // Preferences + overrides live in this browser only (v1). Read after mount so SSR and first paint match.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const s = JSON.parse(raw) as Partial<Saved>;
        setO((p) => ({
          ...p,
          person: initial.person ?? s.person ?? p.person, sep: s.sep ?? p.sep, T: s.T ?? p.T, mult: s.mult ?? p.mult, spread: s.spread ?? p.spread,
          plan: s.plan ?? p.plan, expected: s.expected ?? p.expected,
        }));
        if (s.mode) setMode(s.mode);
        if (s.cut) setCut(s.cut);
      }
    } catch { /* storage unavailable: run with defaults */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      const s: Saved = { person: o.person, sep: o.sep, T: o.T, mult: o.mult, spread: o.spread, plan: o.plan, expected: o.expected, mode, cut };
      localStorage.setItem(STORE, JSON.stringify(s));
    } catch { /* ignore */ }
  }, [loaded, o, mode, cut]);

  const eng = useMemo(() => createEngine(data, o), [data, o]);
  const { P, CATS, N, L10 } = eng;
  const L = eng.len();
  const set = <K extends keyof Opts>(k: K, v: Opts[K]) => setO((p) => ({ ...p, [k]: v }));
  const mo = (v: number) => (mode === "avg" ? v / L : v);
  const sfx = mode === "avg" ? "/mo" : "";
  const personName = o.person === "all" ? "Household" : o.person === "0" ? data.holders[0] : data.holders[1];

  const monthIdx = [...Array(N).keys()].reverse();
  const years = [...new Set(data.months.map((m) => +m.slice(0, 4)))].sort((a, b) => b - a);
  const fys = [...new Set(data.months.map((m) => { const [y, mm] = m.split("-").map(Number); return mm >= 4 ? y : y - 1; }))].sort((a, b) => b - a);
  const lastLbl = L10.ml(N - 1);

  // ---- headline numbers
  const tot = sum(GKEYS.map((g) => eng.groupReg(g, P.s, P.e)));
  const lg = eng.largeAll(P.s, P.e);
  const all = tot + lg;
  const cm = eng.groupReg("committed", P.s, P.e), kc = eng.groupReg("controllable", P.s, P.e);
  const pct = (v: number) => (tot ? Math.round((v / tot) * 100) + "%" : "0%");
  const flagged = eng.flaggedIn(P.s, P.e);
  const nL = flagged.length;
  const plannedNames = [...eng.PLANNED].map((i) => CATS[i].n);

  // ---- tile interactions
  const toggleSel = (g: Group) => setSel((s) => (s.includes(g) ? s.filter((x) => x !== g) : [...s, g]));
  const doDrill = (g: Group) => { setDrill((d) => (d === g ? null : g)); setFocus(null); };
  const chart = eng.chart(sel, drill, focus);

  const goFocus = (i: number) => {
    setFocus(i);
    requestAnimationFrame(() => chartRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  const ledger = (ci: number) => ledgerHref(data, CATS[ci].id, P.s, P.e);

  // ---- selection summary
  const selA = sel.length ? eng.selSeries(sel, true) : [];
  const selB = sel.length ? eng.selSeries(sel, false) : [];
  const selTot = sum(selA), selTotEx = sum(selB), selAct = selA.filter((v) => v > 0).length;

  // ---- drill table rows
  const rows = CATS.map((c, i) => ({ c, i, v: eng.catReg(i, P.s, P.e), lg: eng.catLg(i, P.s, P.e) }))
    .filter((r) => (r.v > 0 || r.lg > 0) && (drill ? r.c.g === drill : !sel.length || sel.includes(r.c.g)))
    .sort((a, b) => b.v + b.lg - (a.v + a.lg));
  const tableTitle = drill ? GROUPS[drill] + " (drilled)" : sel.length ? sel.map((g) => GROUPS[g]).join(" + ") : "All groups";

  // ---- movers / opportunities
  const mv = eng.movers();
  const up = mv ? mv.filter((x) => x.d >= 2000 && (x.prev < 500 || x.r >= 1.4)).sort((a, b) => b.d - a.d).slice(0, 8) : [];
  const down = mv ? mv.filter((x) => x.d <= -2000 && x.r <= 0.6).sort((a, b) => a.d - b.d).slice(0, 3) : [];
  const opps = eng.opportunities();
  const oppTotal = opps.reduce((t, x) => (unticked.has(x.i) ? t : t + x.annual * cut), 0);
  const planned = eng.plannedItems();

  const spark = (i: number, g: Group) => {
    const s = Math.max(0, P.e - 11);
    const v = eng.monthlyReg(i, s, P.e);
    const mx = Math.max(...v, 1);
    return (
      <svg viewBox={`0 0 ${v.length * 11} 30`} width={v.length * 11} height={30} role="img" aria-label="Last 12 months">
        {v.map((q, k) => (
          <rect key={k} x={k * 11} y={28 - (28 * q) / mx} width={8} height={Math.max(q > 0 ? 2 : 0, (28 * q) / mx)} rx={1.5}
            fill={`var(--sr-${g})`} opacity={k >= v.length - Math.min(v.length, L) ? 1 : 0.45} />
        ))}
      </svg>
    );
  };
  const mover = (x: NonNullable<typeof mv>[number], neg: boolean) => (
    <div className="dev" key={x.i}>
      <div className="nm">
        {x.c.n}
        <span className="path">
          {x.c.nat} › {x.c.t}<br />
          <button className="lnk" onClick={() => goFocus(x.i)}>Trend</button>
          <Link className="lnk" href={ledger(x.i)}>Open in Ledger</Link>
          {!neg && <button className="lnk" onClick={() => set("expected", [...o.expected, x.c.id])}>Mark as expected</button>}
        </span>
      </div>
      <div style={{ whiteSpace: "nowrap" }}>
        <span className={`chip ${neg ? "g" : ""}`}>{neg ? "▼ " + Math.round((1 - x.r) * 100) + "%" : x.prev < 500 ? "new" : x.r.toFixed(1) + "x"}</span>{" "}
        <span className="tx">{inr(x.prev)} → {inr(x.cur)} /mo</span>
        {x.c.nat === "Medical" && <span className="tx" style={{ display: "block", marginTop: 2 }}>health, likely needed: watch, not cut</span>}
      </div>
      <div className="mini">{spark(x.i, x.c.g)}</div>
      <div className="num"><b>{x.d > 0 ? "+" : "−"}{inr(Math.abs(x.d))}</b><span className="tx" style={{ display: "block" }}>per month</span></div>
    </div>
  );

  const nextDue = (x: (typeof planned)[number]) => {
    if (x.last === null || !x.gap) return null;
    const g = Math.round(x.gap);
    return `Last paid ${L10.ml(x.last)}, next due about ${L10.shiftLabel(x.last, g)}.`;
  };

  return (
    <div className="sr">
      <div className="wrap">
        <div>
          <h1>Expense Analysis</h1>
          <p className="sub">Expenditure only · ledger through {lastLbl}{data.partialLast ? " (current month is still in progress)" : ""} · grouped by your Expense Natures</p>
          <p className="sub" style={{ marginTop: 4 }}>
            Related: <Link className="lnk" href="/">Dashboard</Link><Link className="lnk" href="/insights">Insights &amp; Trends</Link><Link className="lnk" href="/ledger">Ledger</Link>
          </p>
        </div>

        <section className="panel controls" aria-label="Filters">
          <div className="seg" role="group" aria-label="Period type">
            {([["month", "Month"], ["range", "Range"], ["year", "Calendar year"], ["fy", "Fiscal year"]] as [PType, string][]).map(([k, t]) => (
              <button key={k} aria-pressed={o.ptype === k} onClick={() => set("ptype", k)}>{t}</button>
            ))}
          </div>
          <span className="lab">
            {o.ptype === "month" && (
              <select aria-label="Month" value={o.month} onChange={(e) => set("month", +e.target.value)}>
                {monthIdx.map((m) => <option key={m} value={m}>{L10.mlong(m)}{data.partialLast && m === N - 1 ? " (so far)" : ""}</option>)}
              </select>
            )}
            {o.ptype === "range" && (
              <>
                From <select aria-label="From month" value={o.from} onChange={(e) => set("from", +e.target.value)}>{monthIdx.map((m) => <option key={m} value={m}>{L10.mlong(m)}</option>)}</select>
                To <select aria-label="To month" value={o.to} onChange={(e) => set("to", +e.target.value)}>{monthIdx.map((m) => <option key={m} value={m}>{L10.mlong(m)}</option>)}</select>
              </>
            )}
            {o.ptype === "year" && (
              <select aria-label="Year" value={o.year} onChange={(e) => set("year", +e.target.value)}>
                {years.map((y) => <option key={y} value={y}>{y}{y === years[0] ? ` (to ${lastLbl.split(" ")[0]})` : y === years[years.length - 1] ? " (from Apr)" : ""}</option>)}
              </select>
            )}
            {o.ptype === "fy" && (
              <select aria-label="Fiscal year" value={o.fy} onChange={(e) => set("fy", +e.target.value)}>
                {fys.map((y) => <option key={y} value={y}>FY {y}-{String(y + 1).slice(2)}{y === fys[0] ? ` (to ${lastLbl.split(" ")[0]})` : ""}</option>)}
              </select>
            )}
          </span>
          <label className="lab">Who
            <select id="sr-person" value={o.person} onChange={(e) => set("person", e.target.value as Opts["person"])}>
              <option value="all">Household</option><option value="0">{data.holders[0]}</option><option value="1">{data.holders[1]}</option>
            </select>
          </label>
          <label className="toggle"><input type="checkbox" checked={o.sep} onChange={(e) => set("sep", e.target.checked)} /> Separate large one-time charges</label>
          <span className="lab">Planned recurring</span>
          <div className="seg" role="group" aria-label="Planned recurring treatment">
            <button aria-pressed={o.spread} onClick={() => set("spread", true)}>Spread monthly</button>
            <button aria-pressed={!o.spread} onClick={() => set("spread", false)}>As paid</button>
          </div>
          <div className="seg" role="group" aria-label="Show total or per month">
            <button aria-pressed={mode === "sum"} onClick={() => setMode("sum")}>Total</button>
            <button aria-pressed={mode === "avg"} onClick={() => setMode("avg")}>Per month</button>
          </div>
          <span className="lab">Large means ≥
            <select aria-label="Absolute threshold" value={o.T} onChange={(e) => set("T", +e.target.value)}>
              <option value={0}>no ₹ limit</option><option value={10000}>₹10k</option><option value={25000}>₹25k</option><option value={50000}>₹50k</option><option value={100000}>₹1L</option><option value={200000}>₹2L</option>
            </select>
            or ≥
            <select aria-label="Multiple of usual charge" value={o.mult} onChange={(e) => set("mult", +e.target.value)}>
              <option value={0}>no multiple</option><option value={1.5}>1.5x</option><option value={2}>2x</option><option value={2.5}>2.5x</option><option value={3}>3x</option><option value={4}>4x</option>
            </select>
            <span className="tx">the category&apos;s usual charge (floor ₹7.5k, or half the ₹ limit)</span>
          </span>
        </section>

        <section className="panel" aria-labelledby="sr-h1">
          <div className="panelhead"><div>
            <h2 id="sr-h1">1 · Where the money went</h2>
            <p className="sub">{P.label} · {L} month{L > 1 ? "s" : ""} · {personName}. Compared with {P.prev ? P.prevLabel : "no earlier period in the data"}.</p>
          </div></div>
          <p className="said">
            <b>{P.label}:</b> total spend was <b>{inr(all)}</b>{L > 1 ? ` (${inr(all / L)} a month)` : ""}. Run-rate spend is <b>{inr(tot)}</b>: committed <b>{inr(cm)}</b> ({pct(cm)}) and controllable <b>{inr(kc)}</b> ({pct(kc)}).
            {o.sep && <> {nL} large one-time charge{nL === 1 ? "" : "s"} totalling <b>{inr(lg)}</b> {nL ? (nL === 1 ? "is" : "are") + " shown separately below" : "in this period"}.</>}
            {o.spread && plannedNames.length > 0 && o.ptype === "month" && <> Planned recurring items ({plannedNames.join(", ")}) are shown at their monthly equivalent, not as paid.</>}
          </p>

          <div className="tiles">
            {GKEYS.map((g) => {
              const v = eng.groupReg(g, P.s, P.e), avg = v / L, pa = eng.prevAvg((s, e) => eng.groupReg(g, s, e));
              const rel = pa === null || pa < 500 ? "no comparison" : Math.abs(avg / pa - 1) < 0.08 ? "flat vs prev" : (avg > pa ? "▲ " : "▼ ") + Math.round(Math.abs(avg / pa - 1) * 100) + "% vs prev";
              const on = sel.includes(g);
              return (
                <div key={g} className="tile" role="button" tabIndex={0} aria-pressed={on} data-drill-on={drill === g ? "1" : "0"}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("[data-drill]")) { e.stopPropagation(); doDrill(g); return; }
                    if (clickT.current) clearTimeout(clickT.current);
                    clickT.current = setTimeout(() => toggleSel(g), 230);
                  }}
                  onDoubleClick={() => { if (clickT.current) clearTimeout(clickT.current); doDrill(g); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSel(g); }
                    else if (e.key === "d" || e.key === "D") doDrill(g);
                  }}>
                  <div className="tl"><i className="dot" style={{ background: `var(--sr-${g})` }} />{GROUPS[g]}{on ? " ✓" : ""}<span className="lnk dr" data-drill={g} role="button" tabIndex={0}>Drill ▸</span></div>
                  <div className="amt">{inr(mo(v))}<span className="tx" style={{ fontWeight: 400, fontSize: 12 }}> {sfx}</span></div>
                  <div className="vs">{mode === "avg" ? inr(v) + " total" : inr(avg) + "/mo"} · {rel}</div>
                  <div className="tx" style={{ marginTop: 2 }}>{GSUB[g]}</div>
                </div>
              );
            })}
            {o.sep ? (
              <div className="tile static">
                <div className="tl"><i className="dot hatch" />Large charges</div>
                <div className="amt">{inr(mo(lg))}<span className="tx" style={{ fontWeight: 400, fontSize: 12 }}> {sfx}</span></div>
                <div className="vs">{nL} charge{nL === 1 ? "" : "s"}, not a run rate</div>
              </div>
            ) : (
              <div className="tile static"><div className="tl">Large charges</div><div className="amt">—</div><div className="vs">folded into their groups</div></div>
            )}
          </div>
          <p className="hint">Click a bucket to select it (select several to combine them). Double-click, or use Drill, to open a bucket into its categories.</p>

          {sel.length > 0 && (
            <div className="selbar">
              <span><b>Combined: {sel.map((g) => GROUPS[g]).join(" + ")}</b></span>
              <span>{inr(selTot)} in {L} month{L > 1 ? "s" : ""}</span>
              <span><b>{inr(selTot / L)}/mo</b> average ({inr(selTotEx / L)}/mo without their large charges)</span>
              <span>charged in {selAct} of {L} months{selAct && selAct < L ? `, ${inr(selTot / selAct)}/mo in the months it occurs` : ""}</span>
              <button className="lnk" onClick={() => setSel([])}>clear selection ✕</button>
            </div>
          )}

          <div style={{ marginTop: 16 }} ref={chartRef}>
            <div>
              {drill && <span className="focus">Drilled into <b>{GROUPS[drill]}</b>, top categories shown <button className="lnk" onClick={() => setDrill(null)}>back to all buckets ✕</button></span>}
              {focus !== null && <span className="focus">Chart focused on <b>{CATS[focus].n}</b> <button className="lnk" onClick={() => setFocus(null)}>clear ✕</button></span>}
            </div>
            <div style={{ overflowX: "auto" }}>
              <TrendChart eng={eng} chart={chart} isMonthView={o.ptype === "month"} selectedMonth={P.s}
                onPickMonth={(m) => { setO((p) => ({ ...p, ptype: "month", month: m })); }} />
            </div>
            <div className="legend">
              {chart.ser.map((q, k) => (
                <span key={k}><i className={`dot ${q.hatch ? "hatch" : ""}`} style={q.hatch ? undefined : { background: q.color }} />{q.label}</span>
              ))}
              <span className="tx">
                Dashed line: average of what is stacked, {inr(chart.avgT)} a month over {o.ptype === "month" ? "the 12 months shown" : "the selected period"}
                {chart.selAvg !== null ? `; bold dotted line: the combined selection, ${inr(chart.selAvg)} a month` : ""}. Click a bar to jump to that month.
              </span>
            </div>
          </div>

          {planned.length > 0 && (
            <div>
              <p className="sec">Planned recurring · {planned.length} categor{planned.length === 1 ? "y" : "ies"} · {o.spread ? "spread evenly across months" : "shown as paid"}</p>
              {planned.map((x) => {
                const c = CATS[x.i];
                const cad = x.n >= 2 && x.gap ? `about every ${Math.round(x.gap)} month${Math.round(x.gap) === 1 ? "" : "s"}` : "cadence unclear";
                return (
                  <div className="lg" key={x.i}>
                    <span className="num"><b>{inr(x.yr / 12)}</b><span className="tx"> /mo</span></span>
                    <span><i className="dot" style={{ background: `var(--sr-${c.g})`, marginRight: 6 }} />{c.n} <span className="tx">· {c.nat}</span></span>
                    <span />
                    <span className="d">
                      {x.n} payment{x.n === 1 ? "" : "s"} in the last 12 months, typically {inr(x.typ)}, {cad}; {inr(x.yr)} over the year. {nextDue(x)}{" "}
                      <Link className="lnk" href={ledger(x.i)}>Open in Ledger</Link>
                      <button className="lnk" onClick={() => set("plan", { ...o.plan, [c.id]: false })}>Not recurring: treat as large charge</button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {o.sep && (
            <div>
              {nL === 0 ? (
                <><p className="sec">Large one-time charges</p><p className="sub">None in this period at the current threshold.</p></>
              ) : (
                <>
                  <p className="sec">Large one-time charges · {nL} in this period</p>
                  {[...flagged].sort((a, b) => b.a - a.a).slice(0, 8).map((t, k) => {
                    const c = CATS[t.c];
                    return (
                      <div className="lg" key={k}>
                        <span className="num"><b>{full(t.a)}</b></span>
                        <span><i className="dot" style={{ background: `var(--sr-${c.g})`, marginRight: 6 }} />{c.n} <span className="tx">· {c.nat} · {L10.ml(t.m)}</span></span>
                        <span />
                        <span className="d">{cleanDesc(t.d)}{" "}
                          <Link className="lnk" href={ledgerHref(data, c.id, t.m, t.m)}>Open in Ledger</Link>
                          <button className="lnk" onClick={() => set("plan", { ...o.plan, [c.id]: true })}>Mark category as planned recurring</button>
                        </span>
                      </div>
                    );
                  })}
                  {nL > 8 && <p className="tx">+ {nL - 8} more</p>}
                </>
              )}
            </div>
          )}

          <div className="scroll" style={{ marginTop: 14 }}>
            <table>
              <thead><tr>
                <th>{tableTitle} · {P.label} · {rows.length} categories</th>
                <th className="r">{mode === "avg" ? "Per month" : "Total in period"}</th>
                <th className="r">{mode === "avg" ? "Total" : "Per month"}</th>
                <th>vs {P.prev ? "prev" : "—"}</th>
              </tr></thead>
              <tbody>
                {rows.slice(0, 14).map((r) => {
                  const avg = r.v / L;
                  const pa = P.prev ? eng.catReg(r.i, P.prev[0], P.prev[1]) / (P.prev[1] - P.prev[0] + 1) : null;
                  let chip = <span className="chip n">—</span>;
                  if (pa !== null) {
                    if (pa < 500 && avg >= 1500) chip = <span className="chip">new</span>;
                    else if (pa >= 500) { const q = avg / pa; chip = q >= 1.4 ? <span className="chip">{q.toFixed(1)}x</span> : q <= 0.6 ? <span className="chip g">▼ {Math.round((1 - q) * 100)}%</span> : <span className="chip n">normal</span>; }
                  }
                  const tops = eng.topTx(r.i, P.s, P.e, 3);
                  const isOpen = open.has(r.i);
                  return (
                    <Fragment key={r.i}>
                      <tr className="cat" onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(r.i)) n.delete(r.i); else n.add(r.i); return n; })}>
                        <td>
                          <i className="dot" style={{ background: `var(--sr-${r.c.g})`, marginRight: 8 }} />{r.c.n}
                          {eng.PLANNED.has(r.i) && <> <span className="chip n">planned recurring</span></>}
                          <span className="tx" style={{ display: "block", marginLeft: 17 }}>
                            {r.c.nat} › {r.c.t}<br />
                            <button className="lnk" onClick={(e) => { e.stopPropagation(); goFocus(r.i); }}>Trend</button>
                            <Link className="lnk" href={ledger(r.i)} onClick={(e) => e.stopPropagation()}>Open in Ledger</Link>
                          </span>
                        </td>
                        <td className="r"><b>{full(mode === "avg" ? avg : r.v)}</b>{r.lg > 0 && <span className="tx" style={{ display: "block" }}>+ {inr(mode === "avg" ? r.lg / L : r.lg)} large</span>}</td>
                        <td className="r tx">{full(mode === "avg" ? r.v : avg)}</td>
                        <td>{chip}</td>
                      </tr>
                      {isOpen && (
                        <tr><td colSpan={4} className="tx">
                          {tops.length ? "Largest charges: " + tops.map((t) => `${L10.ml(t.m)} ${full(t.a)} · ${cleanDesc(t.d)}`).join("  |  ") : "No single charge of ₹7.5k or more in this period."}
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}
                {rows.length > 14 && <tr><td colSpan={4} className="tx">+ {rows.length - 14} smaller categories</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel" aria-labelledby="sr-h2">
          <div className="panelhead"><div>
            <h2 id="sr-h2">2 · What changed vs your normal</h2>
            <p className="sub">Run-rate spend per month, {P.label} vs {P.prev ? P.prevLabel : "n/a"}. Vacation, tax and one-off events are shown in section 1, not here. Large one-time charges are excluded when separated.</p>
          </div></div>
          {!mv ? <p className="sub">No earlier period in the data to compare against.</p> : (
            <>
              {up.length ? up.map((x) => mover(x, false)) : <p className="sub">Nothing is running materially above its normal in this period.</p>}
              {down.length > 0 && <><p className="sec">Spent less on</p>{down.map((x) => mover(x, true))}</>}
              {o.expected.length > 0 && (
                <p className="tx" style={{ marginTop: 10 }}>{o.expected.length} categor{o.expected.length === 1 ? "y" : "ies"} marked as expected and hidden from this list. <button className="lnk" onClick={() => set("expected", [])}>Restore</button> <span>(saved in this browser)</span></p>
              )}
            </>
          )}
        </section>

        <section className="panel" aria-labelledby="sr-h3">
          <div className="panelhead">
            <div>
              <h2 id="sr-h3">3 · Savings opportunities</h2>
              <p className="sub">Controllable (Discretionary) categories that are rising or recurring in this period. Tick what you would act on. Annual figures extrapolate the selected period.</p>
            </div>
            <label className="lab">Target cut
              <select id="sr-cut" value={cut} onChange={(e) => setCut(+e.target.value)}>
                <option value={0.1}>10%</option><option value={0.25}>25%</option><option value={0.5}>50%</option>
              </select>
            </label>
          </div>
          {opps.length === 0 ? <p className="sub">No controllable category is rising or recurring enough to flag in this period.</p> : opps.map((x) => {
            const yoy = x.ly === null ? "" : x.ly > 0 ? ` · ${x.v >= x.ly ? "+" : ""}${Math.round((x.v / x.ly - 1) * 100)}% vs same period last year (${inr(x.ly)})` : " · nothing in the same period last year";
            return (
              <div className="opp" key={x.i}>
                <input type="checkbox" id={`sr-o${x.i}`} checked={!unticked.has(x.i)} aria-label={`Include ${x.c.n}`}
                  onChange={() => setUnticked((s) => { const n = new Set(s); if (n.has(x.i)) n.delete(x.i); else n.add(x.i); return n; })} />
                <label htmlFor={`sr-o${x.i}`}>
                  <div className="t">{x.c.n} <span className="tx">· {x.c.t}</span></div>
                  <div className="e">{x.tags.join("; ")}.{x.top ? ` Largest charge: ${full(x.top.a)} · ${cleanDesc(x.top.d)}.` : ""}</div>
                  <div className="e">{inr(x.v)} in {L} month{L > 1 ? "s" : ""} ({inr(x.annual)} a year at this pace){yoy}</div>
                </label>
                <div className="sv">
                  <b>{inr(x.annual * cut)}</b><div className="tx">per year at {Math.round(cut * 100)}%</div>
                  <div className="tx" style={{ marginTop: 6 }}>
                    <button className="lnk" onClick={() => goFocus(x.i)}>Trend</button>
                    <Link className="lnk" href={ledger(x.i)}>Ledger</Link>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="total"><span>Potential saving over a year if you act on the ticked items</span><b>{inr(oppTotal)}</b></div>
        </section>

        <details className="panel">
          <summary>How spend is grouped (your Expense Natures, plus one lumpiness rule)</summary>
          <table>
            <tbody>
              <tr><th>Group</th><th>Your Expense Natures</th></tr>
              <tr><td><i className="dot" style={{ background: "var(--sr-committed)" }} /> Committed</td><td>Household Fixed, Education Expenses, Medical, Insurance Premium</td></tr>
              <tr><td><i className="dot" style={{ background: "var(--sr-controllable)" }} /> Controllable</td><td>Discretionary Expense (includes Learning, so Ria&apos;s studies stay here), Official Expense</td></tr>
              <tr><td><i className="dot" style={{ background: "var(--sr-planned)" }} /> Vacation</td><td>Vacation (drill by trip)</td></tr>
              <tr><td><i className="dot" style={{ background: "var(--sr-other)" }} /> Income tax and one-off</td><td>Income Tax, One Off Expenses. Any nature not listed here also lands in this group.</td></tr>
              <tr><td><i className="dot hatch" /> Large one-time charges</td><td>Any single charge at or above the ₹ limit, or at or above half of it and the chosen multiple of its category&apos;s usual charge, in any nature. It keeps its nature tag and is lifted out of the run rate. Categories that are planned recurring are never treated as large. Only charges of ₹7.5k or more are considered.</td></tr>
              <tr><td><i className="dot" style={{ background: "var(--sr-committed)" }} /> Planned recurring</td><td>A category paid on a regular cadence in sizeable amounts, like Kids School Fees or Quarterly Maintenance. Detected when it has 3 or more payments in the last 12 months, similar amounts, a gap of 2 or more months between them and a typical payment of ₹25k or more. You can also mark or unmark any category yourself. It stays in its own group (school fees stay Committed) and can be spread evenly across months or shown as paid.</td></tr>
            </tbody>
          </table>
          <p className="foot">Savings figures are arithmetic on your own history, not forecasts. Filters, planned-recurring overrides and &quot;expected&quot; marks are saved in this browser only.</p>
        </details>
      </div>
    </div>
  );
}

