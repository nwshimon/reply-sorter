import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NavLink } from "@/components/NavLink";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Reply Sorter",
  description: "Sort customer replies to payment reminders, review them, and correct them",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const model = process.env.CLASSIFIER_MODEL ?? "no model set";
  const prompt = process.env.PROMPT_VERSION ?? "?";
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <aside className="flex items-center gap-1 border-b border-neutral-200 px-3 py-2 md:fixed md:inset-y-0 md:left-0 md:w-56 md:flex-col md:items-stretch md:gap-0 md:border-b-0 md:border-r md:px-3 md:py-5 dark:border-neutral-800">
          <p className="mr-3 text-sm font-semibold tracking-tight md:mb-4 md:mr-0 md:px-3 md:text-base">Reply Sorter</p>
          <nav className="flex gap-1 md:flex-col">
            <NavLink href="/">Review</NavLink>
            <NavLink href="/replies">All replies</NavLink>
            <NavLink href="/eval">Evaluation</NavLink>
          </nav>
          <div className="ml-auto hidden px-3 pt-6 text-[11px] leading-relaxed text-neutral-500 md:mt-auto md:ml-0 md:block">
            <p className="font-mono">{model}</p>
            <p>prompt {prompt}</p>
          </div>
        </aside>
        <div className="md:pl-56">{children}</div>
      </body>
    </html>
  );
}
