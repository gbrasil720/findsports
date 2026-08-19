# Redesign da página pública do bar (`/pub/$pubId`)

Decisões fechadas na sessão de grilling. Escopo: UI + duas correções de query.
Sem migration.

## 1. Contrato da página

| Item | Decisão |
|---|---|
| Job número um | Levar o torcedor até o bar |
| Métrica | `whatsapp_opened` + `directions_opened` + `phone_clicked` por `profile_view` |
| Persona otimizada | Fã vindo de um jogo (`?eventId`), no celular |
| Estrutura | Scroll único, mobile-first. **Sem tabs** — o admin usa tabs porque é ferramenta de trabalho recorrente; aqui é decisão de 15 segundos |
| Escopo | UI com o dado que já existe. Slots reservados para cardápio, reserva e avaliações |

## 2. Ordem do conteúdo

1. **Faixa de preview** — só para o dono do bar.
2. **Capa + identidade** — foto (ou capa gerada), nome, bairro/cidade, selo de
   plano, botão favoritar (só role `fan`).
3. **Jogo-herói** — o jogo de `?eventId`; sem ele, o próximo jogo. Escudos,
   campeonato, horário, badge `ACONTECENDO AGORA` quando aplicável.
4. **Bloco de ação** — WhatsApp com mensagem pronta (primário), Rota, Ligar.
   No mobile vira barra fixa no rodapé.
5. **Mapa estático clicável** + endereço completo — uma vez só na página.
6. **Outros jogos** — agrupados por dia.
7. **Sobre o bar** — descrição + slots futuros (cardápio, avaliações).

Hoje `address / neighborhood / city` aparecem em três cards do herói **e** de
novo na sidebar. Consolidar em uma ocorrência, no bloco do mapa.

## 3. Jogo-herói

- Resolve `?eventId` contra `pub.events`. Não encontrado ou ausente: usa o
  próximo jogo. Sem jogo nenhum: ver §6.
- **Correção de query em `pubs.getById`**: hoje filtra `startsAt >= now()`, então
  um jogo que começou 5 minutos atrás some — exatamente no pico de intenção.
  Passa a incluir jogos ao vivo:
  `startsAt <= now() AND coalesce(endsAt, startsAt + interval '3 hours') >= now()`.
  Ordena ao vivo primeiro, depois `startsAt asc`.

## 4. CTA

- Primário: `https://wa.me/55<dígitos>?text=<mensagem>`, só quando
  `phone && phoneAcceptsWhatsapp`.
- Mensagem: `Oi! Vi no Onside que vocês vão passar <jogo> <dia/hora>. Têm mesa?`
  Sem jogo-herói, cai para a versão sem jogo.
- Sem WhatsApp: primário vira Rota; Ligar aparece se houver `phone`.
- O CTA primário é **um componente só**, com a implementação por trás
  trocável — quando a reserva automática existir, ela assume esse slot sem
  reescrever o layout.
- Todo clique continua disparando `trackCommercialEvent` + `analytics.barIntent`
  com o `sourceEventId` do jogo-herói.

## 5. Plano

- `pro` / `elite`: selo verificado no herói + capa em altura grande.
- `starter`: mesma informação, capa compacta, sem selo. Nada escondido.
- `plan` já vem no retorno de `getById` (só `geo` e `userId` são omitidos).
- `plan.tsx` (pricing) passa a listar o que o perfil ganha por plano, marcando
  cardápio/promoções/galeria como roadmap — sem prometer o que não existe.

## 6. Estados vazios

| Buraco | Torcedor vê | Dono vê a mais |
|---|---|---|
| Sem `photoUrl` | Capa gerada: fundo da identidade Onside + iniciais + bairro/cidade. Altura igual à da capa com foto | "Bares com foto recebem mais contatos" + link para o admin |
| Sem `phone`/WhatsApp | Bloco de ação degrada para Rota. Sem botão cinza, sem buraco | "Seu perfil está perdendo contatos" + link |
| Sem jogos | "Esse bar ainda não cadastrou jogos" + CTA de contato ("pergunte o que vai passar") | Link para cadastrar jogo |
| Sem `description` | Seção "Sobre" some | Aviso inline |

Nunca sugerir outros bares na página — mandar o cliente do bar embora
contradiz o job da página.

## 7. Correções de comportamento

- **Header**: `pub.$pubId.tsx` fixa `<AppShell variant="pub">`. O fã — persona
  número um — vê o chrome de dono de bar ("ONSIDE PARA BARES"). Passa a derivar
  da sessão: `fan` → `fan`, `pub` → `pub`, sem sessão → `public`.
- **Favoritar**: `pubs.favorite` exige `role === 'fan'`; hoje o botão aparece
  para todos e o dono do próprio bar toma `FORBIDDEN` ao clicar. Renderizar só
  para `fan`.
- **Contagem de favoritos**: não exibir. Bar novo com "2 favoritos" é prova
  social negativa.

## 8. Riscos

- `VITE_GOOGLE_MAPS_PUBLIC_KEY` é opcional no schema de env. Sem chave, o mapa
  estático precisa degradar para o bloco de endereço + botão, nunca para uma
  imagem quebrada.
- Static Maps cobra por requisição e exige restrição de origem na chave —
  conferir antes de subir.
- A página continua `protectedProcedure` + `noindex`. O bar não ganha tráfego
  orgânico com ela; se isso incomodar, é outra decisão (versão pública rasa),
  fora deste escopo.
