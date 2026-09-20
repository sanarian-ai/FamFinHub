// Plain (non-"use client") module — deliberately NOT defined inside RulesTable.tsx, even
// though that's where it's mostly used. RulesTable.tsx has a "use client" directive, and
// Next.js's RSC bundler treats every export of a "use client" module as a client reference
// for server-side compilation, not just its component export. page.tsx (a Server Component)
// importing a plain array from a client module gets an opaque client-reference proxy there,
// not the real array — MATCH_TYPES.map() then fails at runtime in the compiled server bundle
// (h.MATCH_TYPES.map is not a function), even though tsc and next dev's fast-refresh can both
// look fine. Keeping shared plain constants in their own non-client module sidesteps this.
export const MATCH_TYPES = ["exact", "contains", "regex"] as const;
