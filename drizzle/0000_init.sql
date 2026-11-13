CREATE TYPE "public"."category" AS ENUM('paid', 'promise_to_pay', 'dispute', 'resend_invoice', 'out_of_office', 'needs_human');--> statement-breakpoint
CREATE TYPE "public"."confidence" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."reply_source" AS ENUM('dataset', 'heldout', 'pasted');--> statement-breakpoint
CREATE TABLE "classifications" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "classifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"reply_id" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model_category" "category",
	"model_rank" smallint,
	"final_category" "category" NOT NULL,
	"override_reasons" text[] DEFAULT '{}' NOT NULL,
	"confidence" "confidence",
	"reasoning" text,
	"evidence_quote" text,
	"details" jsonb,
	"flags" jsonb,
	"raw_output" jsonb,
	"needs_review" boolean NOT NULL,
	"review_reasons" text[] DEFAULT '{}' NOT NULL,
	"error" text,
	"latency_ms" integer,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"reapplied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corrections" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "corrections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"reply_id" text NOT NULL,
	"from_category" "category",
	"to_category" "category" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replies" (
	"id" text PRIMARY KEY NOT NULL,
	"sender" text NOT NULL,
	"customer" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"invoice_number" text NOT NULL,
	"invoice_amount" numeric(12, 2) NOT NULL,
	"currency" text NOT NULL,
	"due_date" date NOT NULL,
	"source" "reply_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classifications" ADD CONSTRAINT "classifications_reply_id_replies_id_fk" FOREIGN KEY ("reply_id") REFERENCES "public"."replies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_reply_id_replies_id_fk" FOREIGN KEY ("reply_id") REFERENCES "public"."replies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "classifications_reply_version_model_idx" ON "classifications" USING btree ("reply_id","prompt_version","model");--> statement-breakpoint
CREATE INDEX "corrections_reply_idx" ON "corrections" USING btree ("reply_id","created_at");