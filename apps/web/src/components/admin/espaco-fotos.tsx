import {
  GALLERY_MAX_PHOTOS,
  groupByCategory,
  PHOTO_CAPTION_MAX,
  PHOTO_CATEGORIES,
  type PhotoCategory,
  photoCategoryLabel
} from '@findsports_oficial/db/bar-gallery'
import {
  Dialog,
  DialogContent,
  DialogTitle
} from '@findsports_oficial/ui/components/dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  Badge,
  Botao,
  BotaoIcone,
  CampoTexto,
  Chip,
  Icone,
  Toggle
} from '@/components/painel'
import { UploadRecusado, uploadMedia } from '@/lib/upload-media'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import {
  contagemDaRevisao,
  type FotoDoDono,
  moverFoto,
  problemaDoArquivo,
  vizinha
} from './espaco-fotos-model'
import type { RecursoPago } from './espaco-model'

/*
 * Fotos do Meu espaço (WEB-462): a 28b (contagem, recusada com o motivo,
 * seções por categoria, capa e revisão) e a 28c (enviar foto com categoria,
 * legenda e capa), do app para o painel web. Toda foto entra em revisão; o
 * torcedor só vê a aprovada. A capa é de todo plano; o resto da galeria, do
 * Pro e do Elite.
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

/**
 * O envio de foto, que o checklist ("Adicionar foto de capa") também abre.
 * `escolher` abre o seletor de arquivo; escolhido, abre a folha "Nova foto".
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
        className="hidden"
        aria-label="Escolher foto"
        onChange={onChange}
      />
    )
  }
}

type Envio = ReturnType<typeof useEnvioDeFoto>

export function FotosDoBar({
  nome,
  capaUrl,
  recurso,
  envio,
  onMudou
}: {
  nome: string
  /** `bar.photo_url`: a capa no ar, a que o torcedor vê. */
  capaUrl: string | null
  /** A galeria é do Pro: fora dele, só a capa entra. */
  recurso: RecursoPago
  envio: Envio
  /** Capa e prévia leem o bar: recarrega depois de mudar. */
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
  const fotos = ordem
    ? ordem.flatMap((id) => salvas.find((f) => f.id === id) ?? [])
    : salvas
  const grupos = groupByCategory(fotos)
  const conta = contagemDaRevisao(fotos)
  const recusadas = fotos.filter((f) => f.status === 'rejected')
  const ocupadas = conta.publicadas + conta.emRevisao
  const galeria = recurso.status === 'liberado'
  const cabe = ocupadas < GALLERY_MAX_PHOTOS
  // Fora do Pro a foto nova entra como capa (troca a do ar quando aprovada).
  const podeAdicionar = cabe

  const mover = (id: string, alvo: string | null) => {
    if (!alvo || reorder.isPending) return
    const ids = moverFoto(fotos, id, alvo)
    if (ids) reorder.mutate({ ids })
  }

  if (fotosQuery.isError) {
    return (
      <p role="alert" className="text-[13px] text-[var(--painel-live)]">
        {getUserFacingMessage(
          fotosQuery.error,
          'Não foi possível carregar as fotos.'
        )}{' '}
        <button
          type="button"
          className="underline underline-offset-2"
          onClick={() => void fotosQuery.refetch()}
        >
          Tentar de novo
        </button>
      </p>
    )
  }

  const adicionar = (categoria?: PhotoCategory) =>
    envio.escolher({ categoria, capa: !galeria || ocupadas === 0 })

  const quadroAdicionar = (categoria?: PhotoCategory) =>
    podeAdicionar ? (
      <button
        type="button"
        onClick={() => adicionar(categoria)}
        className={`${QUADRO} border-[1.5px] border-[var(--painel-line2)] border-dashed text-[13px] text-[var(--painel-muted)] hover:border-[var(--painel-fg)] hover:text-[var(--painel-fg)]`}
      >
        <span className="flex flex-col items-center gap-1">
          <Icone nome="plus" tamanho={22} acento="var(--painel-muted)" />
          {galeria ? 'Adicionar' : 'Adicionar capa'}
        </span>
      </button>
    ) : null

  return (
    <>
      {fotosQuery.isLoading ? (
        <div
          aria-hidden="true"
          className="h-[130px] animate-pulse rounded-[6px] bg-[var(--painel-sub)] motion-reduce:animate-none"
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2.5">
            <Contador
              valor={conta.publicadas}
              rotulo={plural(conta.publicadas, 'publicada', 'publicadas')}
            />
            <Contador valor={conta.emRevisao} rotulo="em revisão" />
            <Contador
              valor={conta.recusadas}
              rotulo={plural(conta.recusadas, 'recusada', 'recusadas')}
              alerta={conta.recusadas > 0}
            />
          </div>

          {recusadas.length ? (
            <button
              type="button"
              onClick={() => envio.abrir(recusadas[0]?.id ?? '')}
              className="flex items-center gap-3.5 rounded-[7px] bg-[var(--painel-card)] p-3 text-left shadow-[inset_0_0_0_1px_var(--painel-line),0_3px_0_rgb(232_50_12/35%)]"
            >
              <img
                src={recusadas[0]?.url}
                alt=""
                className="size-14 flex-none rounded-[5px] object-cover"
              />
              <span className="min-w-0 flex-1">
                <b className="block text-[14.5px]">
                  {recusadas.length === 1
                    ? '1 foto recusada'
                    : `${recusadas.length} fotos recusadas`}
                </b>
                <span className="block text-[13px] text-[var(--painel-body)]">
                  {recusadas.length === 1
                    ? `${recusadas[0]?.rejectionReason} `
                    : 'Toque em cada uma para ver o motivo. '}
                  Envie outra do mesmo espaço.
                </span>
              </span>
              <Icone nome="right" tamanho={18} />
            </button>
          ) : null}

          {grupos.map((grupo) => (
            <section key={grupo.id} aria-label={grupo.label}>
              <div className="mb-2 flex items-baseline justify-between">
                <h3
                  className="painel-disp text-[var(--painel-acc)]"
                  style={{ ['--painel-disp-size' as string]: '24px' }}
                >
                  {grupo.label}
                </h3>
                <span className="painel-mono text-[12px] text-[var(--painel-muted)]">
                  {grupo.photos.length}
                </span>
              </div>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {grupo.photos.map((f, i) => (
                  <li
                    key={f.id}
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
                    data-arrastando={arrastando === f.id || undefined}
                    data-sobre={
                      (sobre === f.id && arrastando !== f.id) || undefined
                    }
                    className="group/foto relative transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] data-arrastando:scale-[0.97] data-arrastando:opacity-40 motion-reduce:transition-none [&[data-sobre]>button]:shadow-[0_0_0_2px_var(--painel-fg)]"
                  >
                    <Quadro
                      foto={f}
                      capa={f.url === capaUrl}
                      rotulo={`${grupo.label}, foto ${i + 1} de ${grupo.photos.length}`}
                      onAbrir={() => envio.abrir(f.id)}
                    />
                    {grupo.photos.length > 1 ? (
                      // Com mouse, as setas aparecem no hover e no foco; no
                      // toque ficam à vista (não há hover).
                      <div className="absolute right-1.5 bottom-1.5 flex gap-1 transition-opacity duration-150 group-focus-within/foto:opacity-100 group-hover/foto:opacity-100 motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:opacity-0">
                        <SetaNaFoto
                          rotulo={`Mover a foto ${i + 1} de ${grupo.label} para antes`}
                          disabled={reorder.isPending || i === 0}
                          onClick={() => mover(f.id, vizinha(fotos, f.id, -1))}
                        >
                          ‹
                        </SetaNaFoto>
                        <SetaNaFoto
                          rotulo={`Mover a foto ${i + 1} de ${grupo.label} para depois`}
                          disabled={
                            reorder.isPending || i === grupo.photos.length - 1
                          }
                          onClick={() => mover(f.id, vizinha(fotos, f.id, 1))}
                        >
                          ›
                        </SetaNaFoto>
                      </div>
                    ) : null}
                  </li>
                ))}
                {galeria ? <li>{quadroAdicionar(grupo.id)}</li> : null}
              </ul>
            </section>
          ))}

          {fotos.length === 0 || !galeria ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {quadroAdicionar()}
              {recurso.status === 'bloqueado' ? (
                <Link
                  to={recurso.link.to}
                  search={
                    recurso.link.to === '/plan'
                      ? { origin: 'admin' }
                      : undefined
                  }
                  className={`${QUADRO} flex-col gap-1 border-[1.5px] border-[var(--painel-line2)] border-dashed px-3 text-center text-[13px] text-[var(--painel-muted)] hover:border-[var(--painel-fg)]`}
                >
                  <Icone
                    nome="photo"
                    tamanho={22}
                    acento="var(--painel-muted)"
                  />
                  {recurso.link.to === '/plan'
                    ? 'Galeria · nos planos Pro e Elite'
                    : 'Galeria · regularize a assinatura'}
                </Link>
              ) : null}
            </div>
          ) : null}

          {recurso.status === 'bloqueado' && fotos.length > 1 ? (
            <p className="text-[12.5px] text-[var(--painel-muted)]">
              As fotos da galeria continuam guardadas, mas não aparecem no
              perfil até o plano voltar.
            </p>
          ) : null}
          {envio.erroArquivo ? (
            <p role="alert" className="text-[13px] text-[var(--painel-live)]">
              {envio.erroArquivo}
            </p>
          ) : null}
          {reorder.error ? (
            <p role="alert" className="text-[13px] text-[var(--painel-live)]">
              {getUserFacingMessage(
                reorder.error,
                'Não foi possível mudar a ordem. Tente novamente.'
              )}
            </p>
          ) : null}
          <p className="text-[12.5px] text-[var(--painel-muted)]">
            {fotos.length > 1
              ? 'Arraste para reordenar ou abra a foto para definir a capa. '
              : ''}
            A Onside revisa cada foto em até 24 h antes de aparecer para o
            torcedor.
          </p>
        </div>
      )}
      {envio.input}
      <FolhaDaFoto
        envio={envio}
        fotos={fotos}
        nome={nome}
        capaUrl={capaUrl}
        galeria={galeria}
        recarregar={recarregar}
      />
    </>
  )
}

const QUADRO =
  'flex aspect-[4/3] w-full items-center justify-center rounded-[6px]'

const plural = (n: number, um: string, varios: string) =>
  n === 1 ? um : varios

function Contador({
  valor,
  rotulo,
  alerta = false
}: {
  valor: number
  rotulo: string
  alerta?: boolean
}) {
  return (
    <div className="rounded-[7px] bg-[var(--painel-sub)] px-3.5 py-3">
      <span
        className="painel-disp block"
        style={{
          ['--painel-disp-size' as string]: '30px',
          color: alerta ? 'var(--painel-live)' : undefined
        }}
      >
        {valor}
      </span>
      <span className="text-[13px] text-[var(--painel-body)]">{rotulo}</span>
    </div>
  )
}

function Selo({ foto, capa }: { foto: FotoDoDono; capa: boolean }) {
  if (foto.status === 'rejected') return <Badge tipo="live">Recusada</Badge>
  if (foto.status === 'pending') {
    // Claro sobre a foto nos dois temas, como o 28b: o "muted" some na foto.
    return (
      <span className="inline-flex items-center gap-1 rounded-[4px] bg-[rgb(250_248_243/94%)] px-1.5 py-0.5 font-bold text-[#12120f] text-[11.5px]">
        <Icone nome="olho" tamanho={13} acento="#12120f" />
        Em revisão
      </span>
    )
  }
  return capa ? (
    <Badge tipo="acid" className="gap-1">
      <Icone nome="star" tamanho={12} acento="var(--painel-ink)" />
      Capa
    </Badge>
  ) : null
}

function Quadro({
  foto,
  capa,
  rotulo,
  onAbrir
}: {
  foto: FotoDoDono
  capa: boolean
  rotulo: string
  onAbrir: () => void
}) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={`${rotulo}${foto.status === 'pending' ? ', em revisão' : foto.status === 'rejected' ? ', recusada' : capa ? ', capa' : ''}. Abrir`}
      data-status={foto.status}
      className={`${QUADRO} group relative overflow-hidden bg-[var(--painel-sub)] data-[status=rejected]:shadow-[inset_0_0_0_2px_var(--painel-live)]`}
    >
      <img
        src={foto.url}
        alt=""
        draggable={false}
        className="absolute inset-0 size-full object-cover transition-opacity group-data-[status=pending]:opacity-55"
      />
      <span className="absolute top-1.5 left-1.5">
        <Selo foto={foto} capa={capa} />
      </span>
    </button>
  )
}

function SetaNaFoto({
  rotulo,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { rotulo: string }) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      className="grid size-8 place-items-center rounded-[5px] bg-[rgb(250_248_243/92%)] font-bold text-[#12120f] text-[15px] disabled:opacity-0"
      {...rest}
    >
      {children}
    </button>
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
  const { folha, setFolha } = envio
  const aberta =
    folha?.tipo === 'foto' ? fotos.find((f) => f.id === folha.id) : null
  const fechar = () => setFolha(null)
  return (
    <Dialog
      open={folha?.tipo === 'nova' || !!aberta}
      onOpenChange={(open) => {
        if (!open) fechar()
      }}
    >
      <DialogContent className="jogos-folha">
        <div className="jogos-folha-cab">
          <DialogTitle
            className="painel-disp"
            style={{ ['--painel-disp-size' as string]: '34px' }}
          >
            {folha?.tipo === 'nova'
              ? 'Nova foto'
              : aberta
                ? photoCategoryLabel(aberta.category)
                : ''}
          </DialogTitle>
          <BotaoIcone
            icone="x"
            rotulo="Fechar"
            className="ml-auto"
            onClick={fechar}
          />
        </div>
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
      </DialogContent>
    </Dialog>
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
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-2.5 font-bold text-[14px]">Categoria</legend>
      <div className="flex flex-wrap gap-2">
        {PHOTO_CATEGORIES.map((c) => (
          <Chip
            key={c.id}
            ativo={valor === c.id}
            check={false}
            disabled={disabled}
            onClick={() => onChange(c.id)}
          >
            {c.label}
          </Chip>
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
    <div className="flex items-center gap-4 rounded-[7px] bg-[var(--painel-card)] p-4 shadow-[inset_0_0_0_1px_var(--painel-line)]">
      <div className="min-w-0 flex-1">
        <b id="espaco-capa" className="block text-[15px]">
          Usar como capa
        </b>
        <span className="text-[13px] text-[var(--painel-muted)]">
          {dica ?? 'Aparece no card do bar e no topo da página'}
        </span>
      </div>
      <Toggle
        ligado={ligado}
        onChange={onChange}
        disabled={disabled}
        aria-labelledby="espaco-capa"
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
      <div className="jogos-folha-corpo flex flex-col gap-5">
        <div className="relative aspect-[4/3] overflow-hidden rounded-[7px] bg-[var(--painel-sub)]">
          <img
            src={folha.previa}
            alt="A foto escolhida"
            className="absolute inset-0 size-full object-cover"
          />
          <button
            type="button"
            onClick={trocar}
            disabled={enviando}
            className="absolute top-2.5 right-2.5 flex items-center gap-1.5 rounded-full bg-[rgb(18_18_15/62%)] px-3.5 py-2 font-semibold text-[13px] text-white backdrop-blur disabled:opacity-60"
          >
            <Icone nome="photo" tamanho={16} acento="#fff" />
            Trocar foto
          </button>
        </div>
        <Categorias
          valor={folha.categoria}
          onChange={(categoria) => mudar({ categoria })}
          disabled={enviando}
        />
        <CampoTexto
          rotulo="Legenda"
          aside={`${folha.legenda.length}/${PHOTO_CAPTION_MAX}`}
          maxLength={PHOTO_CAPTION_MAX}
          rows={3}
          value={folha.legenda}
          disabled={enviando}
          onChange={(e) => mudar({ legenda: e.target.value })}
        />
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
        <p className="flex gap-3 rounded-[7px] bg-[var(--painel-acid-tint,rgb(205_242_56/22%))] p-4 text-[14px] text-[var(--painel-body)]">
          <Icone nome="olho" tamanho={20} className="mt-0.5 flex-none" />A
          Onside revisa cada foto em até 24 h antes de aparecer para o torcedor.
          Evite pessoas em primeiro plano, texto sobre a foto e imagens de
          banco.
        </p>
        {erro ? (
          <p role="alert" className="text-[13px] text-[var(--painel-live)]">
            {erro}
          </p>
        ) : null}
      </div>
      <div className="jogos-folha-pe">
        <Botao
          variante="acid"
          className="w-full"
          disabled={enviando}
          onClick={() => void enviar()}
        >
          {enviando ? 'Enviando…' : 'Enviar para revisão'}
        </Botao>
      </div>
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
      <div className="jogos-folha-corpo flex flex-col gap-5">
        <div className="relative aspect-[4/3] overflow-hidden rounded-[7px] bg-[var(--painel-sub)]">
          <img
            src={foto.url}
            alt={`Foto de ${nome}`}
            className="absolute inset-0 size-full object-cover"
          />
          <span className="absolute top-2.5 left-2.5">
            <Selo foto={foto} capa={capa} />
          </span>
        </div>
        {foto.status === 'rejected' ? (
          <p className="rounded-[7px] p-4 text-[14px] shadow-[inset_0_0_0_1.5px_rgb(201_43_12/45%)]">
            <b className="block text-[var(--painel-live)]">Recusada</b>
            {foto.rejectionReason} Envie outra do mesmo espaço.
          </p>
        ) : foto.status === 'pending' ? (
          <p className="flex gap-3 rounded-[7px] bg-[var(--painel-sub)] p-4 text-[14px] text-[var(--painel-body)]">
            <Icone nome="olho" tamanho={20} className="mt-0.5 flex-none" />
            {foto.coverRequested
              ? 'Em revisão. Vira a capa quando a Onside aprovar.'
              : 'Em revisão. Aparece para o torcedor quando a Onside aprovar.'}
          </p>
        ) : null}
        {foto.caption ? (
          <div>
            <b className="mb-1 block text-[14px]">Legenda</b>
            <p className="text-[14px] text-[var(--painel-body)]">
              {foto.caption}
            </p>
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
          />
        )}
        {erro || falha ? (
          <p role="alert" className="text-[13px] text-[var(--painel-live)]">
            {erro ??
              getUserFacingMessage(
                falha,
                'Não foi possível salvar. Tente novamente.'
              )}
          </p>
        ) : null}
      </div>
      <div className="jogos-folha-pe">
        <Botao
          variante="sec"
          disabled={ocupado}
          onClick={() => void apagar()}
          className="mr-auto"
        >
          {apagando ? 'Apagando…' : 'Apagar foto'}
        </Botao>
        <Botao onClick={fechar}>Fechar</Botao>
      </div>
    </>
  )
}
