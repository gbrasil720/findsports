-- WEB-384: Grimório do Houdini. Só se escreve: a trigger recusa UPDATE e DELETE.
CREATE TABLE "admin_action" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"actor_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"kind" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"target_label" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"detail" jsonb
);
--> statement-breakpoint
CREATE INDEX "admin_action_created_at_idx" ON "admin_action" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_action_target_idx" ON "admin_action" USING btree ("target_type","target_id");;--> statement-breakpoint
CREATE FUNCTION "admin_action_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'admin_action só aceita INSERT: o Grimório não se reescreve';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "admin_action_append_only_trigger"
BEFORE UPDATE OR DELETE ON "admin_action"
FOR EACH STATEMENT EXECUTE FUNCTION "admin_action_append_only"();
