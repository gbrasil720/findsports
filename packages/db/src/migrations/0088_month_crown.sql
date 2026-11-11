CREATE TABLE "month_crown" (
	"user_id" text NOT NULL,
	"month" text NOT NULL,
	"won" boolean NOT NULL,
	"value" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "month_crown_user_id_month_pk" PRIMARY KEY("user_id","month")
);
--> statement-breakpoint
ALTER TABLE "month_crown" ADD CONSTRAINT "month_crown_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;