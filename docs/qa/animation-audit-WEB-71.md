# WEB-71 — Varredura de animação e movimento

Data: 2026-09-08

## Decisão

Não adicionar biblioteca. O produto já usa CSS, Tailwind e `tw-animate-css`; os
portais compartilhados já fornecem a mecânica de abertura/fechamento. A mudança
centraliza o vocabulário da marca em `apps/web/src/styles/onside/tokens.css` e
aplica apenas `transform`/`opacity` para novas entradas e superfícies.

`review-animations` não está instalada nos skills disponíveis. A revisão foi
feita manualmente com as regras de `find-animation-opportunities` e
`improve-animations`, incluindo frequência, propósito, duração, origem,
interruptibilidade, performance, reduced motion e tokens.

## Inventário de superfícies

| Superfície | Rotas visitadas | Decisão |
| --- | --- | --- |
| Landing e erro | `/`, `/*` (`index.tsx`, `$.tsx`) | Manter pulse/marquee existentes; manter entradas do 404; reduced motion público já presente; alinhar transições aos tokens. |
| Waitlist/transacionais | `/confirm-waitlist`, `/activate-invite`, `/access-pending`, `/leave-waitlist` | Manter estados estáticos; usar entrada de conteúdo do layout; sem animação de submit além do feedback existente. |
| Auth | `/login`, `/signup`, `/two-factor`, `/verify-email` | Entrada de conteúdo; loaders continuam feedback e param em reduced motion; sem movimento durante digitação. |
| Onboarding | `/onboarding/fan`, `/onboarding/pub` | Entrada de conteúdo; escolhas usam feedback de estado/press; sem stagger de campos. |
| App autenticado | `/dashboard`, `/dashboard/profile`, `/pub/:pubId` | Entrada de conteúdo; dialogs/dropdowns/toasts compartilhados; skeleton mantém pulse e para em reduced motion. |
| Monetização | `/plan`, `/admin`, `/admin/billing` | Entrada de conteúdo; sem movimento decorativo em cards/preços. |
| Painéis internos | `/internal`, `/internal/waitlist`, `/internal/manage-users`, `/internal/flags` | Entrada de conteúdo; dialogs/dropdowns alinhados; accordions existentes mantidos por indicarem expansão. |
| Primitivos compartilhados | `dialog`, `popover`, `dropdown-menu`, `sonner`, `skeleton` | CSS global do app alinha superfícies portaled, toast e loaders sem mudar API ou dependências. |

## Alterações aplicadas

- Tokens `--onside-motion-fast/base/slow`, `--onside-ease-out`,
  `--onside-ease-in-out` e `--onside-motion-distance` em `tokens.css`.
- Entrada de rota de 6px + opacity em 260ms; não bloqueia interação.
- Dialog centralizado com scale 0.97 → 1 em 180ms; popover/dropdown com a
  mesma escala a partir de `--transform-origin`; backdrop acompanha com fade.
- Toast Sonner reduzido do default de 400ms para 260ms de transform e 180ms de
  opacity.
- Press feedback `scale(0.97)` nos botões e `scale(0.98)` nas escolhas.
- `prefers-reduced-motion` agora cobre portais, loaders, skeleton, pulse,
  toast e páginas públicas; preserva fade de estado sem deslocamento.
- Removidas `transition-all`/`transition-[width]` de barras de analytics e
  completude, pois animavam layout e não ajudavam a leitura.

## Rejeições deliberadas

- Marquee da landing: existente, contínuo e decorativo; não expandir para
  conteúdo funcional. Em reduced motion ele fica estático e quebra a linha.
- Hover de cards/listas do dashboard: dezenas de vezes por sessão; cor/sombra
  discreta é suficiente, sem entrada ou stagger.
- Campos de auth e filtros: interação de alta frequência; mover ou animar cada
  mudança atrasa digitação e busca.
- Barras de analytics e completude: largura é propriedade de layout e pode
  sugerir uma evolução intermediária; removida a animação em vez de criar uma
  alternativa decorativa.
- Tabelas e listas internas: conteúdo denso e frequente; sem stagger, fade ou
  reordenação animada.

## Limitações

Não foi feita medição em dispositivo físico nem QA autenticada no navegador.
Não entrou dependência, portanto não há delta de bundle de dependência para
medir; build e checks locais são a validação mecânica aplicável.

## Validação local

- `bun run check` passou; o Biome mantém avisos preexistentes de imports Node,
  `<img>`, `!important` e `utils/styles.css`, sem erro bloqueante.
- `bunx turbo -F web check-types` passou (6 tarefas).
- `bunx turbo -F web build` passou para client e SSR; o build manteve apenas o
  aviso preexistente de chunks acima de 500 kB.
- `git diff --check` passou.
