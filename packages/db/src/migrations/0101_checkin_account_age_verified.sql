-- Relatório de vulnerabilidades de 20/11/2026 (decisão do dono, 20/11): GPS
-- se falsifica, então check-in só verifica a avaliação se a conta tinha 7
-- dias ou mais na hora do check-in (`CHECK_IN_MIN_ACCOUNT_AGE_DAYS`,
-- `checkInVerifies` em `packages/api/src/lib/check-in.ts`). O código validado
-- no balcão segue valendo como antes. A visita (`visits.ts`) não muda: o
-- check-in de conta nova conta para conquistas e ranking, só não para a nota.
-- `user.created_at` é `timestamp` em UTC; `attendance_checkin.created_at`,
-- `timestamptz`.
CREATE OR REPLACE FUNCTION "bar_rating_is_verified"(p_user text, p_event text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM "attendance_checkin" c
    JOIN "user" a ON a."id" = c."user_id"
    WHERE c."user_id" = p_user AND c."event_id" = p_event
      AND c."created_at" >= (a."created_at" AT TIME ZONE 'UTC') + interval '7 days'
  ) OR EXISTS (
    SELECT 1
    FROM "reservation_code_use" u
    JOIN "reservation_code" rc ON rc."id" = u."code_id"
    JOIN "reservation" r ON r."id" = rc."reservation_id"
    WHERE r."user_id" = p_user AND r."event_id" = p_event
      AND u."undone_at" IS NULL
  )
$$ LANGUAGE sql STABLE;
--> statement-breakpoint
-- Recontagem: só as linhas que mudam passam pelos triggers (`verified`
-- recalculado e o bar recontado), como na 0083.
UPDATE "bar_rating" SET "verified" = "bar_rating_is_verified"("actor_user_id", "event_id")
WHERE "verified" IS DISTINCT FROM "bar_rating_is_verified"("actor_user_id", "event_id");
