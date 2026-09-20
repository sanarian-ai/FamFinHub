import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ingestPortfolio, shapeError } from "@/lib/portfolio/ingest";

/**
 * Portfolio ingest for the scheduled Claude sync tasks (see us-portfolio-data-architecture.md s4/s5).
 * Auth: same shared secret as /api/ingest (`x-api-key` vs INGEST_API_KEY). Excluded from the NextAuth
 * session gate in src/middleware.ts.
 *
 * Body: { source?, dryRun?, overwrite?, notes?, securities[], corporateActions[], transactions[],
 *         cashEvents[], prices[], fx[], positionSnapshots[] } — all arrays optional, at least one non-empty.
 * Idempotent: replaying a payload inserts nothing. Rejected rows are reported and become review items.
 * dryRun=true validates everything and writes nothing. overwrite=true corrects existing prices/fx rows.
 */
const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

export async function POST(req: NextRequest) {
  const key = process.env.INGEST_API_KEY;
  const got = req.headers.get("x-api-key");
  if (!key || !got || !safeEq(got, key)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const bad = shapeError(body);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  try {
    return NextResponse.json(await ingestPortfolio(prisma, body));
  } catch (e) {
    console.error("portfolio ingest failed", e);
    return NextResponse.json({ error: "ingest failed", detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
