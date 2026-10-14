-- WEB-387: feitiço com prazo. Nulo = sem prazo; o código que lê ignora a linha vencida.
ALTER TABLE "app_config" ADD COLUMN "expires_at" timestamp;