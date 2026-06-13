import { Camera02Icon, Loading01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useRef, useState } from 'react'

type Props = {
  name: string
  photoUrl?: string | null
  onUploadSuccess: (url: string) => void
}

export function BarAvatar({ name, photoUrl, onUploadSuccess }: Props) {
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

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/bar/photo', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Erro ao fazer upload.')
        return
      }

      onUploadSuccess(data.url)
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
        className="relative size-24 rounded-3xl ring-4 ring-white/30 overflow-hidden group shrink-0 disabled:opacity-70"
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
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity grid place-items-center">
          {uploading ? (
            <HugeiconsIcon
              icon={Loading01Icon}
              size={24}
              color="white"
              strokeWidth={1.5}
              className="animate-spin"
            />
          ) : (
            <HugeiconsIcon
              icon={Camera02Icon}
              size={24}
              color="white"
              strokeWidth={1.5}
            />
          )}
        </div>
      </button>

      {error && (
        <p className="text-[10px] text-red-400 max-w-[120px] text-center">
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
