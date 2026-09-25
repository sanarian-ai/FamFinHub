// Validation + idempotent bulk write for POST /api/portfolio/ingest, and post-ingest reconciliation.
// Design rules (us-portfolio-data-architecture.md section 4): typed arrays, natural-key idempotency
// (source+brokerRef, securityId+date), chunked createMany skipDuplicates, rejects become review items.
import { Prisma, type PrismaClient } from "@prisma/client";
import { splitFactor } from "./splits";

export const MAX_ROWS = 5000;
const SOURCES = ["indmoney_report", "ibkr_api", "manual", "kabir_pms_report", "cams_cas_pdf", "manual_closed_vehicle_audit", "iifl_trade_listing"] as const;
const SIDES = ["BUY", "SELL"] as const;
const CASH_TYPES = ["DIVIDEND", "WITHHOLDING_TAX", "FEE", "DEPOSIT", "WITHDRAWAL", "INTEREST"] as const;
const ACTION_TYPES = ["SPLIT", "REVERSE_SPLIT", "SYMBOL_CHANGE", "BONUS", "RIGHTS", "DEMERGER"] as const;
const KINDS = ["STOCK", "ETF", "BENCHMARK", "MUTUAL_FUND"] as const;
// The session-date convention differs by market: US sources settle to the America/New_York session
// date, the Kabir PMS (NSE/BSE, via Nuvama) to the Asia/Kolkata session date.
const SESSION_TZ: Record<string, string> = {
  indmoney_report: "America/New_York",
  ibkr_api: "America/New_York",
  manual: "America/New_York",
  kabir_pms_report: "Asia/Kolkata",
  cams_cas_pdf: "Asia/Kolkata",
  manual_closed_vehicle_audit: "Asia/Kolkata", // KCV/KFV/Unifi closed-vehicle ledger — Indian PMS/pooled-vehicle
  // statements, same session-date basis as kabir_pms_report/cams_cas_pdf. Without this entry the
  // fallback below silently used America/New_York, which shifts a midnight-UTC execTs to the previous
  // calendar day — found while building the closed-vehicle ingestion script (step 4).
  iifl_trade_listing: "Asia/Kolkata", // IIFL demat (Ria) NSE trade listing — same basis as the other India sources above.
};
export const RECONCILE_TOL = 1e-4; // units

type Row = Record<string, any>;
export type Rejected = { row: number; error: string };
export type TypeResult = { received: number; inserted: number; skipped: number; rejected: Rejected[] };
export type ReconRow = { account: string; symbol: string; asOf: string; rebuilt: number; reported: number; diff: number; ok: boolean };
export type IngestResult = {
  dryRun: boolean; importBatchId: string | null; results: Record<string, TypeResult>; reconciliation: ReconRow[]; reviewItemsOpened: number;
};

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const isNum = (x: unknown) => (typeof x === "number" || (typeof x === "string" && x.trim() !== "")) && Number.isFinite(Number(x));
const dec = (x: unknown) => new Prisma.Decimal(String(x));
const sessionDate = (ts: Date, source: string) => new Intl.DateTimeFormat("en-CA", { timeZone: SESSION_TZ[source] ?? "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(ts);
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const empty = (n: number): TypeResult => ({ received: n, inserted: 0, skipped: 0, rejected: [] });

export function shapeError(body: any): string | null {
  if (!body || typeof body !== "object") return "expected a JSON object";
  const keys = ["securities", "corporateActions", "transactions", "cashEvents", "prices", "fx", "positionSnapshots"];
  let any = false;
  for (const k of keys) {
    if (body[k] === undefined) continue;
    if (!Array.isArray(body[k])) return `${k} must be an array`;
    if (body[k].length > MAX_ROWS) return `${k} exceeds ${MAX_ROWS} rows`;
    any = any || body[k].length > 0;
  }
  if (!any) return "no rows supplied";
  if (body.source !== undefined && !SOURCES.includes(body.source)) return `source must be one of ${SOURCES.join(", ")}`;
  return null;
}

export async function ingestPortfolio(prisma: PrismaClient, body: Row): Promise<IngestResult> {
  const dryRun = body.dryRun === true;
  const overwrite = body.overwrite === true; // prices / fx only: correct existing rows instead of skipping
  const results: Record<string, TypeResult> = {};
  let reviewOpened = 0;

  // 1. securities (create-if-missing only)
  const secIn: Row[] = body.securities ?? [];
  results.securities = empty(secIn.length);
  const secOk: Row[] = [];
  secIn.forEach((s, i) => {
    if (typeof s.symbol !== "string" || !/^[A-Z0-9.\-]{1,12}$/.test(s.symbol)) return results.securities.rejected.push({ row: i, error: "symbol must be 1-12 chars A-Z 0-9 . -" });
    if (typeof s.name !== "string" || !s.name) return results.securities.rejected.push({ row: i, error: "name required" });
    if (s.kind !== undefined && !KINDS.includes(s.kind)) return results.securities.rejected.push({ row: i, error: "invalid kind" });
    secOk.push({ symbol: s.symbol, name: s.name, kind: s.kind ?? "STOCK", currency: s.currency ?? "USD", exchange: s.exchange ?? null });
  });
  if (!dryRun && secOk.length) {
    const r = await prisma.security.createMany({ data: secOk as any, skipDuplicates: true });
    results.securities.inserted = r.count; results.securities.skipped = secOk.length - r.count;
  }
  const accId = new Map((await prisma.portfolioAccount.findMany({ select: { id: true, key: true } })).map((a) => [a.key, a.id]));
  const secRows = await prisma.security.findMany({ select: { id: true, symbol: true } });
  const secId = new Map(secRows.map((s) => [s.symbol, s.id]));
  if (dryRun) for (const s of secOk) if (!secId.has(s.symbol)) secId.set(s.symbol, "dry-run");

  const needAcc = (r: Row) => (accId.has(r.account) ? null : `unknown account '${r.account}'`);
  const needSec = (r: Row) => (secId.has(r.symbol) ? null : `unknown symbol '${r.symbol}' (send it in securities[] first)`);

  // 2. corporate actions
  const caIn: Row[] = body.corporateActions ?? [];
  results.corporateActions = empty(caIn.length);
  const caOk: Prisma.CorporateActionCreateManyInput[] = [];
  caIn.forEach((r, i) => {
    const err = needSec(r) ?? (!ACTION_TYPES.includes(r.type) ? "invalid type" : !isDate(r.effectiveDate) ? "effectiveDate must be YYYY-MM-DD" : !isNum(r.ratio) || Number(r.ratio) <= 0 ? "ratio must be > 0" : null);
    if (err) return results.corporateActions.rejected.push({ row: i, error: err });
    caOk.push({ securityId: secId.get(r.symbol)!, type: r.type, effectiveDate: d(r.effectiveDate), ratio: dec(r.ratio), source: r.source ?? null });
  });

  // 3. transactions
  const txIn: Row[] = body.transactions ?? [];
  results.transactions = empty(txIn.length);
  const batchSource = body.source ?? txIn.find((r) => SOURCES.includes(r.source))?.source ?? "manual";
  const txOk: Row[] = [];
  txIn.forEach((r, i) => {
    let err = needAcc(r) ?? needSec(r);
    if (!err && !SIDES.includes(r.side)) err = "side must be BUY or SELL";
    if (!err && !(isNum(r.qty) && Number(r.qty) > 0)) err = "qty must be > 0";
    if (!err && !(isNum(r.price) && Number(r.price) > 0)) err = "price must be > 0";
    if (!err && r.fee !== undefined && !(isNum(r.fee) && Number(r.fee) >= 0)) err = "fee must be >= 0";
    if (!err && !SOURCES.includes(r.source)) err = `source must be one of ${SOURCES.join(", ")}`;
    if (!err && (typeof r.brokerRef !== "string" || !r.brokerRef)) err = "brokerRef required (broker's own id; it is the dedupe key)";
    const ts = new Date(r.execTs);
    if (!err && (typeof r.execTs !== "string" || isNaN(ts.getTime()))) err = "execTs must be an ISO-8601 UTC timestamp";
    let tradeDate = "";
    if (!err) {
      tradeDate = sessionDate(ts, r.source);
      if (r.tradeDate !== undefined && r.tradeDate !== tradeDate) err = `tradeDate ${r.tradeDate} inconsistent with execTs (${SESSION_TZ[r.source] ?? "America/New_York"} session date is ${tradeDate})`;
    }
    if (err) return results.transactions.rejected.push({ row: i, error: err });
    txOk.push({ accountId: accId.get(r.account)!, securityId: secId.get(r.symbol)!, side: r.side, qty: dec(r.qty), price: dec(r.price), fee: dec(r.fee ?? 0), execTs: ts, tradeDate: d(tradeDate), source: r.source, brokerRef: r.brokerRef });
  });

  // 4. cash events
  const ceIn: Row[] = body.cashEvents ?? [];
  results.cashEvents = empty(ceIn.length);
  const ceOk: Row[] = [];
  ceIn.forEach((r, i) => {
    let err = needAcc(r);
    if (!err && r.symbol !== undefined && r.symbol !== null) err = needSec(r);
    if (!err && !CASH_TYPES.includes(r.type)) err = "invalid type";
    if (!err && !isNum(r.amount)) err = "amount must be numeric (signed)";
    if (!err && !isDate(r.eventDate)) err = "eventDate must be YYYY-MM-DD";
    if (!err && !SOURCES.includes(r.source)) err = "invalid source";
    if (!err && (typeof r.brokerRef !== "string" || !r.brokerRef)) err = "brokerRef required";
    if (err) return results.cashEvents.rejected.push({ row: i, error: err });
    ceOk.push({ accountId: accId.get(r.account)!, securityId: r.symbol ? secId.get(r.symbol)! : null, type: r.type, amount: dec(r.amount), currency: r.currency ?? "USD", eventDate: d(r.eventDate), source: r.source, brokerRef: r.brokerRef, notes: r.notes ?? null });
  });

  // 5. prices, fx, snapshots
  const prIn: Row[] = body.prices ?? [];
  results.prices = empty(prIn.length);
  const prOk: Prisma.PriceDailyCreateManyInput[] = [];
  prIn.forEach((r, i) => {
    const err = needSec(r) ?? (!isDate(r.date) ? "date must be YYYY-MM-DD" : !(isNum(r.close) && Number(r.close) > 0) ? "close must be > 0 (as-traded, unadjusted)" : r.dividendPerShare != null && !(isNum(r.dividendPerShare) && Number(r.dividendPerShare) >= 0) ? "dividendPerShare must be >= 0" : null);
    if (err) return results.prices.rejected.push({ row: i, error: err });
    prOk.push({ securityId: secId.get(r.symbol)!, date: d(r.date), close: dec(r.close), dividendPerShare: r.dividendPerShare != null ? dec(r.dividendPerShare) : null, source: r.priceSource ?? "claude_task" });
  });
  const fxIn: Row[] = body.fx ?? [];
  results.fx = empty(fxIn.length);
  const fxOk: Prisma.FxDailyCreateManyInput[] = [];
  fxIn.forEach((r, i) => {
    const err = typeof r.pair !== "string" || !/^[A-Z]{6}$/.test(r.pair) ? "pair must look like USDINR" : !isDate(r.date) ? "date must be YYYY-MM-DD" : !(isNum(r.rate) && Number(r.rate) > 0) ? "rate must be > 0" : null;
    if (err) return results.fx.rejected.push({ row: i, error: err });
    fxOk.push({ date: d(r.date), pair: r.pair, rate: dec(r.rate), source: r.fxSource ?? "claude_task" });
  });
  const snIn: Row[] = body.positionSnapshots ?? [];
  results.positionSnapshots = empty(snIn.length);
  const snOk: Prisma.PositionSnapshotUncheckedCreateInput[] = [];
  snIn.forEach((r, i) => {
    const err = needAcc(r) ?? needSec(r) ?? (!isDate(r.asOf) ? "asOf must be YYYY-MM-DD" : !(isNum(r.qty) && Number(r.qty) >= 0) ? "qty must be >= 0 (current post-split units)" : null);
    if (err) return results.positionSnapshots.rejected.push({ row: i, error: err });
    snOk.push({ accountId: accId.get(r.account)!, securityId: secId.get(r.symbol)!, asOf: d(r.asOf), qty: dec(r.qty), source: r.snapshotSource ?? "claude_task" });
  });

  if (dryRun) {
    for (const [k, n] of [["corporateActions", caOk.length], ["transactions", txOk.length], ["cashEvents", ceOk.length], ["prices", prOk.length], ["fx", fxOk.length], ["positionSnapshots", snOk.length]] as const) results[k].skipped = 0, results[k].inserted = 0, (results[k] as any).valid = n;
    return { dryRun, importBatchId: null, results, reconciliation: [], reviewItemsOpened: 0 };
  }

  // Writes
  let importBatchId: string | null = null;
  if (txOk.length || ceOk.length) {
    const b = await prisma.portfolioImportBatch.create({ data: { source: batchSource, rowsIn: txIn.length + ceIn.length, notes: body.notes ?? null } });
    importBatchId = b.id;
  }
  if (caOk.length) { const r = await prisma.corporateAction.createMany({ data: caOk, skipDuplicates: true }); results.corporateActions.inserted = r.count; results.corporateActions.skipped = caOk.length - r.count; }
  for (const c of chunks(txOk, 50)) { const r = await prisma.portfolioTransaction.createMany({ data: c.map((x) => ({ ...x, importBatchId })) as any, skipDuplicates: true }); results.transactions.inserted += r.count; }
  results.transactions.skipped = txOk.length - results.transactions.inserted;
  for (const c of chunks(ceOk, 50)) { const r = await prisma.cashEvent.createMany({ data: c.map((x) => ({ ...x, importBatchId })) as any, skipDuplicates: true }); results.cashEvents.inserted += r.count; }
  results.cashEvents.skipped = ceOk.length - results.cashEvents.inserted;
  if (overwrite) {
    for (const c of chunks(prOk, 100)) await prisma.$transaction(c.map((x) => prisma.priceDaily.upsert({ where: { securityId_date: { securityId: x.securityId, date: x.date as Date } }, create: x, update: { close: x.close, dividendPerShare: x.dividendPerShare, source: x.source } })));
    results.prices.inserted = prOk.length;
    for (const c of chunks(fxOk, 100)) await prisma.$transaction(c.map((x) => prisma.fxDaily.upsert({ where: { pair_date: { pair: x.pair, date: x.date as Date } }, create: x, update: { rate: x.rate, source: x.source } })));
    results.fx.inserted = fxOk.length;
  } else {
    for (const c of chunks(prOk, 200)) { const r = await prisma.priceDaily.createMany({ data: c, skipDuplicates: true }); results.prices.inserted += r.count; }
    results.prices.skipped = prOk.length - results.prices.inserted;
    for (const c of chunks(fxOk, 200)) { const r = await prisma.fxDaily.createMany({ data: c, skipDuplicates: true }); results.fx.inserted += r.count; }
    results.fx.skipped = fxOk.length - results.fx.inserted;
  }
  // Snapshots are broker statements of fact for a date: re-sending corrects them.
  if (snOk.length) await prisma.$transaction(snOk.map((x) => prisma.positionSnapshot.upsert({ where: { accountId_securityId_asOf: { accountId: x.accountId, securityId: x.securityId, asOf: x.asOf as Date } }, create: x, update: { qty: x.qty, source: x.source } })));
  results.positionSnapshots.inserted = snOk.length;

  if (importBatchId) await prisma.portfolioImportBatch.update({ where: { id: importBatchId }, data: { status: "completed", finishedAt: new Date(), rowsInserted: results.transactions.inserted + results.cashEvents.inserted, rowsSkipped: results.transactions.skipped + results.cashEvents.skipped } });

  // Rejected rows are never dropped silently.
  for (const [type, res] of Object.entries(results)) {
    for (const rj of res.rejected) {
      const detail = `ingest ${type}[${rj.row}] rejected: ${rj.error}`;
      const exists = await prisma.portfolioReviewItem.findFirst({ where: { type: "OTHER", status: "open", detail } });
      if (!exists) { await prisma.portfolioReviewItem.create({ data: { type: "OTHER", refTable: type, detail } }); reviewOpened++; }
    }
  }
  const touched = txOk.length || snOk.length || caOk.length;
  const rec = touched ? await reconcile(prisma) : { rows: [] as ReconRow[], opened: 0 };
  return { dryRun, importBatchId, results, reconciliation: rec.rows, reviewItemsOpened: reviewOpened + rec.opened };
}

/** Read-only: rebuilt units (from trades, split-adjusted, up to the snapshot date) vs the latest broker snapshot per position. */
export async function computeReconciliation(prisma: PrismaClient): Promise<ReconRow[]> {
  const snaps = await prisma.positionSnapshot.findMany({ orderBy: { asOf: "desc" }, distinct: ["accountId", "securityId"], include: { account: { select: { key: true } }, security: { select: { symbol: true, actions: true } } } });
  const tx = await prisma.portfolioTransaction.findMany({ select: { accountId: true, securityId: true, side: true, qty: true, tradeDate: true } });
  const rows: ReconRow[] = [];
  for (const s of snaps) {
    const acts = s.security.actions.map((a) => ({ effectiveDate: a.effectiveDate.toISOString().slice(0, 10), ratio: Number(a.ratio) }));
    let u = 0;
    for (const t of tx) {
      if (t.accountId !== s.accountId || t.securityId !== s.securityId || t.tradeDate > s.asOf) continue;
      u += (t.side === "BUY" ? 1 : -1) * Number(t.qty) * splitFactor(acts, t.tradeDate.toISOString().slice(0, 10));
    }
    const reported = Number(s.qty), diff = u - reported;
    rows.push({ account: s.account.key, symbol: s.security.symbol, asOf: s.asOf.toISOString().slice(0, 10), rebuilt: u, reported, diff, ok: Math.abs(diff) <= RECONCILE_TOL });
  }
  return rows;
}

/** Reconciles and records the outcome as review items (opened, refreshed while open, auto-resolved when matched). */
export async function reconcile(prisma: PrismaClient): Promise<{ rows: ReconRow[]; opened: number }> {
  const rows = await computeReconciliation(prisma);
  // Batched, not one round trip per position: a portfolio with many accounts/schemes (e.g. ~30+
  // mutual fund folios) turned this into O(positions) sequential findFirst calls, which is slow
  // enough over a real network connection to make ingestion itself time out. One findMany plus a
  // batched createMany, with only the (normally empty) per-row updates left as small parallel calls.
  const refIds = rows.map((row) => `${row.account}|${row.symbol}`);
  const openItems = refIds.length
    ? await prisma.portfolioReviewItem.findMany({ where: { type: "UNITS_MISMATCH", status: "open", refId: { in: refIds } } })
    : [];
  const openByRefId = new Map(openItems.map((i) => [i.refId!, i]));
  let opened = 0;
  const creates: Prisma.PortfolioReviewItemCreateManyInput[] = [];
  const updates: Promise<unknown>[] = [];
  for (const row of rows) {
    const refId = `${row.account}|${row.symbol}`;
    const open = openByRefId.get(refId);
    const detail = `${refId}: rebuilt ${row.rebuilt.toFixed(6)} vs broker ${row.reported.toFixed(6)} as of ${row.asOf} (diff ${row.diff.toFixed(6)})`;
    if (!row.ok && !open) { creates.push({ type: "UNITS_MISMATCH", refTable: "position_snapshots", refId, detail }); opened++; }
    else if (!row.ok && open) updates.push(prisma.portfolioReviewItem.update({ where: { id: open.id }, data: { detail } }));
    else if (row.ok && open) updates.push(prisma.portfolioReviewItem.update({ where: { id: open.id }, data: { status: "resolved", resolvedAt: new Date() } }));
  }
  if (creates.length) await prisma.portfolioReviewItem.createMany({ data: creates });
  if (updates.length) await Promise.all(updates);
  return { rows, opened };
}
