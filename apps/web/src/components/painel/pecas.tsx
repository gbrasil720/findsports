import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  useId
} from 'react'
import { Icone, type IconeNome } from './icone'

/** Junta classes, pulando as vazias. */
function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

/** Variável CSS num `style` (o tipo do React não conhece `--x`). */
function vars(
  values: Record<string, string | number | undefined>,
  style?: CSSProperties
) {
  const out: Record<string, string | number> = { ...(style as object) }
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) out[key] = value
  }
  return out as CSSProperties
}

/* ─── Card ─── */

export type CardKind = 'hero' | 'live' | 'acid' | 'ink'

/** Card do painel. `kind` troca só a sombra sólida, como no design. */
export function Card({
  kind,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { kind?: CardKind }) {
  return (
    <div data-kind={kind} className={cx('painel-card', className)} {...rest} />
  )
}

/* ─── Botão ─── */

export type BotaoVariante = 'acid' | 'ink' | 'sec' | 'danger'

/** Acento do ícone dentro do botão, por variante (como em `btn` do design). */
const ACENTO_BOTAO: Record<BotaoVariante, string> = {
  acid: 'var(--painel-ink)',
  ink: 'var(--painel-acid)',
  sec: 'var(--painel-acc)',
  danger: 'var(--painel-acc)'
}

type BotaoVisual = {
  variante?: BotaoVariante
  /** Altura em px (padrão 44; o design usa 40 e 48 também). */
  altura?: number
  icone?: IconeNome
}

/**
 * Props visuais do botão para usar num `Link` (ou outro elemento):
 * `<Link to="/admin/jogos" {...propsBotao({ variante: 'acid' })}>`.
 */
export function propsBotao(
  { variante = 'sec', altura }: BotaoVisual = {},
  className?: string,
  style?: CSSProperties
) {
  return {
    'data-variante': variante,
    className: cx('painel-btn', className),
    style: vars({ '--painel-btn-h': altura ? `${altura}px` : undefined }, style)
  }
}

/** Ícone no tamanho e acento certos para ir dentro de um botão. */
export function IconeBotao({
  nome,
  variante = 'sec'
}: {
  nome: IconeNome
  variante?: BotaoVariante
}) {
  return <Icone nome={nome} tamanho={18} acento={ACENTO_BOTAO[variante]} />
}

export function Botao({
  variante = 'sec',
  altura,
  icone,
  className,
  style,
  children,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & BotaoVisual) {
  return (
    <button
      type={type}
      {...propsBotao({ variante, altura }, className, style)}
      {...rest}
    >
      {icone ? <IconeBotao nome={icone} variante={variante} /> : null}
      {children}
    </button>
  )
}

/** Botão redondo só de ícone (`iconBtn`). `rotulo` vira o nome acessível. */
export function BotaoIcone({
  icone,
  rotulo,
  tamanho,
  quadrado,
  ponto,
  className,
  style,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icone: IconeNome
  rotulo: string
  /** Lado em px (padrão 40). */
  tamanho?: number
  quadrado?: boolean
  /** Ponto vermelho de novidade no canto. */
  ponto?: boolean
}) {
  return (
    <button
      type={type}
      aria-label={rotulo}
      title={rotulo}
      data-quadrado={quadrado || undefined}
      className={cx('painel-icon-btn', className)}
      style={vars(
        { '--painel-icon-btn': tamanho ? `${tamanho}px` : undefined },
        style
      )}
      {...rest}
    >
      <Icone nome={icone} tamanho={18} />
      {ponto ? <span className="painel-icon-btn-ponto" /> : null}
    </button>
  )
}

/* ─── Badge ─── */

export type BadgeTipo = 'live' | 'pub' | 'draft' | 'acid' | 'ink' | 'muted'

export function Badge({
  tipo = 'pub',
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tipo?: BadgeTipo }) {
  return (
    <span
      data-tipo={tipo}
      className={cx('painel-badge', className)}
      {...rest}
    />
  )
}

/**
 * O selo do que o design mostra e o servidor ainda não tem (decisão do dono,
 * 24/10/2026): a peça aparece desabilitada, com este selo, sem dado inventado.
 */
export function EmBreve({ className }: { className?: string }) {
  return (
    <Badge tipo="muted" className={className}>
      em breve
    </Badge>
  )
}

/* ─── Chip e Seg ─── */

/** Chip de filtro. Ligado: acid com o check (`check={false}` tira). */
export function Chip({
  ativo = false,
  check = true,
  altura,
  className,
  style,
  children,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  ativo?: boolean
  check?: boolean
  altura?: number
}) {
  return (
    <button
      type={type}
      aria-pressed={ativo}
      className={cx('painel-chip', className)}
      style={vars(
        { '--painel-chip-h': altura ? `${altura}px` : undefined },
        style
      )}
      {...rest}
    >
      {ativo && check ? (
        <Icone nome="check" tamanho={13} acento="var(--painel-ink)" />
      ) : null}
      {children}
    </button>
  )
}

export type SegItem<T extends string> = { valor: T; rotulo: ReactNode }

/** Escolha de uma opção entre chips (`seg`): "Lista · Semana", "Próximos · Rascunhos". */
export function Seg<T extends string>({
  itens,
  valor,
  onChange,
  rotulo,
  className
}: {
  itens: readonly SegItem<T>[]
  valor: T
  onChange: (valor: T) => void
  /** Nome do grupo para leitor de tela. */
  rotulo: string
  className?: string
}) {
  return (
    <fieldset className={cx('painel-seg', className)}>
      <legend className="sr-only">{rotulo}</legend>
      {itens.map((item) => (
        <button
          key={item.valor}
          type="button"
          aria-pressed={item.valor === valor}
          className="painel-chip"
          onClick={() => onChange(item.valor)}
        >
          {item.rotulo}
        </button>
      ))}
    </fieldset>
  )
}

/* ─── Toggle ─── */

export function Toggle({
  ligado,
  onChange,
  rotulo,
  className,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & {
  ligado: boolean
  onChange: (ligado: boolean) => void
  /** Nome acessível; omita se um `aria-labelledby` já nomeia o controle. */
  rotulo?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      className={cx('painel-toggle', className)}
      onClick={() => onChange(!ligado)}
      {...rest}
    >
      <span />
    </button>
  )
}

/* ─── Campo ─── */

type CampoBase = {
  rotulo?: ReactNode
  /** Texto à direita do rótulo ("opcional", "0/280"). */
  aside?: ReactNode
  /** Linha de ajuda abaixo da caixa. */
  dica?: ReactNode
  /** Ícone ou texto antes do valor (lead) e depois (trail). */
  inicio?: ReactNode
  fim?: ReactNode
  /** Altura mínima da caixa em px (padrão 46). */
  altura?: number
  className?: string
}

function CampoMoldura({
  id,
  dicaId,
  rotulo,
  aside,
  dica,
  inicio,
  fim,
  altura,
  area,
  className,
  children
}: CampoBase & {
  id: string
  dicaId: string
  area?: boolean
  children: ReactNode
}) {
  return (
    <div className={cx('painel-campo', className)}>
      {rotulo || aside ? (
        <div className="painel-campo-topo">
          {rotulo ? <label htmlFor={id}>{rotulo}</label> : <span />}
          {aside ? <span>{aside}</span> : null}
        </div>
      ) : null}
      <div
        className="painel-campo-caixa"
        data-area={area || undefined}
        style={vars({ '--painel-campo-h': altura ? `${altura}px` : undefined })}
      >
        {inicio}
        {children}
        {fim}
      </div>
      {dica ? (
        <span id={dicaId} className="painel-campo-dica">
          {dica}
        </span>
      ) : null}
    </div>
  )
}

/** Campo de texto com rótulo, aside, dica, lead/trail e foco do design. */
export function Campo({
  rotulo,
  aside,
  dica,
  inicio,
  fim,
  altura,
  className,
  id,
  ...input
}: CampoBase & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId()
  const campoId = id ?? auto
  const dicaId = `${campoId}-dica`
  return (
    <CampoMoldura
      {...{ rotulo, aside, dica, inicio, fim, altura, className }}
      id={campoId}
      dicaId={dicaId}
    >
      <input
        id={campoId}
        aria-describedby={dica ? dicaId : undefined}
        {...input}
      />
    </CampoMoldura>
  )
}

/** O mesmo `Campo`, com várias linhas. */
export function CampoTexto({
  rotulo,
  aside,
  dica,
  inicio,
  fim,
  altura,
  className,
  id,
  ...textarea
}: CampoBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = useId()
  const campoId = id ?? auto
  const dicaId = `${campoId}-dica`
  return (
    <CampoMoldura
      {...{ rotulo, aside, dica, inicio, fim, altura, className }}
      id={campoId}
      dicaId={dicaId}
      area
    >
      <textarea
        id={campoId}
        aria-describedby={dica ? dicaId : undefined}
        {...textarea}
      />
    </CampoMoldura>
  )
}

/* ─── Avatar de iniciais ─── */

/** "Bar do Zé" → "BZ"; "Marina" → "M". Pula "do", "da", "de". */
export function iniciais(nome: string) {
  const palavras = nome
    .trim()
    .split(/\s+/)
    .filter((p) => p && !/^(d[aeo]s?|e)$/i.test(p))
  return palavras
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}

export function Avatar({
  nome,
  ativo = false,
  tamanho = 32,
  className
}: {
  /** Nome inteiro; o avatar mostra as iniciais. */
  nome: string
  /** Fundo acid (o do bar, o de quem chegou agora). */
  ativo?: boolean
  tamanho?: number
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      data-ativo={ativo || undefined}
      className={cx('painel-avatar', className)}
      style={vars({ '--painel-avatar': `${tamanho}px` })}
    >
      {iniciais(nome)}
    </span>
  )
}

/* ─── Barra de progresso ─── */

/**
 * `valor` de `max`. No claro a barra é tinta; no escuro, `cor` (acid por
 * padrão), como `prog` do design.
 */
export function Progresso({
  valor,
  max,
  cor,
  altura,
  rotulo,
  className
}: {
  valor: number
  max: number
  cor?: string
  altura?: number
  /** Nome acessível; sem ele a barra é só decoração. */
  rotulo?: string
  className?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (valor / max) * 100)) : 0
  return (
    <div
      className={cx('painel-prog', className)}
      style={vars({ '--painel-prog-h': altura ? `${altura}px` : undefined })}
      {...(rotulo
        ? {
            role: 'progressbar',
            'aria-label': rotulo,
            'aria-valuenow': valor,
            'aria-valuemin': 0,
            'aria-valuemax': max
          }
        : { 'aria-hidden': true })}
    >
      <span style={vars({ '--painel-prog-cor': cor }, { width: `${pct}%` })} />
    </div>
  )
}

/* ─── KPI ─── */

export function Kpi({
  valor,
  rotulo,
  topo,
  kind,
  destaque,
  tamanho,
  className
}: {
  valor: ReactNode
  rotulo: ReactNode
  /** O que vai acima do número (o sinal de barras do "+42%"). */
  topo?: ReactNode
  kind?: CardKind
  /** Número em acid no escuro (o KPI `hero` do design). */
  destaque?: boolean
  /** Tamanho do número em px (42 no desktop, 34 no tablet). */
  tamanho?: number
  className?: string
}) {
  return (
    <Card
      kind={kind}
      className={cx('painel-kpi', className)}
      style={vars({
        '--painel-kpi-size': tamanho ? `${tamanho}px` : undefined
      })}
    >
      {topo}
      <span className="painel-kpi-valor" data-destaque={destaque || undefined}>
        {valor}
      </span>
      <span className="painel-kpi-rotulo">{rotulo}</span>
    </Card>
  )
}

/* ─── Cabeçalhos ─── */

/**
 * Topo da página (`pageHead`): kicker, título em Anton (o `h1`), linha de
 * resumo opcional (`children`) e as ações à direita.
 */
export function CabecalhoPagina({
  kicker,
  titulo,
  acoes,
  tamanho = 52,
  children
}: {
  kicker?: ReactNode
  titulo: ReactNode
  acoes?: ReactNode
  /** Tamanho do título em px (52; "Hoje na casa" usa 60, o tablet 44). */
  tamanho?: number
  children?: ReactNode
}) {
  // A palavra mais longa não quebra: a 320 px, "DESEMPENHO" a 52 px passava
  // da tela. O título encolhe só quando ela não cabe na largura do cabeçalho
  // (Anton, ~0,5em por caractere); nas larguras normais fica o `tamanho`.
  const palavra =
    typeof titulo === 'string'
      ? Math.max(...titulo.split(/\s+/).map((p) => p.length))
      : 0
  const tamanhoCss = palavra
    ? `min(${tamanho}px, calc(100cqi / ${palavra * 0.5}))`
    : `${tamanho}px`
  return (
    <header className="painel-page-head">
      <div className="painel-page-head-texto">
        {kicker ? <p className="painel-page-head-kicker">{kicker}</p> : null}
        <h1
          className="painel-disp"
          style={vars({ '--painel-disp-size': tamanhoCss })}
        >
          {titulo}
        </h1>
        {children ? <p className="painel-page-head-linha">{children}</p> : null}
      </div>
      {acoes ? <div className="painel-page-head-acoes">{acoes}</div> : null}
    </header>
  )
}

/** Topo de card (`hd`): título em negrito e meta à direita. */
export function CabecalhoCard({
  titulo,
  meta,
  tamanho,
  nivel = 2,
  id,
  className
}: {
  titulo: ReactNode
  meta?: ReactNode
  /** Tamanho do título em px (16; 15 dentro de painel lateral). */
  tamanho?: number
  nivel?: 2 | 3
  /** Para o card usar `aria-labelledby`. */
  id?: string
  className?: string
}) {
  const H = nivel === 3 ? 'h3' : 'h2'
  return (
    <div
      className={cx('painel-hd', className)}
      style={vars({ '--painel-hd-size': tamanho ? `${tamanho}px` : undefined })}
    >
      <H id={id}>{titulo}</H>
      {meta ? <span>{meta}</span> : null}
    </div>
  )
}
