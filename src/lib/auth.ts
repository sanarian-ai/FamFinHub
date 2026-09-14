import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

/**
 * Google OAuth, identity-only — no Gmail scope requested (Gmail access lives entirely in the
 * separate Claude-orchestrated import, see plan doc section 8.4/8.6). This is what gates the
 * app's own pages; it has nothing to do with the scheduled Gmail-import task, which never goes
 * through a browser session and keeps using its own static x-api-key on /api/ingest.
 *
 * Single-family allowlist instead of open sign-up: only ALLOWED_EMAILS (comma-separated) may
 * sign in. No users table, no roles — this is a 2-person personal app, not a multi-tenant one.
 */
const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/sign-in",
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      if (allowedEmails.length === 0) {
        // Fail closed, not open — an empty/misconfigured ALLOWED_EMAILS should never mean
        // "anyone can sign in", it should mean "no one can" until it's set correctly.
        return false;
      }
      return allowedEmails.includes(user.email.toLowerCase());
    },
    async session({ session }) {
      return session;
    },
  },
};
