CREATE TYPE "public"."support_request_category" AS ENUM('account', 'billing', 'profile', 'events', 'other');--> statement-breakpoint
CREATE TYPE "public"."support_request_status" AS ENUM('open', 'in_progress', 'resolved');--> statement-breakpoint
CREATE TABLE "support_request" (
	"id" text PRIMARY KEY NOT NULL,
	"bar_id" text NOT NULL,
	"subject" text NOT NULL,
	"category" "support_request_category" NOT NULL,
	"description" text NOT NULL,
	"status" "support_request_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_request" ADD CONSTRAINT "support_request_bar_id_bar_id_fk" FOREIGN KEY ("bar_id") REFERENCES "public"."bar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_request_barId_createdAt_idx" ON "support_request" USING btree ("bar_id","created_at");--> statement-breakpoint
CREATE INDEX "support_request_status_createdAt_idx" ON "support_request" USING btree ("status","created_at");