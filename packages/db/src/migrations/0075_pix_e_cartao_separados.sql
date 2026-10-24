-- WEB-455: "Pix e cartão" (id 14) virou Pix (16) e Cartão (17). Quem tinha o
-- 14 marcado passa a ter os dois (decisão do dono em 24/10/2026). O 14 fica
-- gravado: nenhuma tela o mostra, e o código anterior continua lendo o que
-- lia (expand → contract). Ordenado como `normalizeAmenityIds` grava.
UPDATE "bar"
SET "amenities" = ARRAY(
  SELECT DISTINCT unnest("amenities" || ARRAY[16, 17]) ORDER BY 1
)
WHERE 14 = ANY("amenities")
  AND NOT ("amenities" @> ARRAY[16, 17]);
