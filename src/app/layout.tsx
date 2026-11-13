import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { countInReview } from "@/db/queries";
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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const model = process.env.CLASSIFIER_MODEL ?? "no model set";
  const prompt = process.env.PROMPT_VERSION ?? "?";
  // The open count beside Review. If the database is unreachable the page itself will say so; the sidebar just omits it.
  const waiting = await countInReview().catch(() => 0);
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <aside className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-neutral-200 bg-neutral-50 px-3 py-2 md:fixed md:inset-y-0 md:left-0 md:w-56 md:flex-col md:items-stretch md:gap-0 md:border-b-0 md:border-r md:px-4 md:py-6">
          <div className="mr-2 flex items-center gap-2.5 md:mb-8 md:mr-0 md:px-1">
            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-black text-sm font-bold lowercase tracking-tight text-white">
              rs
            </span>
            <span className="text-sm font-semibold leading-tight tracking-tight">
              reply
              <br className="hidden md:block" /> sorter
            </span>
          </div>
          <nav className="flex w-full gap-1 overflow-x-auto md:flex-col md:gap-1.5">
            <NavLink href="/" also={["/replies"]}>
              Replies
            </NavLink>
            <NavLink href="/review" badge={waiting}>
              Review
            </NavLink>
            <NavLink href="/try">Try a reply</NavLink>
            <NavLink href="/eval">Evaluation</NavLink>
          </nav>
          <div className="ml-auto hidden px-1 pt-6 text-[11px] leading-relaxed text-neutral-500 md:ml-0 md:mt-auto md:block">
            <p className="font-mono">{model}</p>
            <p>prompt {prompt}</p>
          </div>
        </aside>
        <div className="md:pl-56">{children}</div>
      </body>
    </html>
  );
}
