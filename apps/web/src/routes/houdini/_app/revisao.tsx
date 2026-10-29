import type { AppRouter } from '@findsports_oficial/api/routers/index'
import {
  photoCategoryLabel,
  REVIEW_REASON_MAX
} from '@findsports_oficial/db/bar-gallery'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { inferRouterOutputs } from '@trpc/server'
import { type CSSProperties, type ReactNode, useState } from 'react'
import { toast } from 'sonner'

import { formatDateTime } from '@/components/houdini/format'
import { HoudiniShell, PageHead } from '@/components/houdini/shell'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/houdini/_app/revisao')({
  head: () => ({ meta: [{ title: 'Revisão — Houdini' }] }),
  component: RevisaoPage
})

type Queue = inferRouterOutputs<AppRouter>['adminReview']['queue']

/**
 * Motivos prontos, das três coisas que a tela de envio (28c) pede para evitar.
 * O dono lê o motivo como está, seguido de "Envie outra do mesmo espaço."
 */
const PHOTO_REASONS = [
  'Tem pessoas identificáveis no primeiro plano.',
  'Tem texto sobre a foto.',
  'Parece imagem de banco, não do bar.'
]

/** Motivos prontos para o comentário da avaliação (WEB-451). */
const COMMENT_REASONS = [
  'Ofensivo ou com ataque pessoal.',
  'Não fala do jogo no bar.',
  'Tem dado pessoal (telefone, e-mail, endereço).'
]

/**
 * Revisão (WEB-462, WEB-478, WEB-451): as fotos e as descrições que os bares
 * mandaram e os comentários das avaliações, da mais antiga para a mais nova.
 * Nada aparece antes de ser aprovado; recusar pede o motivo (o da foto e o da
 * descrição o dono lê no Meu espaço; o do comentário fica no Grimório). Cada
 * decisão fica no Grimório.
 */
function RevisaoPage() {
  const { env, admin } = Route.useRouteContext()
  const trpc = useTRPC()
  const queue = useQuery({
    ...trpc.adminReview.queue.queryOptions(),
    meta: { errorToast: false }
  })
  const photos = queue.data?.photos ?? []
  const descriptions = queue.data?.descriptions ?? []
  const comments = queue.data?.comments ?? []

  return (
    <HoudiniShell env={env} user={admin}>
      <div className="hd-page">
        <PageHead
          overline="Pede atenção"
          title="Revisão"
          summary="O que os bares e os torcedores mandaram, do mais antigo para o mais novo. Nada aparece antes de ser aprovado; a recusa de foto e de descrição leva o motivo, que o dono lê no Meu espaço. Cada decisão fica no Grimório."
        />

        {queue.isError ? (
          <div className="hd-card" role="alert">
            <p style={{ margin: 0 }}>
              {getUserFacingMessage(
                queue.error,
                'Não foi possível carregar a fila.'
              )}
            </p>
            <button
              type="button"
              className="hd-btn"
              style={{ alignSelf: 'flex-start', marginTop: 12 }}
              onClick={() => void queue.refetch()}
            >
              Tentar de novo
            </button>
          </div>
        ) : queue.isLoading ? (
          <div className="hd-skeleton" style={{ height: 220 }} />
        ) : (
          <>
            <QueueSection
              id="revisao-fotos"
              title="Fotos"
              count={photos.length}
            >
              {photos.length ? (
                <div
                  className="hd-grid is-fila"
                  style={{ '--hd-min': 'min(300px, 100%)' } as CSSProperties}
                >
                  {photos.map((photo) => (
                    <PhotoCard key={photo.id} photo={photo} />
                  ))}
                </div>
              ) : (
                <p className="hd-empty is-dashed">Nenhuma foto esperando.</p>
              )}
            </QueueSection>
            <QueueSection
              id="revisao-descricoes"
              title="Descrições"
              count={descriptions.length}
            >
              {descriptions.length ? (
                <div
                  className="hd-grid is-fila"
                  style={{ '--hd-min': 'min(380px, 100%)' } as CSSProperties}
                >
                  {descriptions.map((item) => (
                    <DescriptionCard key={item.barId} item={item} />
                  ))}
                </div>
              ) : (
                <p className="hd-empty is-dashed">
                  Nenhuma descrição esperando.
                </p>
              )}
            </QueueSection>
            <QueueSection
              id="revisao-comentarios"
              title="Comentários"
              count={comments.length}
            >
              {comments.length ? (
                <div
                  className="hd-grid is-fila"
                  style={{ '--hd-min': 'min(340px, 100%)' } as CSSProperties}
                >
                  {comments.map((item) => (
                    <CommentCard key={item.ratingId} item={item} />
                  ))}
                </div>
              ) : (
                <p className="hd-empty is-dashed">
                  Nenhum comentário esperando.
                </p>
              )}
            </QueueSection>
          </>
        )}
      </div>
    </HoudiniShell>
  )
}

function QueueSection({
  id,
  title,
  count,
  children
}: {
  id: string
  title: string
  count: number
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={id}
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div className="hd-card-hd">
        <h2 id={id} className="hd-h2">
          {title}
        </h2>
        <span className="meta">
          {count ? `${count} esperando` : 'fila vazia'}
        </span>
      </div>
      {children}
    </section>
  )
}

function useDecided() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.adminReview.queue.queryKey()
      }),
      queryClient.invalidateQueries({ queryKey: trpc.grimorio.pathKey() })
    ])
}

/** Aprovar na hora; recusar abre o motivo, com os prontos à mão. */
export function Decision({
  label,
  reader = 'o bar lê',
  presets,
  pending,
  onApprove,
  onReject
}: {
  label: string
  /** Quem lê o motivo, no rótulo do campo. */
  reader?: string
  presets: readonly string[]
  pending: boolean
  onApprove: () => void
  onReject: (reason: string) => void
}) {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  if (!rejecting) {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="hd-btn hd-btn-primary"
          style={{ flex: 1 }}
          disabled={pending}
          onClick={onApprove}
        >
          {pending ? 'Gravando…' : 'Aprovar'}
        </button>
        <button
          type="button"
          className="hd-btn hd-btn-danger"
          style={{ flex: 1 }}
          disabled={pending}
          onClick={() => setRejecting(true)}
        >
          Recusar
        </button>
      </div>
    )
  }
  return (
    <form
      method="post"
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      onSubmit={(event) => {
        event.preventDefault()
        if (reason.trim()) onReject(reason.trim())
      }}
    >
      {presets.length ? (
        <fieldset className="hd-seg" aria-label="Motivos prontos">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={reason === preset}
              style={{
                whiteSpace: 'normal',
                textAlign: 'left',
                lineHeight: 1.3,
                padding: '8px 12px'
              }}
              onClick={() => setReason(preset)}
            >
              {preset}
            </button>
          ))}
        </fieldset>
      ) : null}
      <label className="hd-label">
        {`Motivo da recusa de ${label} (${reader})`}
        <textarea
          className="hd-input hd-textarea"
          value={reason}
          maxLength={REVIEW_REASON_MAX}
          onChange={(event) => setReason(event.target.value)}
          // biome-ignore lint/a11y/noAutofocus: abriu para escrever o motivo
          autoFocus
        />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="submit"
          className="hd-btn hd-btn-danger"
          style={{ flex: 1 }}
          disabled={pending || !reason.trim()}
        >
          {pending ? 'Gravando…' : 'Confirmar recusa'}
        </button>
        <button
          type="button"
          className="hd-btn"
          disabled={pending}
          onClick={() => {
            setRejecting(false)
            setReason('')
          }}
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

function PhotoCard({ photo }: { photo: Queue['photos'][number] }) {
  const trpc = useTRPC()
  const decided = useDecided()
  const decide = useMutation(
    trpc.adminReview.decidePhoto.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          result.status === 'approved'
            ? `Foto de ${photo.barName} aprovada${result.cover ? ' e já é a capa' : ''}. Anotado no Grimório.`
            : `Foto de ${photo.barName} recusada. Anotado no Grimório.`
        )
        await decided()
      },
      onError: async (error) => {
        toast.error(
          getUserFacingMessage(error, 'Não foi possível gravar a decisão.')
        )
        await decided()
      }
    })
  )

  return (
    <article
      className="hd-card"
      aria-label={`Foto de ${photo.barName}`}
      style={{ gap: 12, padding: 14 }}
    >
      <a
        href={photo.url}
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'block',
          aspectRatio: '4 / 3',
          borderRadius: 5,
          overflow: 'hidden',
          background: 'var(--hd-sub)'
        }}
      >
        <img
          src={photo.url}
          alt={`Foto enviada por ${photo.barName}`}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </a>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap'
          }}
        >
          <strong style={{ fontSize: 15, overflowWrap: 'anywhere' }}>
            {photo.barName}
          </strong>
          <span className="hd-pill">{photoCategoryLabel(photo.category)}</span>
          {photo.coverRequested ? (
            <span className="hd-pill" data-tone="acid">
              pedida como capa
            </span>
          ) : null}
        </div>
        {photo.caption ? (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: 'var(--hd-body)',
              overflowWrap: 'anywhere'
            }}
          >
            “{photo.caption}”
          </p>
        ) : null}
        <span className="hd-small">
          Enviada em {formatDateTime(photo.createdAt)}
        </span>
      </div>
      <Decision
        label="foto"
        presets={PHOTO_REASONS}
        pending={decide.isPending}
        onApprove={() => decide.mutate({ photoId: photo.id, approve: true })}
        onReject={(reason) =>
          decide.mutate({ photoId: photo.id, approve: false, reason })
        }
      />
    </article>
  )
}

function DescriptionCard({ item }: { item: Queue['descriptions'][number] }) {
  const trpc = useTRPC()
  const decided = useDecided()
  const decide = useMutation(
    trpc.adminReview.decideDescription.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          result.status === 'approved'
            ? `Descrição de ${item.barName} aprovada. Anotado no Grimório.`
            : `Descrição de ${item.barName} recusada. Anotado no Grimório.`
        )
        await decided()
      },
      onError: async (error) => {
        toast.error(
          getUserFacingMessage(error, 'Não foi possível gravar a decisão.')
        )
        await decided()
      }
    })
  )
  const text = item.pending ?? ''

  return (
    <article
      className="hd-card"
      aria-label={`Descrição de ${item.barName}`}
      style={{ gap: 12, padding: 16 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <strong style={{ fontSize: 14, overflowWrap: 'anywhere' }}>
          {item.barName}
        </strong>
        {item.submittedAt ? (
          <span className="hd-small">
            Enviada em {formatDateTime(item.submittedAt)}
          </span>
        ) : null}
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 14,
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere'
        }}
      >
        {text}
      </p>
      <p className="hd-small" style={{ margin: 0, overflowWrap: 'anywhere' }}>
        {item.published
          ? `No ar hoje: “${item.published}”`
          : 'Sem descrição no ar.'}
      </p>
      <Decision
        label="descrição"
        presets={[]}
        pending={decide.isPending}
        onApprove={() =>
          decide.mutate({ barId: item.barId, text, approve: true })
        }
        onReject={(reason) =>
          decide.mutate({ barId: item.barId, text, approve: false, reason })
        }
      />
    </article>
  )
}

function CommentCard({ item }: { item: Queue['comments'][number] }) {
  const trpc = useTRPC()
  const decided = useDecided()
  const decide = useMutation(
    trpc.adminReview.decideComment.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          result.status === 'approved'
            ? `Comentário sobre ${item.barName} aprovado. Anotado no Grimório.`
            : `Comentário sobre ${item.barName} recusado. Anotado no Grimório.`
        )
        await decided()
      },
      onError: async (error) => {
        toast.error(
          getUserFacingMessage(error, 'Não foi possível gravar a decisão.')
        )
        await decided()
      }
    })
  )
  const text = item.comment ?? ''

  return (
    <article
      className="hd-card"
      aria-label={`Comentário sobre ${item.barName}`}
      style={{ gap: 12, padding: 16 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap'
          }}
        >
          <strong style={{ fontSize: 14, overflowWrap: 'anywhere' }}>
            {item.barName}
          </strong>
          {item.stars ? (
            <span
              className="hd-pill"
              role="img"
              aria-label={`${item.stars} de 5 estrelas`}
            >
              {'★'.repeat(item.stars)}
              {'☆'.repeat(5 - item.stars)}
            </span>
          ) : null}
          <span className="hd-pill">
            {item.wouldReturn ? 'Voltaria' : 'Não voltaria'}
          </span>
          <span
            className="hd-pill"
            data-tone={item.verified ? 'acid' : undefined}
          >
            {item.verified ? 'verificada' : 'não verificada'}
          </span>
        </div>
        <span className="hd-small" style={{ overflowWrap: 'anywhere' }}>
          {item.authorName} ·{' '}
          {item.identified ? 'aparece com o nome' : 'anônima para o bar'} ·{' '}
          enviado em {formatDateTime(item.submittedAt)}
        </span>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 14,
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere'
        }}
      >
        {text}
      </p>
      <Decision
        label="comentário"
        reader="fica no Grimório"
        presets={COMMENT_REASONS}
        pending={decide.isPending}
        onApprove={() =>
          decide.mutate({ ratingId: item.ratingId, text, approve: true })
        }
        onReject={(reason) =>
          decide.mutate({
            ratingId: item.ratingId,
            text,
            approve: false,
            reason
          })
        }
      />
    </article>
  )
}
