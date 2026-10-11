import {
  PHOTO_CONTENT_TYPES,
  PHOTO_MAX_BYTES
} from '@findsports_oficial/api/lib/blob-photo'
import {
  FEEDBACK_MAX_IMAGES,
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_MIN_LENGTH
} from '@findsports_oficial/api/lib/feedback'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@findsports_oficial/ui/components/dialog'
import { useMutation } from '@tanstack/react-query'
import {
  type FormEvent,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState
} from 'react'
import ImagePlus from 'reicon-react/icons/ImagePlus'
import Xmark from 'reicon-react/icons/Xmark'
import { analytics } from '@/lib/analytics'
import { getErrorCode, getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

type Props = {
  open: boolean
  onClose: () => void
  /** Quem abriu o diálogo: o foco volta para lá ao fechar. */
  returnFocus: RefObject<HTMLElement | null>
}

type Attached = { id: string; name: string; blob: Blob; url: string }

const MAX_MB = PHOTO_MAX_BYTES / 1024 / 1024
/** Lado maior, em px, da imagem reduzida antes do envio. */
const MAX_SIDE = 2000
/** Recusas de `feedback.send` que já chegam escritas para quem usa. */
const OWN_REFUSALS = [
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'TOO_MANY_REQUESTS'
]

/**
 * Deixa a imagem pronta para ir de anexo. Foto de celular (8 a 12 MB, 4000 px)
 * é redesenhada com o lado maior em 2000 px e sai JPEG de menos de 1 MB; a
 * que já cabe vai como está. Recusa com a frase que a tela mostra.
 */
async function prepareImage(file: File): Promise<Blob> {
  const label = `"${file.name}"`
  if (!(PHOTO_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    throw new Error(`${label} não é JPEG, PNG nem WebP.`)
  }
  const tooLarge = new Error(
    `${label} passa de ${MAX_MB} MB e não deu para reduzir.`
  )
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) {
    throw file.size > PHOTO_MAX_BYTES
      ? tooLarge
      : new Error(`Não conseguimos abrir ${label}. Tente outra imagem.`)
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.size <= PHOTO_MAX_BYTES) {
    bitmap.close()
    return file
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw tooLarge
  // PNG com transparência vira JPEG: sem isto o fundo sairia preto.
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85)
  )
  if (!blob || blob.size > PHOTO_MAX_BYTES) throw tooLarge
  return blob
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

/**
 * Feedback de dentro do app: vira um e-mail para a Onside (`feedback.send`).
 * O formulário mora dentro do `DialogContent`, que só existe com o diálogo
 * aberto: cada abertura começa do zero.
 */
export function FeedbackDialog({ open, onClose, returnFocus }: Props) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        finalFocus={returnFocus}
        className="onside-dialog max-w-[calc(100vw-2rem)] overflow-y-auto p-5 sm:max-w-lg sm:p-6"
      >
        <FeedbackForm onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

function FeedbackForm({ onClose }: { onClose: () => void }) {
  const trpc = useTRPC()
  const ids = useId()
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [images, setImages] = useState<Attached[]>([])
  const [imageError, setImageError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const send = useMutation(trpc.feedback.send.mutationOptions())

  // As miniaturas são object URLs: soltam a memória quando o diálogo fecha.
  const attached = useRef(images)
  attached.current = images
  useEffect(
    () => () => {
      for (const image of attached.current) URL.revokeObjectURL(image.url)
    },
    []
  )

  const length = message.trim().length
  const tooLong = length > FEEDBACK_MAX_LENGTH
  const valid = length >= FEEDBACK_MIN_LENGTH && !tooLong
  const full = images.length >= FEEDBACK_MAX_IMAGES

  const addImages = async (files: File[]) => {
    const problems: string[] = []
    const added: Attached[] = []
    for (const file of files) {
      if (images.length + added.length >= FEEDBACK_MAX_IMAGES) {
        problems.push(
          `Cabem ${FEEDBACK_MAX_IMAGES} imagens por mensagem: as outras ficaram de fora.`
        )
        break
      }
      try {
        const blob = await prepareImage(file)
        added.push({
          id: crypto.randomUUID(),
          name: file.name,
          blob,
          url: URL.createObjectURL(blob)
        })
      } catch (problem) {
        problems.push((problem as Error).message)
      }
    }
    setImages((current) => [...current, ...added])
    setImageError(problems.join(' ') || null)
  }

  const removeImage = (image: Attached) => {
    URL.revokeObjectURL(image.url)
    setImages((current) => current.filter(({ id }) => id !== image.id))
    setImageError(null)
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!valid || sending) return
    setSending(true)
    setError(null)
    try {
      await send.mutateAsync({
        message,
        pageUrl: window.location.href,
        images: await Promise.all(images.map(({ blob }) => toBase64(blob)))
      })
      analytics.feedbackSent(images.length)
      setSent(true)
    } catch (err) {
      const code = getErrorCode(err)
      setError(
        code && OWN_REFUSALS.includes(code) && err instanceof Error
          ? err.message
          : getUserFacingMessage(
              err,
              'Não conseguimos enviar agora. Tente de novo em instantes.'
            )
      )
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div role="status">
        <DialogTitle className="onside-display text-2xl">
          Feedback enviado
        </DialogTitle>
        <p className="mt-3 text-sm">Recebemos. Obrigado por contar.</p>
        <button
          type="button"
          onClick={onClose}
          className="onside-btn onside-btn-acid onside-btn-full mt-5"
        >
          Fechar
        </button>
      </div>
    )
  }

  return (
    <>
      <DialogTitle className="onside-display text-2xl">
        Enviar feedback
      </DialogTitle>
      <DialogDescription className="mt-1 text-[var(--onside-muted)] text-sm">
        Sua mensagem chega direto à equipe da Onside, com seu nome, e-mail e a
        página em que você está.
      </DialogDescription>

      <form
        method="post"
        onSubmit={handleSubmit}
        noValidate
        className="mt-4 space-y-4"
      >
        <div>
          <label htmlFor={`${ids}-message`} className="onside-label">
            O que você quer contar pra gente?
          </label>
          <textarea
            id={`${ids}-message`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            className="onside-textarea"
            aria-invalid={tooLong ? true : undefined}
            aria-describedby={`${ids}-hint ${ids}-count`}
          />
          <div className="mt-1.5 flex justify-between gap-3 text-xs">
            <p id={`${ids}-hint`} className="text-[var(--onside-muted)]">
              Pelo menos {FEEDBACK_MIN_LENGTH} caracteres.
            </p>
            <p
              id={`${ids}-count`}
              className={`font-[family-name:var(--onside-mono)] tabular-nums ${tooLong ? 'text-[var(--onside-live-text)]' : 'text-[var(--onside-muted)]'}`}
            >
              {length}/{FEEDBACK_MAX_LENGTH}
            </p>
          </div>
        </div>

        <div>
          <input
            ref={fileInput}
            type="file"
            accept={PHOTO_CONTENT_TYPES.join(',')}
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              // Sem isto, escolher de novo o mesmo arquivo não dispara `change`.
              e.target.value = ''
              void addImages(files)
            }}
          />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <button
              type="button"
              disabled={full}
              onClick={() => fileInput.current?.click()}
              aria-describedby={`${ids}-images-hint`}
              className="onside-btn onside-btn-outline"
            >
              <ImagePlus size={16} color="currentColor" aria-hidden="true" />
              Adicionar imagem
            </button>
            <p
              id={`${ids}-images-hint`}
              className="text-[var(--onside-muted)] text-xs"
            >
              {full
                ? `Limite de ${FEEDBACK_MAX_IMAGES} imagens atingido.`
                : `Opcional. Até ${FEEDBACK_MAX_IMAGES} imagens (JPEG, PNG ou WebP), ${MAX_MB} MB cada.`}
            </p>
          </div>

          {images.length > 0 && (
            <ul className="mt-3 space-y-2" aria-label="Imagens anexadas">
              {images.map((image) => (
                <li
                  key={image.id}
                  className="flex items-center gap-3 border-[1.5px] border-[var(--onside-line)] p-2"
                >
                  <img
                    src={image.url}
                    alt=""
                    className="size-12 shrink-0 border border-[var(--onside-line)] object-cover"
                  />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="truncate font-semibold">{image.name}</p>
                    <p className="font-[family-name:var(--onside-mono)] text-[var(--onside-muted)] text-xs">
                      {formatSize(image.blob.size)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeImage(image)}
                    aria-label={`Remover ${image.name}`}
                    className="grid size-11 shrink-0 place-items-center"
                  >
                    <Xmark size={16} color="currentColor" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {imageError ? (
            <p className="onside-field-error" role="alert">
              {imageError}
            </p>
          ) : null}
        </div>

        {error ? (
          <p className="onside-field-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="onside-btn onside-btn-ghost"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!valid || sending}
            className="onside-btn onside-btn-acid"
          >
            {sending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </form>
    </>
  )
}
