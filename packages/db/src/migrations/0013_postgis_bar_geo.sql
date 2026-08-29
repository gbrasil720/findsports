-- ESC-01: busca por proximidade com índice espacial.
--
-- Antes: haversine calculado linha a linha sobre toda a tabela `bar`, com o
-- filtro de raio aplicado depois do cálculo. Nenhum índice era utilizável.
-- Depois: coluna `geo` derivada + índice GiST parcial, consultada com
-- `ST_DWithin`.
--
-- Migration puramente aditiva: nenhum registro é alterado ou removido.

CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
ALTER TABLE "bar"
  ADD COLUMN IF NOT EXISTS "geo" geography(Point, 4326)
  GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography
  ) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bar_geo_active_idx" ON "bar" USING GIST ("geo") WHERE "is_active";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bar_isActive_idx" ON "bar" ("is_active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_barId_startsAt_idx" ON "event" ("bar_id", "starts_at");
