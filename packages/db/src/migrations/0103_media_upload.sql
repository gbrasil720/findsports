CREATE TABLE "media_upload" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "media_upload" ADD CONSTRAINT "media_upload_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_upload_user_key_idx" ON "media_upload" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "media_upload_pending_idx" ON "media_upload" USING btree ("created_at") WHERE "media_upload"."confirmed_at" is null;