import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeDedupeHash } from "@/lib/dedupe";
import {
  fetchActiveCategoryRules,
  matchCategoryRuleFromList,
} from "@/lib/categorize";

/**
 * External ingest endpoint for the Claude-orchestrated Gmail import (plan doc section 8.6/8.7).
 * The app itself never touches Gmail/OAuth — a scheduled Claude task parses statement/alert
 * emails and POSTs the extracted transactions here.
 *
 * Auth: static API key via `x-api-key` header, checked against process.env.INGEST_API_KEY.
 * This is a personal single-user app — a shared secret is sufficient, no OAuth needed for
 * a machine-to-machine call the operator (Sangeeth) controls both ends of.
 */

type IngestTxn = {
  txnDate: string; // ISO date, e.g. "2026-09-02"
  rawDescription: string;
  amount: number; // signed, negative = expense, IN THE CURRENCY BELOW (native, not INR-converted)
  currency?: string; // default "INR". A non-INR value forces needs_review — see note below.
  accountName: string; // must match an existing Account.name (e.g. "iciciSavings")
  source: "gmail_daily" | "gmail_monthly_reconcile" | "manual" | "csv_import";
  categoryName?: string; // if the caller (Claude task) already resolved a category via its own reasoning
  suggestionReason?: string; // why, if uncertain — shown in the Review Queue
  // Stable per-transaction identifier from the source — a Gmail message id for a gmail_daily
  // alert email, or a bank-provided line reference / statement line index for a
  // gmail_monthly_reconcile delta. Folded into the dedupe hash when present (see
  // src/lib/dedupe.ts) so two genuinely distinct transactions that happen to share
  // date+amount+account+description (e.g. two identical-fare Uber rides the same day) don't
  // collide, while re-sending the same email/line still correctly dedupes. Omit only when no
  // stable ref exists for this row (e.g. manual entry).
  sourceRef?: string;
};

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!process.env.INGEST_API_KEY || apiKey !== process.env.INGEST_API_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.transactions)) {
    return NextResponse.json(
      { error: "expected { transactions: IngestTxn[] }" },
      { status: 400 },
    );
  }

  const txns: IngestTxn[] = body.transactions;
  const batch = await prisma.importBatch.create({
    data: {
      source: txns[0]?.source ?? "gmail_daily",
      status: "running",
      rowsIn: txns.length,
    },
  });

  // Fetched once for the whole batch, not per row — see the note on matchCategoryRuleFromList().
  const categoryRules = await fetchActiveCategoryRules();

  let matched = 0,
    needsReview = 0,
    duplicates = 0,
    errors: { row: number; error: string }[] = [];

  for (let i = 0; i < txns.length; i++) {
    const t = txns[i];
    try {
      const account = await prisma.account.findUnique({
        where: { name: t.accountName },
      });
      const txnDate = new Date(t.txnDate);
      const dedupeHash = computeDedupeHash(
        txnDate,
        t.amount,
        t.accountName,
        t.rawDescription,
        t.sourceRef,
      );

      const existing = await prisma.transaction.findUnique({
        where: { dedupeHash },
      });
      if (existing) {
        duplicates++;
        continue; // idempotent: re-processing the same email/statement line is a no-op
      }

      const currency = t.currency ?? "INR";
      const isForeignCurrency = currency !== "INR";

      let categoryId: string | null = null;
      let status: "categorized" | "needs_review" = "needs_review";
      let suggestionReason = t.suggestionReason ?? null;

      if (isForeignCurrency) {
        // The amount above is native (e.g. USD), not an INR-converted figure — ICICI's alert
        // emails never state one; it only appears on the monthly statement once FX markup is
        // applied. Categorizing/auto-matching a native-currency amount would let it silently
        // enter INR spend totals understated, so this is always routed to review regardless of
        // any rule match, and the schema's `category -> Expenditure` joins used by the Dashboard
        // and Insights aggregates already exclude categoryId=null rows, keeping totals clean
        // until a human enters the real INR amount from the statement.
        suggestionReason =
          suggestionReason ??
          `Foreign currency (${currency} ${Math.abs(t.amount).toFixed(2)}) — enter the INR amount from your statement, then categorize.`;
      } else if (t.categoryName) {
        const cat = await prisma.category.findUnique({
          where: { name: t.categoryName },
        });
        if (cat) {
          categoryId = cat.id;
          status = "categorized";
        } else {
          suggestionReason = `Caller suggested category '${t.categoryName}' which does not exist — routed to review.`;
        }
      }

      if (!isForeignCurrency && !categoryId) {
        const ruleMatch = matchCategoryRuleFromList(
          t.rawDescription,
          categoryRules,
        );
        if (ruleMatch) {
          categoryId = ruleMatch.category.id;
          status = "categorized";
        }
      }

      await prisma.transaction.create({
        data: {
          txnDate,
          rawDescription: t.rawDescription,
          amount: t.amount,
          currency,
          accountId: account?.id ?? null,
          categoryId,
          status,
          source: t.source,
          importBatchId: batch.id,
          dedupeHash,
          suggestionReason: status === "needs_review" ? suggestionReason : null,
        },
      });

      if (status === "categorized") matched++;
      else needsReview++;
    } catch (e) {
      errors.push({
        row: i,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status: errors.length ? "failed" : "completed",
      finishedAt: new Date(),
      rowsMatched: matched,
      rowsNeedsReview: needsReview,
      notes: errors.length ? JSON.stringify(errors).slice(0, 2000) : null,
    },
  });

  return NextResponse.json({
    batchId: batch.id,
    rowsIn: txns.length,
    matched,
    needsReview,
    duplicates,
    errors,
  });
}
