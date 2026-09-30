-- WEB-131: disposição do bar de receber reservas. Aditiva e desligada por
-- padrão: nenhum bar existente, Elite ou não, passa a receber pedidos por
-- causa desta migration. Quem pode ligar (Elite vigente) é decidido na API.
ALTER TABLE "bar" ADD COLUMN "accepts_reservations" boolean DEFAULT false NOT NULL;
