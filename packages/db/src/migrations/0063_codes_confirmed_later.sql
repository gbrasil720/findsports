ALTER TABLE "bar" ADD COLUMN "confirms_codes_later" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reservation_code_use" ADD COLUMN "late" boolean DEFAULT false NOT NULL;