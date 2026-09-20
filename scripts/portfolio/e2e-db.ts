// DB -> engine end-to-end: engine over live Postgres data must reproduce the headline fixture.
import { PrismaClient } from "@prisma/client";
import { buildContext, inceptionStart, run } from "../../src/lib/portfolio/engine";
import { loadDataset } from "../../src/lib/portfolio/load";
const p = new PrismaClient();
(async () => {
  const ctx = buildContext(await loadDataset(p));
  const r = run(ctx, inceptionStart(ctx), ctx.asof);
  const pf = r.pf.irr! * 100, spy = r.SPY.irr! * 100, qqq = r.QQQ.irr! * 100;
  console.log({ asof: ctx.asof, pf: pf.toFixed(2), spy: spy.toFixed(2), qqq: qqq.toFixed(2), pnl: Math.round(r.pf.profit), end: Math.round(r.V1) });
  const good = Math.abs(pf - 36.01) < 0.006 && Math.abs(spy - 18.86) < 0.006 && Math.abs(qqq - 27.18) < 0.006 && Math.round(r.pf.profit) === 129163 && Math.round(r.V1) === 253654;
  console.log(good ? "DB e2e OK" : "DB e2e MISMATCH"); process.exit(good ? 0 : 1);
})().finally(() => p.$disconnect());
