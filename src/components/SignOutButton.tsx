"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/sign-in" })}
      className="text-xs font-medium text-slate-400 hover:text-slate-600 hover:underline"
    >
      Sign out
    </button>
  );
}
