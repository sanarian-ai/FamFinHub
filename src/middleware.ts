import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/sign-in" },
});

/**
 * Gates every page + the CSV export route behind a signed-in session. Deliberately excluded:
 *  - /api/auth/*   — NextAuth's own sign-in/callback machinery, must stay reachable pre-session
 *  - /api/ingest   — the Gmail-import pipeline's endpoint. That's a machine-to-machine call from
 *                    a scheduled Claude task with no browser/cookie; it has its own static
 *                    x-api-key check (see src/app/api/ingest/route.ts) and must NOT go through
 *                    this session gate or the scheduled import would break entirely.
 *  - /sign-in      — would otherwise redirect-loop against itself
 *  - _next/static, favicon — static assets
 */
export const config = {
  matcher: ["/((?!api/auth|api/ingest|sign-in|_next/static|_next/image|favicon.ico).*)"],
};
