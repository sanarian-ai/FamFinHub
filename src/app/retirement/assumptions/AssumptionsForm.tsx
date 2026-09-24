"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Card } from "@/components/ui";
import { saveAssumptionsAction } from "./actions";
import type { Assumptions, Params } from "@/lib/retirement";

function NumField({
  label, value, onChange, suffix, step = 1, disabled,
}: {
  label: string; value: number; onChange: (v: number) => void; suffix?: string; step?: number; disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
      {label}
      <div className="flex items-center gap-1.5">
        <input
          type="number" step={step} value={Number.isFinite(value) ? value : ""} disabled={disabled}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm tabular-nums text-slate-900 disabled:opacity-50"
        />
        {suffix && <span className="shrink-0 text-xs text-slate-400">{suffix}</span>}
      </div>
    </label>
  );
}

function BoolField({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
      {label}
    </label>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {note && <span className="text-xs text-slate-500">{note}</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>
    </Card>
  );
}

export function AssumptionsForm({
  planId, initialParams, initialAssumptions,
}: { planId: string; initialParams: Params; initialAssumptions: Assumptions }) {
  const [p, setP] = useState<Params>(initialParams);
  const [mcPct, setMcPct] = useState({
    epfG: initialAssumptions.epfG, sangG: initialAssumptions.sangG,
    mcMean: initialAssumptions.mcMean * 100, mcSigma: initialAssumptions.mcSigma * 100, cpiSd: initialAssumptions.cpiSd * 100,
    seed: initialAssumptions.seed,
  });
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  function n(key: keyof Params) {
    return (v: number) => { setP((cur) => ({ ...cur, [key]: v })); setDirty(true); setSaved(false); };
  }
  function b(key: keyof Params) {
    return (v: boolean) => { setP((cur) => ({ ...cur, [key]: v })); setDirty(true); setSaved(false); };
  }
  function mc(key: keyof typeof mcPct) {
    return (v: number) => { setMcPct((cur) => ({ ...cur, [key]: v })); setDirty(true); setSaved(false); };
  }

  function save() {
    setErr(null);
    const assumptions: Assumptions = {
      epfG: mcPct.epfG, sangG: mcPct.sangG,
      mcMean: mcPct.mcMean / 100, mcSigma: mcPct.mcSigma / 100, cpiSd: mcPct.cpiSd / 100,
      seed: Math.round(mcPct.seed),
    };
    startTransition(async () => {
      try {
        await saveAssumptionsAction(planId, p, assumptions);
        setSaved(true);
        setDirty(false);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-1 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white/95 px-4 py-2.5 shadow-sm backdrop-blur">
        <div className="text-xs text-slate-500">
          {dirty ? "Unsaved changes." : saved ? "Saved. PV figures recompute on next page load; re-run the success% probability to pick up the change." : "No changes yet."}
        </div>
        <button
          onClick={save} disabled={pending || !dirty}
          className="rounded-md border border-slate-200 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
      {err && (
        <Card className="border-rose-200 bg-rose-50">
          <div className="whitespace-pre-line text-xs text-rose-700">{err}</div>
        </Card>
      )}

      <Section title="Return &amp; inflation" note="Feed every PV, ledger, and Monte Carlo calculation.">
        <NumField label="Deterministic return (r)" value={p.r} onChange={n("r")} suffix="%" step={0.1} />
        <NumField label="General inflation (CPI)" value={p.cpi} onChange={n("cpi")} suffix="%" step={0.1} />
        <NumField label="Medical inflation" value={p.med} onChange={n("med")} suffix="%" step={0.1} />
        <NumField label="Education inflation" value={p.edu} onChange={n("edu")} suffix="%" step={0.1} />
      </Section>

      <Section title="Property" note="One-time inflow at face value when the property sells — not grown by inflation. EMI stops the same year.">
        <NumField label="Sale year" value={p.propYear} onChange={n("propYear")} step={1} />
        <NumField label="Sale proceeds" value={p.propAmt} onChange={n("propAmt")} suffix="₹ Cr" step={0.1} />
      </Section>

      <Section title="ESOP" note="One-time inflow at face value in the unlock year — not grown by inflation. Net of the stated haircut.">
        <NumField label="Unlock year" value={p.esopYear} onChange={n("esopYear")} step={1} />
        <NumField label="Haircut" value={p.esopH} onChange={n("esopH")} suffix="%" step={1} />
        <NumField label="Gross value" value={p.esopAmt} onChange={n("esopAmt")} suffix="₹ Cr" step={0.1} />
      </Section>

      <Section title="Future Generali policy" note="Lump payout and premium are face-value amounts, not grown by inflation. Either a lump payout, a guaranteed income stream from genYear, or both off.">
        <NumField label="Payout / income start year" value={p.genYear} onChange={n("genYear")} step={1} />
        <NumField label="Lump payout" value={p.genAmt} onChange={n("genAmt")} suffix="₹ Cr" step={0.1} />
        <NumField label="Annual premium" value={p.genPrem} onChange={n("genPrem")} suffix="₹ L / yr" step={0.1} />
        <NumField label="Last premium year" value={p.genLast} onChange={n("genLast")} step={1} />
        <BoolField label="Guaranteed income stream on" checked={p.genInc} onChange={b("genInc")} />
      </Section>

      <Section title="Unlisted NSE shares" note="Amount grows at the growth rate below, not general inflation. One-time inflow if a nseYear is set — otherwise held at the tracked value with no scheduled event (see the assets detail page).">
        <NumField label="Event year (0 = none scheduled)" value={p.nseYear} onChange={n("nseYear")} step={1} />
        <NumField label="Amount" value={p.nseAmt} onChange={n("nseAmt")} suffix="₹ Cr" step={0.1} />
        <NumField label="Growth rate" value={p.nseG} onChange={n("nseG")} suffix="%" step={0.1} />
      </Section>

      <Section title="EPF / NPS">
        <NumField label="Withdrawal year" value={p.epfYear} onChange={n("epfYear")} step={1} />
      </Section>

      <Section title="Ria's income" note="Current net income, compounding forward at the growth rate below — not general inflation.">
        <NumField label="Last working year" value={p.riaLast} onChange={n("riaLast")} step={1} />
        <NumField label="Current net income" value={p.riaNet} onChange={n("riaNet")} suffix="₹ L / yr" step={0.1} />
        <NumField label="Growth rate" value={p.riaG} onChange={n("riaG")} suffix="%" step={0.1} />
      </Section>

      <Section title="Sangeeth's future income" note="A hypothetical future income window; 0 net means none modelled. Net income compounds forward each year at the rate set in Monte Carlo &amp; growth assumptions below.">
        <NumField label="From year" value={p.sangFrom} onChange={n("sangFrom")} step={1} />
        <NumField label="To year" value={p.sangTo} onChange={n("sangTo")} step={1} />
        <NumField label="Net income" value={p.sangNet} onChange={n("sangNet")} suffix="₹ L / yr" step={0.1} />
      </Section>

      <Section title="Children's education" note="Costs are today's money, grown to each year by the Education inflation rate above. UG cost applies each of 4 years from its start year; PG cost each of the following 2.">
        <NumField label="Reuben's UG start year" value={p.rubenUG} onChange={n("rubenUG")} step={1} />
        <NumField label="Rochelle's UG start year" value={p.rochUG} onChange={n("rochUG")} step={1} />
        <NumField label="UG cost" value={p.ugCost} onChange={n("ugCost")} suffix="₹ L / yr" step={0.5} />
        <NumField label="PG cost" value={p.pgCost} onChange={n("pgCost")} suffix="₹ L / yr" step={0.5} />
      </Section>

      <Section title="Insurance &amp; health timing">
        <NumField label="Last term-insurance year" value={p.termLast} onChange={n("termLast")} step={1} />
        <NumField label="Health cost ramp-up starts" value={p.healthRamp} onChange={n("healthRamp")} step={1} />
      </Section>

      <Section title="Spend step-downs" note="0 = not scheduled. Applies from that year on top of the life-stage multipliers already in code.">
        <NumField label="Core spend cut year" value={p.stepYear} onChange={n("stepYear")} step={1} />
        <NumField label="Core spend cut" value={p.stepPct} onChange={n("stepPct")} suffix="%" step={1} />
        <NumField label="Flex spend cut year" value={p.lifeYear} onChange={n("lifeYear")} step={1} />
        <NumField label="Flex spend cut" value={p.lifePct} onChange={n("lifePct")} suffix="%" step={1} />
      </Section>

      <Section title="Marriage goals" note="Amounts are today's money, grown to each event year by General inflation (CPI) above — same treatment as every other spend category.">
        <BoolField label="Included in the plan" checked={p.marrOn} onChange={b("marrOn")} />
        <NumField label="Event 1 year" value={p.marr1Year} onChange={n("marr1Year")} step={1} disabled={!p.marrOn} />
        <NumField label="Event 1 amount" value={p.marr1Amt} onChange={n("marr1Amt")} suffix="₹ L" step={1} disabled={!p.marrOn} />
        <NumField label="Event 2 year" value={p.marr2Year} onChange={n("marr2Year")} step={1} disabled={!p.marrOn} />
        <NumField label="Event 2 amount" value={p.marr2Amt} onChange={n("marr2Amt")} suffix="₹ L" step={1} disabled={!p.marrOn} />
      </Section>

      <Section title="Monte Carlo &amp; growth assumptions" note="Feed the success% simulation only — the deterministic path above is unaffected.">
        <NumField label="EPF growth rate" value={mcPct.epfG} onChange={mc("epfG")} suffix="%" step={0.1} />
        <NumField label="Sangeeth income growth" value={mcPct.sangG} onChange={mc("sangG")} suffix="%" step={0.1} />
        <NumField label="Expected market return" value={mcPct.mcMean} onChange={mc("mcMean")} suffix="%" step={0.1} />
        <NumField label="Market volatility (σ)" value={mcPct.mcSigma} onChange={mc("mcSigma")} suffix="%" step={0.5} />
        <NumField label="Inflation volatility" value={mcPct.cpiSd} onChange={mc("cpiSd")} suffix="%" step={0.1} />
        <NumField label="Random seed" value={mcPct.seed} onChange={mc("seed")} step={1} />
      </Section>

      <p className="text-xs text-slate-400">
        Life-stage spend multipliers (12 categories × 5 stages) and the stage-boundary years aren&apos;t editable here yet —
        they change far less often than the figures above and stay in <code>lib/retirement/defaults.ts</code> for now.
      </p>
    </div>
  );
}
