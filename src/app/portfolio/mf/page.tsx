import { redirect } from "next/navigation";

// Mutual funds moved under the India rollup 2026-09-24 — it's one of the three blended channels
// (Equity/PMS/MF) now, reached from /portfolio/india's Performance channel-cut rows the same way
// /portfolio/india/equity is. This redirect exists only so the pre-existing /portfolio/mf links
// (the four "Mutual funds — <category>" rows on /portfolio/all, from networth.ts) keep working
// without having to touch that unrelated file.
export default function MutualFundsRedirect() {
  redirect("/portfolio/india/mf");
}
