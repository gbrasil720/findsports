CREATE TABLE "trial_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"email_hash" text NOT NULL,
	"address_hash" text,
	"bar_id" text,
	"granted" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trial_grant" ADD CONSTRAINT "trial_grant_bar_id_bar_id_fk" FOREIGN KEY ("bar_id") REFERENCES "public"."bar"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trial_grant_email_hash_idx" ON "trial_grant" USING btree ("email_hash");--> statement-breakpoint
CREATE INDEX "trial_grant_address_hash_idx" ON "trial_grant" USING btree ("address_hash");--> statement-breakpoint
CREATE INDEX "trial_grant_bar_id_idx" ON "trial_grant" USING btree ("bar_id");