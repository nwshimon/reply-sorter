import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { CATEGORIES, CONFIDENCES } from "../lib/categories";

// Postgres enums built from the TypeScript lists, so each list is still written once
// and the database rejects any value outside it.
export const REPLY_SOURCES = ["dataset", "heldout", "pasted"] as const;
export type ReplySource = (typeof REPLY_SOURCES)[number];

export const categoryEnum = pgEnum("category", CATEGORIES);
export const confidenceEnum = pgEnum("confidence", CONFIDENCES);
export const replySourceEnum = pgEnum("reply_source", REPLY_SOURCES);

export const replies = pgTable("replies", {
  // "01"–"40" from replies.json, "H01"–"H12" from heldout-replies.json, generated for pasted replies.
  id: text("id").primaryKey(),
  sender: text("sender").notNull(),
  customer: text("customer").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  invoiceNumber: text("invoice_number").notNull(),
  invoiceAmount: numeric("invoice_amount", { precision: 12, scale: 2, mode: "number" }).notNull(),
  currency: text("currency").notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  source: replySourceEnum("source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per classification run. Rows are never overwritten by a new run;
// the current result is the latest successful row for the active prompt_version + model.
export const classifications = pgTable(
  "classifications",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    replyId: text("reply_id")
      .notNull()
      .references(() => replies.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),

    // What the model proposed (null when the call failed) vs. what code decided.
    modelCategory: categoryEnum("model_category"),
    modelRank: smallint("model_rank"),
    finalCategory: categoryEnum("final_category").notNull(),
    overrideReasons: text("override_reasons").array().notNull().default([]),

    confidence: confidenceEnum("confidence"),
    reasoning: text("reasoning"),
    evidenceQuote: text("evidence_quote"),
    details: jsonb("details"),
    flags: jsonb("flags"),
    // The model's validated JSON, kept so policy.ts can be re-run with no model call.
    rawOutput: jsonb("raw_output"),

    needsReview: boolean("needs_review").notNull(),
    reviewReasons: text("review_reasons").array().notNull().default([]),

    // Set on failure (timeout, API error, invalid output); final_category is then needs_human.
    error: text("error"),
    latencyMs: integer("latency_ms"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),

    // Set by reapply-policy.ts when it recomputes the policy columns in place.
    reappliedAt: timestamp("reapplied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("classifications_reply_version_model_idx").on(t.replyId, t.promptVersion, t.model)],
);

// A person's correction. The category shown is the latest correction, else the latest final_category.
export const corrections = pgTable(
  "corrections",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    replyId: text("reply_id")
      .notNull()
      .references(() => replies.id, { onDelete: "cascade" }),
    fromCategory: categoryEnum("from_category"),
    toCategory: categoryEnum("to_category").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("corrections_reply_idx").on(t.replyId, t.createdAt)],
);

export type Reply = typeof replies.$inferSelect;
export type NewReply = typeof replies.$inferInsert;
export type Classification = typeof classifications.$inferSelect;
export type NewClassification = typeof classifications.$inferInsert;
export type Correction = typeof corrections.$inferSelect;
