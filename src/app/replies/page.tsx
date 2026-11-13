import { redirect } from "next/navigation";

// The reply list moved to the home page; keep old links working.
export default function RepliesRedirect() {
  redirect("/");
}
