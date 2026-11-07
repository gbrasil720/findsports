CREATE TABLE "subscription_cancel_reason" (
	"id" text PRIMARY KEY NOT NULL,
	"bar_id" text NOT NULL,
	"plan" "subscription_plan" NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscription_cancel_reason" ADD CONSTRAINT "subscription_cancel_reason_bar_id_bar_id_fk" FOREIGN KEY ("bar_id") REFERENCES "public"."bar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_cancel_reason_bar_created_idx" ON "subscription_cancel_reason" USING btree ("bar_id","created_at");