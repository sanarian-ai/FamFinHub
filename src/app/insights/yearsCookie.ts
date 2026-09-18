// Persistence for the Insights page's global "which years" filter.
//
// The filter's source of truth, in priority order, is:
//   1. The `years` URL search param (present whenever a Link/control on the page was clicked —
//      see `qs()` in page.tsx, which always carries the *effective* selection forward so every
//      navigation on the page is shareable/bookmarkable as an exact URL).
//   2. This cookie, written client-side (see YearMultiSelect / ClearYearsFilterLink) whenever the
//      user changes the selection — read server-side in page.tsx so a fresh visit (no `years` in
//      the URL, e.g. typing /insights directly) still opens on the user's last choice.
//   3. If neither exists yet (first-ever visit), the default computed by `defaultRecentYearKeys`.
export const YEARS_COOKIE_NAME = "insights_years";

// "all" means the user explicitly chose every year (collapses back to "no filter"); a
// comma-separated list of yearBucket sortKeys means a specific selection.
export function encodeYearsCookie(keys: number[] | null, totalOptions: number): string {
  if (keys == null || keys.length === totalOptions) return "all";
  return [...keys].sort((a, b) => a - b).join(",");
}

// Returns null for "all years" (explicit), a Set for a specific persisted selection, or
// undefined when there's no cookie at all yet (caller should fall back to the default).
export function decodeYearsCookie(value: string | undefined): Set<number> | null | undefined {
  if (value === undefined) return undefined;
  if (value === "all") return null;
  const keys = value
    .split(",")
    .map((s) => parseInt(s, 10))
    .filter((n) => !Number.isNaN(n));
  return keys.length ? new Set(keys) : null;
}
