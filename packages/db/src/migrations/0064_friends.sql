CREATE TABLE "friendship" (
	"requester_id" text NOT NULL,
	"addressee_id" text NOT NULL,
	"via" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "friendship_requester_id_addressee_id_pk" PRIMARY KEY("requester_id","addressee_id"),
	CONSTRAINT "friendship_not_self" CHECK ("friendship"."requester_id" <> "friendship"."addressee_id")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "friend_code" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "activity_visibility" text DEFAULT 'friends' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "friend_requests_from" text DEFAULT 'everyone' NOT NULL;--> statement-breakpoint
ALTER TABLE "friendship" ADD CONSTRAINT "friendship_requester_id_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendship" ADD CONSTRAINT "friendship_addressee_id_user_id_fk" FOREIGN KEY ("addressee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "friendship_pair_idx" ON "friendship" USING btree (LEAST("requester_id", "addressee_id"),GREATEST("requester_id", "addressee_id"));--> statement-breakpoint
CREATE INDEX "friendship_addressee_idx" ON "friendship" USING btree ("addressee_id");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_username_unique" UNIQUE("username");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_friend_code_unique" UNIQUE("friend_code");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_username_format" CHECK ("user"."username" ~ '^[a-z0-9._]{3,20}$');