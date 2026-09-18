"use client";

import { useRouter } from "next/navigation";
import { YEARS_COOKIE_NAME, encodeYearsCookie } from "./yearsCookie";

/**
 * The "Clear filter" text link shown under the years-filter note. A plain <Link> here would only
 * drop `years` from the URL — the persisted cookie would still hold the old specific-years
 * selection, so the *next* visit (or the next Link click that omits `years`) would silently
 * bring the old filter back. This persists "all years" explicitly before navigating, matching
 * what YearMultiSelect's own "Select all" does.
 */
export function ClearYearsFilterLink({ href, totalOptions }: { href: string; totalOptions: number }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        document.cookie = `${YEARS_COOKIE_NAME}=${encodeYearsCookie(null, totalOptions)}; path=/; max-age=31536000; samesite=lax`;
        router.push(href);
      }}
      className="font-medium text-slate-700 underline underline-offset-2"
    >
      Clear filter
    </button>
  );
}
