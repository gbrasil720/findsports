import {
  PHOTO_CONTENT_TYPES,
  PHOTO_MAX_BYTES,
  photoPathname
} from '@findsports_oficial/api/lib/blob-photo'
import { upload } from '@vercel/blob/client'
import { useRef, useState } from 'react'
import Camera from 'reicon-react/icons/Camera'
import Loader from 'reicon-react/icons/Loader'

const ALLOWED_TYPES: readonly string[] = PHOTO_CONTENT_TYPES
const MAX_BYTES = PHOTO_MAX_BYTES

type Props = {
  /** Necessário para o servidor validar o caminho do upload (ESC-15). */
  barId: string
  name: string
  photoUrl?: string | null
  onUploadSuccess: (url: string) => void
}

export function BarAvatar({ barId, name, photoUrl, onUploadSuccess }: Props) {
  const pathname = photoPathname(barId)
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
    // só autoriza e devolve um token de curta duração — os bytes não passam
    // mais pela função serverless.
    //
    // Formato e tamanho continuam validados no servidor, ao emitir o token;
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
      const blob = await upload(pathname, file, {
        access: 'public',
        handleUploadUrl: '/api/bar/photo',
        contentType: file.type
      })

      onUploadSuccess(blob.url)
    } catch (error) {
      setError('Erro ao fazer upload. Tente novamente.')
      console.error(error)
    } finally {
      setUploading(false)
      // Limpa o input para permitir re-upload do mesmo arquivo
      if (inputRef.current) inputRef.current.value = ''
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
