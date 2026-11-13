// Load the 40 dataset replies and the 12 held-out replies into Postgres. No model calls.
// Reads data/ only (never writes to it). Upserts by id, so running it again is safe.
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../src/db/client";
import { replies, type NewReply, type ReplySource } from "../src/db/schema";

const RawReply = z.object({
  id: z.string().min(1),
  sender: z.string(),
  customer: z.string(),
  subject: z.string(),
  body: z.string(),
  received_at: z.iso.datetime({ offset: true }),
  invoice: z.object({
    number: z.string().min(1),
    amount: z.number().nonnegative(),
    currency: z.string().length(3),
    due_date: z.iso.date(),
  }),
});

function load(file: string, source: ReplySource): NewReply[] {
  const rows = z.array(RawReply).parse(JSON.parse(readFileSync(file, "utf8")));
  return rows.map((r) => ({
    id: r.id,
    sender: r.sender,
    customer: r.customer,
    subject: r.subject,
    body: r.body,
    receivedAt: new Date(r.received_at),
    invoiceNumber: r.invoice.number,
    invoiceAmount: r.invoice.amount,
    currency: r.invoice.currency,
    dueDate: r.invoice.due_date,
    source,
  }));
}

const rows = [
  ...load("data/replies.json", "dataset"),
  ...load("data/heldout-replies.json", "heldout"),
];

const db = getDb();
await db
  .insert(replies)
  .values(rows)
  .onConflictDoUpdate({
    target: replies.id,
    set: {
      sender: sql`excluded.sender`,
      customer: sql`excluded.customer`,
      subject: sql`excluded.subject`,
      body: sql`excluded.body`,
      receivedAt: sql`excluded.received_at`,
      invoiceNumber: sql`excluded.invoice_number`,
      invoiceAmount: sql`excluded.invoice_amount`,
      currency: sql`excluded.currency`,
      dueDate: sql`excluded.due_date`,
      source: sql`excluded.source`,
    },
  });

const counts = await db
  .select({ source: replies.source, n: sql<number>`count(*)::int` })
  .from(replies)
  .groupBy(replies.source)
  .orderBy(replies.source);
console.log(`Upserted ${rows.length} replies. In the database now:`, counts);
