#!/bin/sh
# Migration nova que o código anterior não aguenta. A migration sobe antes do
# código e o rollback do Worker não a desfaz (AGENTS.md, "expand → contract"),
# então apagar, renomear ou apertar coluna só vale quando nenhum código no ar
# a usa mais. Quem conferiu isso escreve no arquivo, numa linha:
#   -- contract: <por que o código no ar não usa mais isto>
# Uso: scripts/check-migrations.sh <base> (padrão: origin/master)
base=${1:-origin/master}
bad=0
for f in $(git diff --name-only --diff-filter=A "$base" -- 'packages/db/src/migrations/*.sql'); do
  grep -q -- '-- contract:' "$f" && continue
  hits=$(grep -niE 'DROP (TABLE|COLUMN)|RENAME (TO|COLUMN)|SET NOT NULL|SET DATA TYPE' "$f") || continue
  echo "$f: muda o que o código no ar pode estar usando:"
  echo "$hits" | sed 's/^/  /'
  bad=1
done
[ "$bad" = 0 ] || {
  echo "Se o código no ar já não usa, acrescente ao arquivo: -- contract: <motivo>"
  exit 1
}
