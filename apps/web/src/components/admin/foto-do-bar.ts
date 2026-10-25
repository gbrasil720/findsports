import {
  PHOTO_CONTENT_TYPES,
  PHOTO_MAX_BYTES
} from '@findsports_oficial/api/lib/blob-photo'
import { useRef, useState } from 'react'
import { uploadMedia } from '@/lib/upload-media'

const ALLOWED_TYPES: readonly string[] = PHOTO_CONTENT_TYPES

type Options = {
  /** Grava a URL; rejeitar cai no erro da foto (WEB-212). */
  onUploadSuccess: (url: string) => Promise<void>
  /** Depois que o servidor apagou a foto: recarrega o bar. */
  onRemoveSuccess: () => Promise<unknown>
  /**
   * Foto da galeria do ambiente (WEB-439), não a capa: a mesma rota com
   * `?galeria`, e `remover` recebe a URL da foto.
   */
  galeria?: boolean
}

/**
 * A capa do bar: escolher, subir e remover. A foto não espera o "Salvar
 * alterações" do espaço: o arquivo sobe na hora e a URL é gravada em seguida.
 *
 * `inputProps` vai num `<input type="file">` escondido; `escolher` o abre.
 */
export function useFotoDoBar({
  onUploadSuccess,
  onRemoveSuccess,
  galeria = false
}: Options) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const limpar = () => {
    // Limpa o input para permitir re-upload do mesmo arquivo.
    if (inputRef.current) inputRef.current.value = ''
  }

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setErro(null)

    // ESC-15: o arquivo vai do navegador direto para o armazenamento. A rota
    // só autoriza e devolve uma URL assinada de curta duração. Formato e
    // tamanho são conferidos de novo no servidor, ao assinar; aqui é só para
    // o erro vir na hora, sem esperar o envio.
    if (!ALLOWED_TYPES.includes(file.type)) {
      setErro('Formato inválido. Use JPG, PNG ou WebP.')
      limpar()
      return
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setErro('Arquivo muito grande. Máximo 5MB.')
      limpar()
      return
    }

    setEnviando(true)
    try {
      await onUploadSuccess(
        await uploadMedia(
          galeria ? '/api/bar/photo?galeria' : '/api/bar/photo',
          file
        )
      )
    } catch (error) {
      setErro('Erro ao fazer upload. Tente novamente.')
      console.error(error)
    } finally {
      setEnviando(false)
      limpar()
    }
  }

  const remover = async (url = '') => {
    if (
      !window.confirm(
        galeria ? 'Apagar esta foto da galeria?' : 'Remover a foto do bar?'
      )
    ) {
      return
    }
    setErro(null)
    setEnviando(true)
    try {
      // A rota apaga o arquivo e zera a referência do bar da sessão.
      const removed = await fetch(
        galeria
          ? `/api/bar/photo?galeria=${encodeURIComponent(url)}`
          : '/api/bar/photo',
        { method: 'DELETE' }
      )
      if (!removed.ok) throw new Error(`remoção ${removed.status}`)
      await onRemoveSuccess()
    } catch (error) {
      setErro('Não foi possível remover a foto. Tente novamente.')
      console.error(error)
    } finally {
      setEnviando(false)
    }
  }

  return {
    enviando,
    erro,
    escolher: () => inputRef.current?.click(),
    remover,
    inputProps: {
      ref: inputRef,
      type: 'file' as const,
      accept: 'image/jpeg,image/png,image/webp',
      onChange,
      className: 'hidden'
    }
  }
}
