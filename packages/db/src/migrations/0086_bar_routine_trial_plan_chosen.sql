-- Expand: rotina do cadastro e escolha do plano do teste. O padrão now()
-- conta como escolhido todo bar de antes da coluna e o que o código anterior
-- cria durante o deploy; só o `completePub` novo grava nulo.
ALTER TABLE "bar" ADD COLUMN "routine" jsonb;--> statement-breakpoint
ALTER TABLE "bar" ADD COLUMN "trial_plan_chosen_at" timestamp DEFAULT now();
