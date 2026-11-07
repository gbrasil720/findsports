CREATE TABLE "app_waitlist" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"user_id" text,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	CONSTRAINT "app_waitlist_email_unique" UNIQUE("email"),
	CONSTRAINT "app_waitlist_email_lower" CHECK ("app_waitlist"."email" = lower("app_waitlist"."email")),
	CONSTRAINT "app_waitlist_source" CHECK ("app_waitlist"."source" in ('landing', 'web'))
);
--> statement-breakpoint
ALTER TABLE "app_waitlist" ADD CONSTRAINT "app_waitlist_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_waitlist_user_idx" ON "app_waitlist" USING btree ("user_id");