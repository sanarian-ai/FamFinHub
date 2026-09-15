import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import SignInButton from "./SignInButton";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const session = await getServerSession(authOptions);
  if (session) redirect("/");

  const denied = searchParams.error === "AccessDenied";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="text-lg font-semibold text-slate-900">Family Finance Hub</div>
        <p className="mt-1 text-sm text-slate-500">Sangeeth &amp; Ria — personal use only</p>

        {denied && (
          <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            That Google account isn&rsquo;t on the allowed list for this app.
          </p>
        )}

        <div className="mt-6">
          <SignInButton />
        </div>
      </div>
    </div>
  );
}
