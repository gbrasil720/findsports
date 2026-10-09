ALTER TABLE "attendance" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "bar" ADD COLUMN "uf" text;--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "is_national_team" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- WEB-284: as seleções que o seed já gravou. Lista explícita por slug, a chave
-- estável do seed; o restante fica com o default (clube).
UPDATE "team" SET "is_national_team" = true WHERE "slug" IN (
  'brasil', 'argentina', 'franca', 'espanha', 'inglaterra', 'alemanha',
  'portugal', 'uruguai', 'colombia', 'mexico', 'eua', 'japao', 'marrocos',
  'brasil-volei'
);
