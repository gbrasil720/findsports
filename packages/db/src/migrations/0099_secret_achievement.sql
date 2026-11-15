CREATE TABLE "secret_achievement" (
	"user_id" text NOT NULL,
	"achievement_id" text NOT NULL,
	"via" text NOT NULL,
	"found_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "secret_achievement_user_id_achievement_id_pk" PRIMARY KEY("user_id","achievement_id")
);
--> statement-breakpoint
ALTER TABLE "secret_achievement" ADD CONSTRAINT "secret_achievement_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;