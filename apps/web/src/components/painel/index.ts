/*
 * Peças do painel do bar (design "Bar Web", Rodada 2). Importe daqui:
 * `import { Card, Botao } from '@/components/painel'`.
 *
 * Tokens e estilos: `painel.css` (claro e escuro pelo tema do sistema; só
 * carrega em `/admin/*`). Variáveis `--painel-*`; classes de texto
 * `painel-disp` (Anton), `painel-mono` (Geist Mono) e `painel-muted`.
 *
 * - `Icone` (`nome`: os ícones duotom do design, `tamanho`, `acento`, `base`)
 * - `Card` (`kind`: hero, live, acid, ink — troca a sombra sólida)
 * - `Botao` (`variante`: acid, ink, sec, danger; `altura`; `icone`),
 *   `propsBotao` para um `Link` com cara de botão, `IconeBotao`, `BotaoIcone`
 * - `Badge` (`tipo`: live, pub, draft, acid, ink, muted) e `EmBreve`
 * - `Chip` (filtro liga/desliga) e `Seg` (uma opção entre chips)
 * - `Toggle` (switch)
 * - `Campo` e `CampoTexto` (rótulo, aside, dica, inicio/fim, foco do design)
 * - `Avatar` de iniciais (`ativo` = acid) e `iniciais(nome)`
 * - `Progresso` (barra de `valor` de `max`)
 * - `Kpi` (número em Anton + rótulo; `topo`, `destaque`)
 * - `CabecalhoPagina` (kicker + título `h1` + linha + ações; `pageHead`)
 * - `CabecalhoCard` (título + meta; `hd`)
 * - `Medalha` do plano (chevrons e estrela; `sobreTinta` no card escuro)
 * - `FaixaSemConexao` (já no shell) e `useOnline`; `ErroBloco`, o bloco que
 *   não carregou, com "Tentar de novo" na falha passageira; `BotaoAcao` (o
 *   botão que conta "Salvando…", "Tentando de novo…", "Salvo") e `useFeito`
 *   (WEB-460)
 * - `PainelShell` (barra lateral + conteúdo; já montado por `routes/admin.tsx`)
 *
 * Conteúdo antigo (só claro) dentro do shell vai num `<div className="painel-legado">`,
 * que vira uma folha clara no tema escuro.
 */
export { Icone, type IconeNome } from './icone'
export { Medalha } from './medalha'
export * from './pecas'
export {
  BotaoAcao,
  ErroBloco,
  FaixaSemConexao,
  useFeito,
  useOnline
} from './rede'
export { PainelShell } from './shell'
