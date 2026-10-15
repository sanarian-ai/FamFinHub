"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { GROUPS, PRESETS, inr, sum, type Engine } from "@/lib/spendReview/calc";
import type { Group } from "@/lib/spendReview/types";

export function EyeIcon({ off }: { off: boolean }) {
  return off ? (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3l18 18" /><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a10.7 10.7 0 0 0 5.4-1.5" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}

const chipBg = (eng: Engine, k: string) => {
  const g = eng.hkGroup(k);
  return g ? `color-mix(in srgb, var(--sr-${g}) 38%, var(--sr-surface))` : "repeating-linear-gradient(45deg,var(--sr-ink2) 0 2px,transparent 2px 4px)";
};

/** "What counts" strip: removable chips, presets, the average-without-them readout, and the searchable hide tree. */
export function HideLens({ eng, hidden, sep, onSet, onToggle }: {
  eng: Engine; hidden: string[]; sep: boolean; onSet: (h: string[]) => void; onToggle: (k: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [openNodes, setOpenNodes] = useState<Set<string>>(new Set(["g:committed", "g:controllable", "g:property"]));
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const { base, cur, steps } = useMemo(() => eng.lens(), [eng]);
  const where = eng.isMonthView ? "the 12 months shown" : "the selected period";
  const pct = base ? (cur / base - 1) * 100 : 0;
  const cuts = steps.filter((x) => x.d > 0);
  const presetOn = (keys: string[]) => keys.length === hidden.length && keys.every((k) => hidden.includes(k));

  return (
    <div className="lens" ref={wrap}>
      <div className="lensrow">
        <span className="lensttl">What counts</span>
        {steps.length === 0 && <span className="tx">Everything. Hide a bucket, a type or any category to see what your average would be without it.</span>}
        {steps.map((x) => {
          const g = eng.hkGroup(x.k);
          return (
            <button key={x.k} className="hchip" onClick={() => onToggle(x.k)} title="Include again">
              <i className={`dot ${g ? "" : "hatch"}`} style={g ? { background: `var(--sr-${g})` } : undefined} />
              {eng.hkLabel(x.k)} <span className="k">{eng.hkKind(x.k)} · −{inr(x.d)}/mo</span><span className="x" aria-hidden="true">✕</span>
            </button>
          );
        })}
        <button className="addhide" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)}>+ Hide…</button>
        <span style={{ flex: 1 }} />
        {[...PRESETS, ...eng.extraPresets].map((p) => (
          <button key={p.name} className="pchip" aria-pressed={presetOn(p.keys)} title={p.tip} onClick={() => onSet(presetOn(p.keys) ? [] : p.keys)}>{p.name}</button>
        ))}
        {hidden.length > 0 && <button className="lnk" onClick={() => onSet([])}>show all ✕</button>}
      </div>

      {steps.length > 0 && (
        <div className="impact">
          <div>
            <div className="tx">Average per month, {where}</div>
            <div className="big"><s>{inr(base)}</s> → {inr(cur)}<span className="delta">{pct < 0 ? "▼ " : "▲ "}{Math.abs(Math.round(pct))}% · {inr(Math.abs(base - cur))}/mo</span></div>
          </div>
          <div>
            <div className="wf" role="img" aria-label={`Average spend ${inr(base)} a month; ${inr(cur)} remains after hiding ${steps.map((x) => eng.hkLabel(x.k)).join(", ")}`}>
              <div className="keep" style={{ flex: Math.max(cur, 0) }} title={`Remaining ${inr(cur)}/mo`} />
              {cuts.map((x) => <div key={x.k} className="cut" style={{ flex: x.d, background: chipBg(eng, x.k) }} title={`${eng.hkLabel(x.k)} −${inr(x.d)}/mo`} />)}
            </div>
            <div className="wfleg">
              <span><i className="dot" style={{ background: "var(--sr-ink)" }} />Remaining {inr(cur)}</span>
              {cuts.map((x) => <span key={x.k}><i className="dot" style={{ background: chipBg(eng, x.k), border: "1.5px dashed var(--sr-ink2)" }} />{eng.hkLabel(x.k)} −{inr(x.d)}</span>)}
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="pop" role="dialog" aria-label="Choose what counts">
          <input type="search" placeholder="Search a category, type or nature" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search categories" autoFocus />
          <p className="hd">Untick anything to leave it out of every number on this page. Temporary: resets when you leave.</p>
          <Tree eng={eng} hidden={hidden} sep={sep} q={q} openNodes={openNodes} setOpenNodes={setOpenNodes} onSet={onSet} onToggle={onToggle} />
        </div>
      )}
    </div>
  );
}

function Tree({ eng, hidden, sep, q, openNodes, setOpenNodes, onSet, onToggle }: {
  eng: Engine; hidden: string[]; sep: boolean; q: string; openNodes: Set<string>; setOpenNodes: (s: Set<string>) => void;
  onSet: (h: string[]) => void; onToggle: (k: string) => void;
}) {
  const { CATS, isHid } = eng;
  const amt = useMemo(() => CATS.map((_, i) => eng.catAvg(i)), [eng, CATS]);
  const hset = new Set(hidden);
  const nodeCats = (pred: (i: number) => boolean) => CATS.map((_, i) => i).filter((i) => pred(i) && (amt[i] > 0 || isHid(i)));
  const toggleOpen = (k: string) => { const n = new Set(openNodes); if (n.has(k)) n.delete(k); else n.add(k); setOpenNodes(n); };

  const change = (k: string) => {
    const cs = [...eng.keyCats(k)];
    const partial = k !== "L" && !hset.has(k) && cs.some(isHid) && !cs.every(isHid);
    if (partial) onSet(eng.clearInside(hidden, k)); else onToggle(k);
  };
  const Row = (p: { k: string; label: string; cs: number[]; hasKids: boolean; ancHidden: boolean }) => (
    <TreeRow {...p} eng={eng} hset={hset} amt={amt} open={openNodes.has(p.k)} onOpen={() => toggleOpen(p.k)} onChange={() => change(p.k)} />
  );

  const ql = q.trim().toLowerCase();
  if (ql) {
    const ids = CATS.map((_, i) => i).filter((i) => (amt[i] > 0 || isHid(i)) && `${CATS[i].n} ${CATS[i].t} ${CATS[i].nat}`.toLowerCase().includes(ql)).sort((a, b) => amt[b] - amt[a]).slice(0, 40);
    if (!ids.length) return <p className="tx">No category matches.</p>;
    return <>{ids.map((i) => {
      const own = hset.has("c:" + i);
      return (
        <div className={`nd ${isHid(i) ? "off" : ""}`} key={i}>
          <span style={{ width: 16 }} />
          <input type="checkbox" checked={!isHid(i)} disabled={isHid(i) && !own} aria-label={`Count ${CATS[i].n}`} onChange={() => onToggle("c:" + i)} />
          <span className="nm">{CATS[i].n} <span className="tx">· {CATS[i].nat} › {CATS[i].t}</span></span>
          <span className="am">{inr(amt[i])}/mo</span>
        </div>
      );
    })}</>;
  }

  return (
    <>
      {eng.gkeys.map((g: Group) => {
        const gk = "g:" + g, gcs = nodeCats((i) => CATS[i].g === g);
        if (!gcs.length) return null;
        const gh = hset.has(gk);
        const nats = [...new Set(gcs.map((i) => CATS[i].nat))].sort((a, b) => sum(nodeCats((i) => CATS[i].nat === b && CATS[i].g === g).map((i) => amt[i])) - sum(nodeCats((i) => CATS[i].nat === a && CATS[i].g === g).map((i) => amt[i])));
        return (
          <div key={g}>
            {Row({ k: gk, label: GROUPS[g], cs: gcs, hasKids: true, ancHidden: false })}
            {openNodes.has(gk) && (
              <div className="kids">
                {nats.map((nt) => {
                  const nk = "n:" + nt, ncs = nodeCats((i) => CATS[i].nat === nt && CATS[i].g === g), nhid = gh || hset.has(nk);
                  const types = [...new Set(ncs.map((i) => CATS[i].t))].sort((a, b) => sum(nodeCats((i) => CATS[i].t === b && CATS[i].nat === nt).map((i) => amt[i])) - sum(nodeCats((i) => CATS[i].t === a && CATS[i].nat === nt).map((i) => amt[i])));
                  return (
                    <div key={nk}>
                      {Row({ k: nk, label: nt, cs: ncs, hasKids: true, ancHidden: gh })}
                      {openNodes.has(nk) && (
                        <div className="kids">
                          {types.map((ty) => {
                            const tk = "t:" + nt + "›" + ty, tcs = nodeCats((i) => CATS[i].t === ty && CATS[i].nat === nt), thid = nhid || hset.has(tk);
                            return (
                              <div key={tk}>
                                {Row({ k: tk, label: ty, cs: tcs, hasKids: true, ancHidden: nhid })}
                                {openNodes.has(tk) && (
                                  <div className="kids">
                                    {[...tcs].sort((a, b) => amt[b] - amt[a]).map((i) => <div key={i}>{Row({ k: "c:" + i, label: CATS[i].n, cs: [i], hasKids: false, ancHidden: thid })}</div>)}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <div className="nd">
        <span style={{ width: 16 }} />
        <input type="checkbox" checked={!hset.has("L")} disabled={!sep} aria-label="Count large one-time charges" onChange={() => onToggle("L")} />
        <span className="nm">Large one-time charges <span className="tx">(any bucket)</span></span>
        <span className="am">{sep ? "" : "separation off"}</span>
      </div>
    </>
  );
}

function TreeRow({ k, label, cs, hasKids, ancHidden, eng, hset, amt, open, onOpen, onChange }: {
  k: string; label: string; cs: number[]; hasKids: boolean; ancHidden: boolean; eng: Engine; hset: Set<string>; amt: number[];
  open: boolean; onOpen: () => void; onChange: () => void;
}) {
  const nh = cs.filter(eng.isHid).length;
  const all = cs.length > 0 && nh === cs.length, some = nh > 0 && nh < cs.length;
  const disabled = ancHidden && !hset.has(k) && all;
  return (
    <div className={`nd ${all ? "off" : ""}`}>
      {hasKids ? <button className="tg" aria-label={open ? "Collapse" : "Expand"} onClick={onOpen}>{open ? "▾" : "▸"}</button> : <span style={{ width: 16 }} />}
      <input type="checkbox" checked={nh === 0} disabled={disabled} aria-label={`Count ${label}`} ref={(el) => { if (el) el.indeterminate = some; }} onChange={onChange} />
      <span className="nm" title={label}>{label}</span>
      <span className="am">{inr(sum(cs.map((i) => amt[i])))}/mo</span>
    </div>
  );
}
