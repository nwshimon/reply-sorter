import { redirect } from "next/navigation";

// Review is now the landing page; keep old links working.
export default function ReviewRedirect() {
  redirect("/");
}
