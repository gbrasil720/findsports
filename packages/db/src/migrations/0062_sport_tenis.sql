-- WEB-381: tênis entra como esporte. Os esportes de produção foram semeados à
-- mão (`db:seed:sports`); este vem por migration para chegar sozinho ao deploy,
-- antes do `db:catalog:sync`, que grava os tenistas.
INSERT INTO "sport" ("id", "name", "slug") VALUES (gen_random_uuid()::text, 'Tênis', 'tenis') ON CONFLICT ("slug") DO NOTHING;
