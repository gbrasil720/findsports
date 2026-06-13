CREATE TYPE "public"."subscription_plan" AS ENUM('starter', 'pro', 'elite');--> statement-breakpoint
ALTER TYPE "public"."subscription_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "plan" "subscription_plan" DEFAULT 'starter' NOT NULL;