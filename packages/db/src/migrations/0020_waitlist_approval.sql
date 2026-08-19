-- ESC-19: liberação de acesso pela lista de espera.
--
-- A plataforma abre por convite: estar na lista não é estar dentro. Sem uma
-- coluna própria, "aprovado" só poderia significar "existe linha na tabela" —
-- e a linha é criada pelo formulário público, o que deixaria qualquer pessoa
-- se aprovando sozinha.
--
-- Nulo é o estado normal de quem acabou de se cadastrar. Migration aditiva:
-- nenhuma linha existente muda de comportamento, e o portão que lê esta
-- coluna nasce desligado.

ALTER TABLE "waitlist_entries"
  ADD COLUMN IF NOT EXISTS "approved_at" timestamp;
--> statement-breakpoint
ALTER TABLE "waitlist_entries"
  ADD COLUMN IF NOT EXISTS "approved_by" text;
--> statement-breakpoint

-- O portão consulta por e-mail a cada tentativa de entrada. O índice único
-- (email, role, city) já atende o prefixo `email`, mas só entre as linhas
-- aprovadas é que a consulta precisa ser rápida — e elas são a minoria.
CREATE INDEX IF NOT EXISTS "waitlist_approved_email_idx"
  ON "waitlist_entries" ("email") WHERE "approved_at" IS NOT NULL;
