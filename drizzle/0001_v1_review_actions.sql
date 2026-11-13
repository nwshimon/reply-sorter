ALTER TABLE "classifications" ADD COLUMN "final_parent" "category";--> statement-breakpoint
ALTER TABLE "classifications" ADD COLUMN "final_rank" smallint;--> statement-breakpoint
ALTER TABLE "corrections" ADD COLUMN "action" text DEFAULT 'recategorize' NOT NULL;