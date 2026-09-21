// Generates golden fixtures from the shipped Runway Ledger v10 JS engine (the reference implementation).
import { createRequire } from "node:module"; const require = createRequire(import.meta.url); const { chromium } = require(process.env.PW_PATH || "playwright");
import fs from "node:fs";
const html = fs.readFileSync("/home/claude/runway-ledger.html", "utf8");
const i = html.lastIndexOf("renderEditor();render();\n})();");
fs.writeFileSync("/tmp/ref.html", html.slice(0, i) + "window.__x={DEFAULTS:DEFAULTS,clone:clone,compute:compute,simulate:simulate,view:view};\n" + html.slice(i));
const CONFIGS = {
  default:       { over: {}, custom: [] },
  A_flat:        { over: { esopYear: 2028, esopH: 0, shiftOn: false }, custom: [] },
  A_shift:       { over: { esopYear: 2028, esopH: 0, shiftOn: true }, custom: [] },
  B_flat:        { over: { esopYear: 2028, esopH: 25, shiftOn: false }, custom: [] },
  B_shift:       { over: { esopYear: 2028, esopH: 25, shiftOn: true }, custom: [] },
  C_flat:        { over: { esopYear: 2030, esopH: 25, shiftOn: false }, custom: [] },
  C_shift:       { over: { esopYear: 2030, esopH: 25, shiftOn: true }, custom: [] },
  marriages_on:  { over: { marrOn: true }, custom: [] },
  generali_inc:  { over: { genInc: true }, custom: [] },
  generali_surr: { over: { genInc: false, genYear: 2032, genAmt: 0.35 }, custom: [] },
  nse_sold_2030: { over: { nseYear: 2030 }, custom: [] },
  income_1cr:    { over: { sangNet: 100, sangFrom: 2028, sangTo: 2040 }, custom: [] },
  cuts:          { over: { stepYear: 2035, stepPct: 15, lifeYear: 2030, lifePct: 30 }, custom: [] },
  ria_3pct:      { over: { riaG: 3, riaLast: 2045 }, custom: [] },
  custom_events: { over: {}, custom: [{ year: 2033, kind: "expense", amt: 40, label: "car" }, { year: 2029, kind: "inflow", amt: 25, label: "gift" }] },
  edu_shift:     { over: { rubenUG: 2032, rochUG: 2037, ugCost: 60, pgCost: 120, edu: 9 }, custom: [] },
  low_return:    { over: { r: 6, cpi: 5, med: 9 }, custom: [] },
};
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto("file:///tmp/ref.html");
const out = await p.evaluate((CONFIGS) => {
  const { DEFAULTS, clone, compute, simulate, view } = window.__x;
  const res = {};
  for (const [name, c] of Object.entries(CONFIGS)) {
    const P = Object.assign(clone(DEFAULTS), c.over);
    const r = compute(P, c.custom);
    const mc = simulate(r.rows, P, 10000);
    const real = view(r.rows, "real");
    res[name] = { over: c.over, custom: c.custom, depl: r.depl, rows: r.rows, mc,
      realSample: real.filter(x => [2026, 2030, 2039, 2050, 2082].includes(x.Y)) };
  }
  return { defaults: clone(DEFAULTS), res };
}, CONFIGS);
if (errs.length) { console.error(errs); process.exit(1); }
fs.writeFileSync("fixtures/golden-v10.json", JSON.stringify(out));
console.log("wrote", Object.keys(out.res).length, "configs;", (fs.statSync("fixtures/golden-v10.json").size / 1e6).toFixed(2), "MB");
for (const [k, v] of Object.entries(out.res)) console.log(k.padEnd(14), v.mc.p.toFixed(2), v.depl);
await b.close();
