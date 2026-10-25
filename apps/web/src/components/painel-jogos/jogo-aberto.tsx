import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { gameTitle } from '@findsports_oficial/db/game-title'
import { Link } from '@tanstack/react-router'
import type { inferRouterOutputs } from '@trpc/server'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import type { AdminEvent } from '@/components/admin/admin-model'
import { getEventTemporalState } from '@/domain/events'
import { ehRascunho, marcouHa } from '@/domain/painel-jogos'
import { formatDayLabel, formatEventTime } from '@/domain/pub-profile'
import {
  Avatar,
  Badge,
  Botao,
  BotaoIcone,
  CabecalhoCard,
  Card,
  EmBreve,
  Icone,
  Toggle
} from '../painel'

export type JogoQuemVai =
  inferRouterOutputs<AppRouter>['barReservations']['going'][number]
type Pessoa = JogoQuemVai['people'][number]

/** "Rascunho", "Ao vivo", "Publicado" ou "Encerrado" (o `stBadge` do design). */
export function SeloJogo({
  startsAt,
  endsAt,
  publishedAt
}: {
  startsAt: string | Date
  endsAt: string | Date | null
  publishedAt?: string | Date | null
}) {
  if (publishedAt === null) return <Badge tipo="draft">Rascunho</Badge>
  const estado = getEventTemporalState(startsAt, endsAt)
  return estado === 'live' ? (
    <Badge tipo="live">Ao vivo</Badge>
  ) : estado === 'past' ? (
    <Badge tipo="muted">Encerrado</Badge>
  ) : (
    <Badge tipo="pub">Publicado</Badge>
  )
}

/** Uma pessoa da lista de quem vai: quando marcou e se já validou o código. */
export function PessoaQuemVai({
  pessoa,
  comecou
}: {
  pessoa: Pessoa
  /** O jogo já começou: quem não validou "ainda não chegou". */
  comecou: boolean
}) {
  return (
    <li className="jogos-pessoa">
      <Avatar nome={pessoa.name} ativo={!!pessoa.validatedAt} />
      <div>
        <b>{pessoa.name}</b>
        <span>{marcouHa(new Date(pessoa.markedAt))}</span>
      </div>
      {pessoa.validatedAt ? (
        <Badge tipo="acid">
          ✓ Validou {formatEventTime(new Date(pessoa.validatedAt))}
        </Badge>
      ) : comecou ? (
        <Badge tipo="muted">Ainda não chegou</Badge>
      ) : null}
    </li>
  )
}

/** "24 vão assistir · 9 validaram". */
export function resumoQuemVai(jogo: Pick<JogoQuemVai, 'people' | 'validated'>) {
  const n = jogo.people.length
  return `${n} ${n === 1 ? 'vai' : 'vão'} assistir · ${jogo.validated} ${
    jogo.validated === 1 ? 'validou' : 'validaram'
  }`
}

function KpiJogo({
  valor,
  rotulo,
  destaque
}: {
  valor: ReactNode
  rotulo: ReactNode
  destaque?: boolean
}) {
  return (
    <div className="jogos-kpi" data-destaque={destaque || undefined}>
      <span>{destaque ? <mark>{valor}</mark> : valor}</span>
      <span>{rotulo}</span>
    </div>
  )
}

/** "hoje, 21:30 até 23:30"; o "até" só quando o bar disse quando acaba. */
function quando(evento: AdminEvent) {
  const inicio = new Date(evento.startsAt)
  const dia = formatDayLabel(inicio)
  const fim = evento.endsAt
    ? ` até ${formatEventTime(new Date(evento.endsAt))}`
    : ''
  return `${dia.charAt(0).toLowerCase()}${dia.slice(1)}, ${formatEventTime(inicio)}${fim}`
}

/** O link público do bar, que o dono manda no grupo. */
async function compartilhar(barId: string, titulo: string) {
  const url = `${window.location.origin}/pub/${barId}`
  try {
    if (navigator.share) {
      await navigator.share({ title: titulo, url })
      return
    }
    await navigator.clipboard.writeText(url)
    toast.success('Link do bar copiado.')
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') return
    toast.error('Não foi possível copiar. Copie o endereço da página do bar.')
  }
}

const PREVIA_QUEM_VAI = 5

/**
 * O jogo aberto à direita da lista (`detail2`): situação, números, a oferta,
 * os primeiros de quem vai e as ações. Sem `quemVai`, o bar não tem a lista
 * (só Elite): a seção some. "Viram o jogo" vem do analytics por jogo, quando
 * o plano tem.
 */
export function JogoAberto({
  evento,
  barId,
  oferta,
  quemVai: quemVaiDoJogo,
  viramOJogo: viramDoJogo,
  onFechar,
  onEditar,
  onDuplicar,
  duplicarBloqueado,
  onExcluir,
  onPublicar,
  publicando,
  semMoldura
}: {
  evento: AdminEvent
  barId: string
  oferta: string | null
  /** `undefined`: o bar não vê quem vai; `null`: ninguém marcou. */
  quemVai: JogoQuemVai | null | undefined
  /** `undefined`: o plano não tem analytics por jogo. */
  viramOJogo: number | null | undefined
  onFechar: () => void
  onEditar: () => void
  onDuplicar: () => void
  duplicarBloqueado?: string | null
  onExcluir: () => void
  /** Só no rascunho (WEB-436). */
  onPublicar: () => void
  publicando?: boolean
  /** Dentro da folha lateral (celular), sem o card. */
  semMoldura?: boolean
}) {
  const titulo = gameTitle(evento)
  const comecou = new Date(evento.startsAt).getTime() <= Date.now()
  const rascunho = ehRascunho(evento)
  // Rascunho não está no app: ninguém marca nem vê o jogo.
  const quemVai = rascunho ? undefined : quemVaiDoJogo
  const viramOJogo = rascunho ? undefined : viramDoJogo
  const pessoas = quemVai?.people ?? []
  const validaram = quemVai?.validated ?? 0

  const conteudo = (
    <>
      <div className="jogos-aberto-topo">
        <SeloJogo
          startsAt={evento.startsAt}
          endsAt={evento.endsAt}
          publishedAt={evento.publishedAt}
        />
        <span>
          <BotaoIcone
            icone="share"
            rotulo="Compartilhar o bar"
            tamanho={36}
            onClick={() => void compartilhar(barId, titulo)}
          />
          {semMoldura ? null : (
            <BotaoIcone
              icone="x"
              rotulo="Fechar o jogo"
              tamanho={36}
              onClick={onFechar}
            />
          )}
        </span>
      </div>
      <div>
        <h2
          className="painel-disp"
          style={{ ['--painel-disp-size' as string]: '34px' }}
        >
          {titulo}
        </h2>
        <p className="jogos-aberto-linha">
          {evento.championship} · {quando(evento)}
          {rascunho
            ? ' · rascunho, ainda não aparece no app'
            : evento.attendanceEnabled
              ? ''
              : ' · lista de quem vai desligada'}
        </p>
      </div>

      {quemVai !== undefined || viramOJogo !== undefined ? (
        <div className="jogos-kpis">
          {quemVai !== undefined ? (
            <>
              <KpiJogo valor={pessoas.length} rotulo="vão assistir" destaque />
              <KpiJogo valor={validaram} rotulo="validaram" />
            </>
          ) : null}
          {viramOJogo !== undefined ? (
            <KpiJogo valor={viramOJogo ?? '—'} rotulo="viram o jogo" />
          ) : null}
        </div>
      ) : null}

      <div className="jogos-sub">
        <Icone nome="ticket" tamanho={22} />
        <div className="jogos-sub-texto">
          <b>
            Oferta da casa neste jogo <EmBreve />
          </b>
          <span>{oferta ?? 'Sem oferta da casa no seu espaço.'}</span>
        </div>
        <Toggle
          ligado={!!oferta}
          onChange={() => {}}
          disabled
          rotulo="Oferta da casa neste jogo"
        />
      </div>

      {quemVai !== undefined ? (
        <div>
          <CabecalhoCard
            titulo="Quem vai"
            nivel={3}
            tamanho={15}
            meta={
              pessoas.length
                ? comecou
                  ? `${validaram} de ${pessoas.length} chegaram`
                  : `${pessoas.length} ${pessoas.length === 1 ? 'marcou' : 'marcaram'}`
                : undefined
            }
          />
          {pessoas.length ? (
            <>
              <ul className="jogos-quem-vai">
                {pessoas.slice(0, PREVIA_QUEM_VAI).map((pessoa) => (
                  <PessoaQuemVai
                    key={`${pessoa.name}-${pessoa.markedAt}`}
                    pessoa={pessoa}
                    comecou={comecou}
                  />
                ))}
              </ul>
              <Link
                to="/admin/quem-vai"
                hash={`jogo-${evento.id}`}
                className="jogos-ver-todos"
              >
                Ver os {pessoas.length} →
              </Link>
            </>
          ) : (
            <p className="jogos-dica" style={{ marginTop: 8 }}>
              Ninguém marcou ainda.
            </p>
          )}
        </div>
      ) : null}

      <div className="jogos-acoes">
        {rascunho ? (
          <Botao variante="acid" onClick={onPublicar} disabled={publicando}>
            {publicando ? 'Publicando…' : 'Publicar'}
          </Botao>
        ) : null}
        <Botao onClick={onEditar}>Editar</Botao>
        <Botao
          onClick={onDuplicar}
          disabled={!!duplicarBloqueado}
          title={duplicarBloqueado ?? undefined}
        >
          Duplicar
        </Botao>
        <Botao variante="danger" onClick={onExcluir}>
          Excluir
        </Botao>
      </div>
    </>
  )

  return semMoldura ? (
    <section className="jogos-aberto" aria-label={`Jogo aberto: ${titulo}`}>
      {conteudo}
    </section>
  ) : (
    <Card
      className="jogos-aberto"
      aria-label={`Jogo aberto: ${titulo}`}
      role="region"
    >
      {conteudo}
    </Card>
  )
}
