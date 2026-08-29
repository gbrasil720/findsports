-- ESC-19: configuração de aplicação em tempo de execução.
--
-- Alavancas operacionais viviam como constante de módulo — o caminho de busca
-- em camadas (0018), o limite da waitlist, a cobrança desligada no MVP.
-- Mudar qualquer uma exigia editar código e fazer deploy, justamente no
-- momento de incidente em que se quer o menor risco possível.
--
-- Esta tabela guarda apenas o desvio em relação ao padrão: linha ausente
-- significa "usa o valor de código". Uma base sem nenhuma linha se comporta
-- exatamente como a versão anterior a esta migration, o que é o ponto — o
-- padrão precisa ser o comportamento atual, nunca o novo.
--
-- Migration puramente aditiva: nenhuma tabela existente é tocada.

CREATE TABLE IF NOT EXISTS "app_config" (
  "key" text PRIMARY KEY NOT NULL,
  "value" jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "updated_by" text
);
