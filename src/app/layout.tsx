import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Expense Tracker",
  description: "Personal expense tracking, categorization, and insights.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex bg-slate-50 text-slate-900">
        <Nav />
        <main className="flex-1 min-w-0 p-6 md:p-8">{children}</main>
      </body>
    </html>
  );
}
