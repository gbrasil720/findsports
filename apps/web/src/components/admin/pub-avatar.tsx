import {
  PHOTO_CONTENT_TYPES,
  PHOTO_MAX_BYTES
} from '@findsports_oficial/api/lib/blob-photo'
import { useRef, useState } from 'react'
import Camera from 'reicon-react/icons/Camera'
import Loader from 'reicon-react/icons/Loader'
import { uploadMedia } from '@/lib/upload-media'

const ALLOWED_TYPES: readonly string[] = PHOTO_CONTENT_TYPES
const MAX_BYTES = PHOTO_MAX_BYTES

type Props = {
  name: string
  photoUrl?: string | null
  /** Grava a URL; rejeitar cai no erro do avatar (WEB-212). */
  onUploadSuccess: (url: string) => Promise<void>
  /** Depois que o servidor apagou a foto: recarrega o bar. */
  onRemoveSuccess: () => Promise<unknown>
}

export function BarAvatar({
  name,
  photoUrl,
  onUploadSuccess,
  onRemoveSuccess
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setUploading(true)

    // ESC-15: o arquivo vai do navegador direto para o armazenamento. A rota
    // só autoriza e devolve uma URL assinada de curta duração — os bytes não
    // passam pela função serverless.
    //
    // Formato e tamanho continuam validados no servidor, ao assinar;
    // esta checagem aqui é só para o usuário receber o erro na hora, sem
    // esperar o envio.
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Formato inválido. Use JPG, PNG ou WebP.')
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Arquivo muito grande. Máximo 5MB.')
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    try {
      await onUploadSuccess(await uploadMedia('/api/bar/photo', file))
    } catch (error) {
      setError('Erro ao fazer upload. Tente novamente.')
      console.error(error)
    } finally {
      setUploading(false)
      // Limpa o input para permitir re-upload do mesmo arquivo
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async () => {
    if (!window.confirm('Remover a foto do bar?')) return
    setError(null)
    setUploading(true)
    try {
      // A rota apaga o arquivo e zera a referência do bar da sessão.
      const removed = await fetch('/api/bar/photo', { method: 'DELETE' })
      if (!removed.ok) throw new Error(`remoção ${removed.status}`)
      await onRemoveSuccess()
    } catch (error) {
      setError('Não foi possível remover a foto. Tente novamente.')
      console.error(error)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="relative size-24 rounded-none ring-4 ring-white/30 overflow-hidden group shrink-0 disabled:opacity-70"
        title="Clique para trocar a foto"
      >
        {photoUrl ? (
          <img src={photoUrl} alt={name} className="size-full object-cover" />
        ) : (
          <div className="size-full bg-white text-brand-blue grid place-items-center font-heading font-bold text-4xl">
            {initials}
          </div>
        )}

        {/* Overlay ao hover */}
        <div className="absolute inset-0 bg-[rgb(18_18_15_/_55%)] opacity-0 group-hover:opacity-100 transition-opacity grid place-items-center">
          {uploading ? (
            <Loader size={24} color="white" className="animate-spin" />
          ) : (
            <Camera size={24} color="white" />
          )}
        </div>
      </button>

      {photoUrl ? (
        <button
          type="button"
          disabled={uploading}
          onClick={() => void handleRemove()}
          className="inline-flex min-h-11 items-center font-bold text-[var(--onside-paper)]/80 text-xs underline underline-offset-2 hover:text-[var(--onside-paper)] disabled:opacity-60"
        >
          Remover foto
        </button>
      ) : null}

      {error && (
        <p
          className="text-[10px] text-[var(--onside-live-text)] max-w-[120px] text-center"
          role="alert"
        >
          {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  )
}
