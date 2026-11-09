import {
  GALLERY_MAX_PHOTOS,
  groupByCategory,
  PHOTO_CAPTION_MAX,
  PHOTO_CATEGORIES,
  type PhotoCategory,
  photoCategoryLabel
} from '@findsports_oficial/db/bar-gallery'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Camera, Close, Lock, Plus } from '@/components/landing/v3/icons'
import { UploadRecusado, uploadMedia } from '@/lib/upload-media'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import {
  contagemDaRevisao,
  type FotoDoDono,
  moverFoto,
  problemaDoArquivo,
  vizinha
} from './espaco-fotos-model'
import { Interruptor } from './painel-shell'

/*
 * Fotos do Meu espaço (WEB-439, WEB-462; protótipo `espaco`, telas 28b e 28c
 * do app). Toda foto entra em revisão e o torcedor só vê a aprovada. A capa é
 * de todo plano; o resto da galeria, do Pro e do Elite. Cada ação grava na
 * hora, fora da barra de salvar.
 */

type Folha =
  | {
      tipo: 'nova'
      arquivo: File
      previa: string
      categoria: PhotoCategory
      legenda: string
      capa: boolean
    }
  | { tipo: 'foto'; id: string }

/** Sem a galeria: o que falta para ela voltar. */
export type GaleriaBloqueada = 'carregando' | 'plano' | 'pagamento' | null

/**
 * O envio de foto, que o checklist do perfil ("Adicionar" na foto de capa)
 * também abre. `escolher` abre o seletor; escolhido o arquivo, abre a folha
 * "Nova foto".
 */
export function useEnvioDeFoto() {
  const inputRef = useRef<HTMLInputElement>(null)
  const pedido = useRef<{ categoria: PhotoCategory; capa: boolean }>({
    categoria: 'telao',
    capa: false
  })
  const [folha, setFolha] = useState<Folha | null>(null)
  const [erroArquivo, setErroArquivo] = useState<string | null>(null)

  // A prévia é um `blob:`: some com a folha.
  const previa = folha?.tipo === 'nova' ? folha.previa : null
  useEffect(
    () => () => {
      if (previa) URL.revokeObjectURL(previa)
    },
    [previa]
  )

  const escolher = (opcoes: Partial<typeof pedido.current> = {}) => {
    const atual = folha?.tipo === 'nova' ? folha : null
    pedido.current = {
      categoria: opcoes.categoria ?? atual?.categoria ?? 'telao',
      capa: opcoes.capa ?? atual?.capa ?? false
    }
    inputRef.current?.click()
  }

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0]
    // Limpa para o mesmo arquivo poder ser escolhido de novo.
    e.target.value = ''
    if (!arquivo) return
    const problema = problemaDoArquivo(arquivo)
    setErroArquivo(problema)
    if (problema) return
    setFolha((atual) => ({
      tipo: 'nova',
      arquivo,
      previa: URL.createObjectURL(arquivo),
      categoria: pedido.current.categoria,
      capa: pedido.current.capa,
      legenda: atual?.tipo === 'nova' ? atual.legenda : ''
    }))
  }

  return {
    folha,
    setFolha,
    erroArquivo,
    escolher,
    abrir: (id: string) => setFolha({ tipo: 'foto', id }),
    input: (
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-label="Escolher foto"
        onChange={onChange}
      />
    )
  }
}

type Envio = ReturnType<typeof useEnvioDeFoto>

const plural = (n: number, um: string, varios: string) =>
  `${n} ${n === 1 ? um : varios}`

export function FotosDoBar({
  nome,
  capaUrl,
  bloqueio,
  envio,
  onMudou
}: {
  nome: string
  /** `bar.photo_url`: a capa no ar, a que o torcedor vê. */
  capaUrl: string | null
  bloqueio: GaleriaBloqueada
  envio: Envio
  /** Capa, checklist e prévia leem o bar: relê depois de mudar. */
  onMudou: () => Promise<unknown>
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const fotosQuery = useQuery({
    ...trpc.pub.photos.queryOptions(),
    meta: { errorToast: false }
  })
  const recarregar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.pub.photos.queryKey() }),
      onMudou()
    ])
  const reorder = useMutation(
    trpc.pub.reorderPhotos.mutationOptions({ onSettled: recarregar })
  )
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)

  const salvas = fotosQuery.data ?? []
  // Enquanto a ordem nova grava, ela já aparece.
  const ordem = reorder.isPending ? reorder.variables.ids : null
  const fotos = groupByCategory(
    ordem
      ? ordem.flatMap((id) => salvas.find((f) => f.id === id) ?? [])
      : salvas
  ).flatMap((g) => g.photos)
  const conta = contagemDaRevisao(fotos)
  const recusadas = fotos.filter((f) => f.status === 'rejected')
  const galeria = bloqueio === null
  const cabe = conta.publicadas + conta.emRevisao < GALLERY_MAX_PHOTOS

  const mover = (id: string, alvo: string | null) => {
    if (!alvo || reorder.isPending) return
    const ids = moverFoto(fotos, id, alvo)
    if (ids) reorder.mutate({ ids })
  }

  const resumo = [
    plural(conta.publicadas, 'publicada', 'publicadas'),
    conta.emRevisao ? `${conta.emRevisao} em revisão` : null,
    conta.recusadas ? plural(conta.recusadas, 'recusada', 'recusadas') : null,
    `até ${GALLERY_MAX_PHOTOS}`
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <section
      id="esp-fotos"
      className="pn-card pn-sec2"
      aria-labelledby="esp-ft"
    >
      <div className="pn-chd">
        <h3 id="esp-ft">
          <Camera size={20} />
          Fotos
        </h3>
        {fotosQuery.data ? <small>{resumo}</small> : null}
      </div>

      {fotosQuery.isError ? (
        <div className="pn-err" role="alert">
          <p>
            {getUserFacingMessage(
              fotosQuery.error,
              'Não foi possível carregar as fotos.'
            )}
          </p>
          {isRetryableError(fotosQuery.error) ? (
            <button
              type="button"
              className="pn-btn pn-ghost pn-sm"
              onClick={() => void fotosQuery.refetch()}
            >
              Tentar de novo
            </button>
          ) : null}
        </div>
      ) : fotosQuery.isLoading ? (
        <p className="pn-note" role="status">
          Carregando as fotos…
        </p>
      ) : (
        <>
          {recusadas.length ? (
            <button
              type="button"
              className="pn-ph-rec"
              onClick={() => envio.abrir(recusadas[0]?.id ?? '')}
            >
              {/* biome-ignore lint/performance/noImgElement: foto do armazenamento do bar, sem otimizador. */}
              <img src={recusadas[0]?.url} alt="" />
              <span>
                <b>
                  {recusadas.length === 1
                    ? '1 foto recusada'
                    : `${recusadas.length} fotos recusadas`}
                </b>
                <span>
                  {recusadas.length === 1
                    ? `${recusadas[0]?.rejectionReason} `
                    : 'Abra cada uma para ver o motivo. '}
                  Envie outra do mesmo espaço.
                </span>
              </span>
            </button>
          ) : null}

          <ul className="pn-photos">
            {fotos.map((f) => {
              const doGrupo = fotos.filter((x) => x.category === f.category)
              const i = doGrupo.indexOf(f)
              const capa = f.url === capaUrl
              const rotulo = photoCategoryLabel(f.category)
              return (
                <li
                  key={f.id}
                  className="pn-photo"
                  data-status={f.status}
                  data-arrastando={arrastando === f.id || undefined}
                  data-sobre={
                    (sobre === f.id && arrastando !== f.id) || undefined
                  }
                  draggable={!reorder.isPending}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move'
                    setArrastando(f.id)
                  }}
                  onDragEnd={() => {
                    setArrastando(null)
                    setSobre(null)
                  }}
                  onDragOver={(e) => {
                    const de = fotos.find((x) => x.id === arrastando)
                    if (de?.category !== f.category) return
                    e.preventDefault()
                    setSobre(f.id)
                  }}
                  onDragLeave={() => setSobre((s) => (s === f.id ? null : s))}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (arrastando) mover(arrastando, f.id)
                    setArrastando(null)
                    setSobre(null)
                  }}
                >
                  <button
                    type="button"
                    className="pn-photo-b"
                    onClick={() => envio.abrir(f.id)}
                    aria-label={`${rotulo}, foto ${i + 1} de ${doGrupo.length}${
                      f.status === 'pending'
                        ? ', em revisão'
                        : f.status === 'rejected'
                          ? ', recusada'
                          : capa
                            ? ', capa'
                            : ''
                    }. Abrir`}
                  >
                    {/* biome-ignore lint/performance/noImgElement: foto do armazenamento do bar, sem otimizador. */}
                    <img src={f.url} alt="" draggable={false} />
                  </button>
                  <Selo foto={f} />
                  {capa ? <span className="pn-photo-cap">CAPA</span> : null}
                  {doGrupo.length > 1 ? (
                    <span className="pn-photo-mv">
                      <button
                        type="button"
                        aria-label={`Mover a foto ${i + 1} de ${rotulo} para antes`}
                        disabled={reorder.isPending || i === 0}
                        onClick={() => mover(f.id, vizinha(fotos, f.id, -1))}
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        aria-label={`Mover a foto ${i + 1} de ${rotulo} para depois`}
                        disabled={reorder.isPending || i === doGrupo.length - 1}
                        onClick={() => mover(f.id, vizinha(fotos, f.id, 1))}
                      >
                        ›
                      </button>
                    </span>
                  ) : null}
                </li>
              )
            })}
            {cabe ? (
              <li>
                <button
                  type="button"
                  className="pn-addph"
                  onClick={() =>
                    envio.escolher({ capa: !galeria || fotos.length === 0 })
                  }
                >
                  <Plus />
                  {galeria
                    ? 'Adicionar foto'
                    : capaUrl
                      ? 'Trocar a capa'
                      : 'Adicionar foto de capa'}
                </button>
              </li>
            ) : null}
            {bloqueio === 'plano' || bloqueio === 'pagamento' ? (
              <li>
                <Link
                  to={bloqueio === 'plano' ? '/plan' : '/admin/billing'}
                  search={
                    bloqueio === 'plano' ? { origin: 'admin' } : undefined
                  }
                  className="pn-addph"
                >
                  <Lock size={22} />
                  {bloqueio === 'plano'
                    ? 'Galeria nos planos Pro e Elite'
                    : 'Galeria: regularize a assinatura'}
                </Link>
              </li>
            ) : null}
          </ul>

          {bloqueio && fotos.length > 1 ? (
            <p className="pn-hint">
              As fotos da galeria continuam guardadas, mas só a capa aparece no
              perfil até o plano voltar.
            </p>
          ) : null}
          {envio.erroArquivo ? (
            <p className="pn-ferr" role="alert">
              {envio.erroArquivo}
            </p>
          ) : null}
          {reorder.error ? (
            <p className="pn-ferr" role="alert">
              {getUserFacingMessage(
                reorder.error,
                'Não foi possível mudar a ordem. Tente novamente.'
              )}
            </p>
          ) : null}
          <p className="pn-hint pn-ph-nota">
            {fotos.length > 1
              ? 'Arraste ou use as setas para reordenar dentro da categoria; abra a foto para trocar a categoria ou definir a capa. '
              : ''}
            A Onside revisa cada foto em até 24 h antes de aparecer para o
            torcedor. JPG, PNG ou WebP, até 5 MB.
          </p>
        </>
      )}
      {envio.input}
      {envio.folha ? (
        <FolhaDaFoto
          envio={envio}
          fotos={fotos}
          nome={nome}
          capaUrl={capaUrl}
          galeria={galeria}
          recarregar={recarregar}
        />
      ) : null}
    </section>
  )
}

function Selo({ foto }: { foto: FotoDoDono }) {
  if (foto.status === 'rejected')
    return <span className="pn-photo-st is-rec">RECUSADA</span>
  if (foto.status === 'pending')
    return <span className="pn-photo-st is-rev">EM REVISÃO</span>
  return (
    <span className="pn-photo-st">
      {photoCategoryLabel(foto.category).toUpperCase()}
    </span>
  )
}

/** A folha da direita: "Nova foto" (28c) ou a foto aberta. */
function FolhaDaFoto({
  envio,
  fotos,
  nome,
  capaUrl,
  galeria,
  recarregar
}: {
  envio: Envio
  fotos: readonly FotoDoDono[]
  nome: string
  capaUrl: string | null
  galeria: boolean
  recarregar: () => Promise<unknown>
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const { folha, setFolha } = envio
  const aberta =
    folha?.tipo === 'foto' ? fotos.find((f) => f.id === folha.id) : null
  const fechar = () => setFolha(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  if (folha?.tipo !== 'nova' && !aberta) return null
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: o Esc já fecha o `<dialog>` nativo; o clique é só o do fundo.
    <dialog
      ref={ref}
      className="pn-sheet"
      aria-labelledby="pn-foto-t"
      onClose={fechar}
      onClick={(event) => {
        if (event.target === ref.current) fechar()
      }}
    >
      <div className="pn-sheet-in">
        <header>
          <h2 className="pn-disp" id="pn-foto-t">
            {folha?.tipo === 'nova'
              ? 'Nova foto'
              : aberta
                ? photoCategoryLabel(aberta.category)
                : ''}
          </h2>
          <button
            type="button"
            className="pn-btn pn-ghost pn-ic"
            aria-label="Fechar"
            onClick={fechar}
          >
            <Close size={18} />
          </button>
        </header>
        {folha?.tipo === 'nova' ? (
          <NovaFoto
            folha={folha}
            mudar={(patch) => setFolha({ ...folha, ...patch })}
            trocar={() => envio.escolher()}
            soCapa={!galeria}
            recarregar={recarregar}
            fechar={fechar}
          />
        ) : aberta ? (
          <FotoAberta
            key={aberta.id}
            foto={aberta}
            nome={nome}
            capa={aberta.url === capaUrl}
            recarregar={recarregar}
            fechar={fechar}
          />
        ) : null}
      </div>
    </dialog>
  )
}

function Categorias({
  valor,
  onChange,
  disabled
}: {
  valor: PhotoCategory
  onChange: (c: PhotoCategory) => void
  disabled?: boolean
}) {
  return (
    <fieldset className="pn-fl pn-ph-cats">
      <legend className="pn-fl-l">Categoria</legend>
      <div className="pn-tchips">
        {PHOTO_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className="pn-tchip"
            aria-pressed={valor === c.id}
            disabled={disabled}
            onClick={() => onChange(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function LinhaCapa({
  ligado,
  onChange,
  disabled,
  dica
}: {
  ligado: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  dica?: ReactNode
}) {
  return (
    <div className="pn-sw pn-ph-capa">
      <span>
        <b>Usar como capa</b>
        <small>{dica ?? 'Aparece no card do bar e no topo da página.'}</small>
      </span>
      <Interruptor
        ligado={ligado}
        onChange={onChange}
        disabled={disabled}
        rotulo="Usar como capa"
      />
    </div>
  )
}

function NovaFoto({
  folha,
  mudar,
  trocar,
  soCapa,
  recarregar,
  fechar
}: {
  folha: Extract<Folha, { tipo: 'nova' }>
  mudar: (patch: Partial<Extract<Folha, { tipo: 'nova' }>>) => void
  trocar: () => void
  /** Fora do Pro a foto só entra como capa. */
  soCapa: boolean
  recarregar: () => Promise<unknown>
  fechar: () => void
}) {
  const trpc = useTRPC()
  const addPhoto = useMutation(trpc.pub.addPhoto.mutationOptions())
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const capa = soCapa || folha.capa

  const enviar = async () => {
    if (enviando) return
    setEnviando(true)
    setErro(null)
    try {
      const url = await uploadMedia(
        `/api/bar/photo?galeria${capa ? '&capa' : ''}`,
        folha.arquivo
      )
      await addPhoto.mutateAsync({
        url,
        category: folha.categoria,
        caption: folha.legenda.trim() || undefined,
        cover: capa
      })
      await recarregar()
      fechar()
    } catch (err) {
      setErro(
        err instanceof UploadRecusado
          ? err.message
          : getUserFacingMessage(
              err,
              'Não foi possível enviar a foto. Tente novamente.'
            )
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <div className="pn-sheet-body">
        <div className="pn-ph-big">
          {/* biome-ignore lint/performance/noImgElement: prévia local (blob:) da foto escolhida. */}
          <img src={folha.previa} alt="A foto escolhida" />
          <button
            type="button"
            className="pn-ph-trocar"
            onClick={trocar}
            disabled={enviando}
          >
            <Camera size={16} />
            Trocar foto
          </button>
        </div>
        <Categorias
          valor={folha.categoria}
          onChange={(categoria) => mudar({ categoria })}
          disabled={enviando}
        />
        <label className="pn-fl" htmlFor="pn-foto-leg">
          <span className="pn-fl-h">
            <span className="pn-fl-l">Legenda</span>
            <span aria-hidden="true">
              {folha.legenda.length}/{PHOTO_CAPTION_MAX}
            </span>
          </span>
          <textarea
            id="pn-foto-leg"
            className="pn-inp"
            rows={2}
            maxLength={PHOTO_CAPTION_MAX}
            value={folha.legenda}
            disabled={enviando}
            placeholder="Ex: o telão de 120 polegadas do salão"
            onChange={(e) => mudar({ legenda: e.target.value })}
          />
        </label>
        <LinhaCapa
          ligado={capa}
          onChange={(v) => mudar({ capa: v })}
          disabled={enviando || soCapa}
          dica={
            soCapa
              ? 'Aparece no card do bar e no topo da página. A galeria é dos planos Pro e Elite.'
              : undefined
          }
        />
        <p className="pn-ph-aviso">
          A Onside revisa cada foto em até 24 h antes de aparecer para o
          torcedor. Evite pessoas em primeiro plano, texto sobre a foto e
          imagens de banco.
        </p>
      </div>
      <footer className="pn-sheet-f">
        <div className="pn-sheet-msg">
          {erro ? (
            <p className="pn-ferr" role="alert">
              {erro}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="pn-btn pn-ghost pn-sm"
          disabled={enviando}
          onClick={fechar}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="pn-btn pn-acid pn-sm"
          disabled={enviando}
          onClick={() => void enviar()}
        >
          {enviando
            ? 'Enviando…'
            : erro
              ? 'Tentar de novo'
              : 'Enviar para revisão'}
        </button>
      </footer>
    </>
  )
}

function FotoAberta({
  foto,
  nome,
  capa,
  recarregar,
  fechar
}: {
  foto: FotoDoDono
  nome: string
  capa: boolean
  recarregar: () => Promise<unknown>
  fechar: () => void
}) {
  const trpc = useTRPC()
  const opcoes = { onSuccess: recarregar }
  const categoria = useMutation(
    trpc.pub.setPhotoCategory.mutationOptions(opcoes)
  )
  const definirCapa = useMutation(
    trpc.pub.setPhotoCover.mutationOptions(opcoes)
  )
  const [apagando, setApagando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const ocupado = categoria.isPending || definirCapa.isPending || apagando
  const falha = categoria.error ?? definirCapa.error

  const apagar = async () => {
    if (!window.confirm('Apagar esta foto?')) return
    setApagando(true)
    setErro(null)
    try {
      const res = await fetch(
        `/api/bar/photo?galeria=${encodeURIComponent(foto.url)}`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        throw new UploadRecusado(
          body?.error ?? 'Não foi possível apagar a foto. Tente novamente.'
        )
      }
      await recarregar()
      fechar()
    } catch (err) {
      setErro(
        err instanceof UploadRecusado
          ? err.message
          : 'Não foi possível apagar a foto. Tente novamente.'
      )
    } finally {
      setApagando(false)
    }
  }

  return (
    <>
      <div className="pn-sheet-body">
        <div className="pn-ph-big" data-status={foto.status}>
          {/* biome-ignore lint/performance/noImgElement: foto do armazenamento do bar, sem otimizador. */}
          <img src={foto.url} alt={`Foto de ${nome}`} />
          <Selo foto={foto} />
          {capa ? <span className="pn-photo-cap">CAPA</span> : null}
        </div>
        {foto.status === 'rejected' ? (
          <p className="pn-ph-motivo" role="status">
            <b>Recusada</b>
            {foto.rejectionReason} Envie outra do mesmo espaço.
          </p>
        ) : foto.status === 'pending' ? (
          <p className="pn-ph-aviso">
            {foto.coverRequested
              ? 'Em revisão. Vira a capa quando a Onside aprovar.'
              : 'Em revisão. Aparece para o torcedor quando a Onside aprovar.'}
          </p>
        ) : null}
        {foto.caption ? (
          <div className="pn-fl">
            <span className="pn-fl-l">Legenda</span>
            <p className="pn-ph-leg">{foto.caption}</p>
          </div>
        ) : null}
        <Categorias
          valor={
            categoria.isPending ? categoria.variables.category : foto.category
          }
          onChange={(category) => categoria.mutate({ id: foto.id, category })}
          disabled={ocupado}
        />
        {foto.status === 'rejected' ? null : (
          <LinhaCapa
            ligado={capa || foto.coverRequested || definirCapa.isPending}
            onChange={(v) => {
              if (v) definirCapa.mutate({ id: foto.id })
            }}
            disabled={ocupado || capa || foto.coverRequested}
            dica={
              foto.coverRequested && !capa
                ? 'Pedida como capa: troca a do ar quando a Onside aprovar.'
                : undefined
            }
          />
        )}
      </div>
      <footer className="pn-sheet-f">
        <div className="pn-sheet-msg">
          {erro || falha ? (
            <p className="pn-ferr" role="alert">
              {erro ??
                getUserFacingMessage(
                  falha,
                  'Não foi possível salvar. Tente novamente.'
                )}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="pn-btn pn-ghost pn-sm pn-danger"
          disabled={ocupado}
          onClick={() => void apagar()}
        >
          {apagando ? 'Apagando…' : 'Apagar foto'}
        </button>
        <button type="button" className="pn-btn pn-ink pn-sm" onClick={fechar}>
          Fechar
        </button>
      </footer>
    </>
  )
}
