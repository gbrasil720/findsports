CREATE TABLE "friend_call" (
	"id" text PRIMARY KEY NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"event_id" text NOT NULL,
	"bar_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "friend_call_from_to_event_key" UNIQUE("from_user_id","to_user_id","event_id"),
	CONSTRAINT "friend_call_not_self" CHECK ("friend_call"."from_user_id" <> "friend_call"."to_user_id")
);
--> statement-breakpoint
ALTER TABLE "friend_call" ADD CONSTRAINT "friend_call_from_user_id_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_call" ADD CONSTRAINT "friend_call_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_call" ADD CONSTRAINT "friend_call_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_call" ADD CONSTRAINT "friend_call_bar_id_bar_id_fk" FOREIGN KEY ("bar_id") REFERENCES "public"."bar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "friend_call_to_idx" ON "friend_call" USING btree ("to_user_id");--> statement-breakpoint
CREATE INDEX "friend_call_event_idx" ON "friend_call" USING btree ("event_id");