# Glossário

Termos de domínio que nomeiam um module do código. Uma linha por termo.

- **Visita**: o torcedor esteve no bar para o jogo; uma por torcedor e jogo (`packages/api/src/lib/visits.ts`). Hoje é o código validado no balcão e não desfeito; o check-in (WEB-408) será a segunda fonte.
- **Pós-jogo**: as perguntas depois do jogo ("Você foi?" e "Voltaria?"), uma fila com um item por jogo e uma resposta numa transação (`packages/api/src/lib/post-game.ts`, router `postGame`).
- **Código do balcão**: o ingresso que o torcedor mostra no bar para ganhar a oferta da casa; só bar que `issuesCounterCode` (Elite vigente) emite (`packages/api/src/lib/current-plan.ts`).
