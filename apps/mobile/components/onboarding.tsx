import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { File, Paths } from 'expo-file-system'
import {
  type Href,
  Stack,
  useGlobalSearchParams,
  useLocalSearchParams,
  usePathname,
  useRouter
} from 'expo-router'
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState
} from 'react'
import { useExploreState } from '@/components/explore-state'
import { type CardField, FanCard } from '@/components/fan-card'
import { haptic } from '@/components/motion'
import { BackButton } from '@/components/ui'
import { authClient } from '@/lib/auth-client'
import { FLOW, type Frame, stepOf } from '@/lib/onboarding'
import { trpc } from '@/lib/trpc'

/*
 * Peças do onboarding do torcedor ("05 Onboarding do torcedor" do design,
 * 4i–4n): as escolhas de todos os passos num contexto, o topo com o
 * progresso e os controles de escolha (esporte, time, raio). Os passos são
 * rotas em `app/onboarding/`; o envio é um só, no fim, como no web
 * (`onboarding.completeFan`).
 */

export const STEPS = 5
export type Radius = 1 | 3 | 5 | 10
export type City = { name: string; uf: string; lat: number; lng: number }
export type Team = {
  id: string
  name: string
  sportId: string
  /** WEB-381: lutador e tenista são "atleta"; WEB-520: o GP da F1, "race". */
  kind: 'team' | 'athlete' | 'race'
  /** A chave do catálogo: o GP desenha o traçado por ela (`f1-tracks`). */
  catalogKey?: string | null
}

type Choices = {
  sportIds: string[]
  teams: Team[]
  city: City | null
  radius: Radius
}

const Context = createContext<{
  choices: Choices
  set: (patch: Partial<Choices>) => void
} | null>(null)

/*
 * O rascunho do cadastro (regra 05 do Adaptativo 09): as escolhas e o passo
 * vão para um arquivo a cada mudança. Dobrar ou abrir não remonta a pilha,
 * mas o Android pode recriar a tela ao trocar de display (a tela de fora do
 * Flip); aí o app reabre no passo onde parou, com as escolhas. Arquivo, não
 * SecureStore: com muitos times passa dos 2 KB que ele aceita no Android.
 */
const DRAFT = 'onboarding-rascunho.json'
type Draft = { userId: string; route: string; choices: Choices }

function readDraft(): Draft | null {
  try {
    const file = new File(Paths.document, DRAFT)
    return file.exists ? (JSON.parse(file.textSync()) as Draft) : null
  } catch {
    return null
  }
}

function writeDraft(draft: Draft | null) {
  try {
    const file = new File(Paths.document, DRAFT)
    if (!draft) {
      if (file.exists) file.delete()
      return
    }
    if (!file.exists) file.create()
    file.write(JSON.stringify(draft))
  } catch {}
}

/** O cadastro terminou: o rascunho sai. */
export const clearDraft = () => writeDraft(null)

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const userId = authClient.useSession().data?.user.id
  // Na edição pelas Configurações não há rascunho: ela parte do perfil.
  const editing = useGlobalSearchParams<{ edit?: string }>().edit === '1'
  const [draft] = useState(readDraft)
  // O raio começa em 3 km, o padrão do servidor (`searchRadiusKm`).
  const [choices, setChoices] = useState<Choices>(
    () =>
      (!editing && draft?.choices) || {
        sportIds: [],
        teams: [],
        city: null,
        radius: 3
      }
  )
  const set = (patch: Partial<Choices>) =>
    setChoices((current) => ({ ...current, ...patch }))
  // Abriu de novo no começo, com rascunho: volta ao passo onde parou.
  // biome-ignore lint/correctness/useExhaustiveDependencies: só ao abrir
  useEffect(() => {
    if (editing || !draft?.route || stepOf(pathname) !== 0) return
    router.push(`/onboarding/${draft.route}` as Href)
  }, [])
  // De quem é o rascunho só se sabe com a sessão: o de outra conta sai.
  useEffect(() => {
    if (userId && draft && draft.userId !== userId) {
      writeDraft(null)
      setChoices({ sportIds: [], teams: [], city: null, radius: 3 })
    }
  }, [userId, draft])
  useEffect(() => {
    // A carteirinha validada (`pronto`) vem depois do envio: sem rascunho.
    if (editing || !userId || pathname.endsWith('/pronto')) return
    writeDraft({ userId, route: FLOW[stepOf(pathname)].route, choices })
  }, [editing, userId, pathname, choices])
  return (
    <Context.Provider value={{ choices, set }}>{children}</Context.Provider>
  )
}

export function useOnboarding() {
  const value = useContext(Context)
  if (!value) throw new Error('useOnboarding fora de app/onboarding')
  return value
}

/**
 * Esportes e times pelas Configurações ("Editar", 11f): as mesmas telas do
 * onboarding com `?edit=1`, começando do que a pessoa já tem e salvando no
 * fim dos times, sem passar por distância e revisão.
 */
export function useEditing() {
  const { edit } = useLocalSearchParams<{ edit?: string }>()
  const editing = edit === '1'
  const router = useRouter()
  const queryClient = useQueryClient()
  const { choices, set } = useOnboarding()
  const sports = useQuery({
    ...trpc.pubs.getMyPreferences.queryOptions(),
    enabled: editing
  })
  const teams = useQuery({
    ...trpc.pubs.getMyTeams.queryOptions(),
    enabled: editing
  })
  // Uma vez, quando as duas chegam e o contexto ainda está vazio. Em efeito:
  // o contexto é do layout, e mudá-lo durante a renderização da tela erra.
  const ready = Boolean(sports.data && teams.data)
  const [filled, setFilled] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: só ao chegar
  useEffect(() => {
    if (!editing || !ready || filled) return
    setFilled(true)
    if (choices.sportIds.length === 0)
      set({
        sportIds: (sports.data ?? []).map((p) => p.sportId),
        teams: teams.data ?? []
      })
  }, [editing, ready, filled])
  const savePrefs = useMutation(trpc.pubs.updateMyPreferences.mutationOptions())
  const saveTeams = useMutation(trpc.pubs.updateMyTeams.mutationOptions())
  const save = async () => {
    await savePrefs.mutateAsync({ sportIds: choices.sportIds })
    await saveTeams.mutateAsync({ teamIds: choices.teams.map((t) => t.id) })
    haptic.success()
    for (const key of [
      trpc.pubs.getMyPreferences.queryKey(),
      trpc.pubs.getMyTeams.queryKey(),
      trpc.recommendations.get.queryKey()
    ])
      queryClient.invalidateQueries({ queryKey: key })
    router.dismissTo('/configuracoes')
  }
  // Por baixo da primeira tela da edição o expo-router põe as boas-vindas:
  // voltar (botão ou gesto) sai da edição, menos dos times para os esportes.
  const { from } = useLocalSearchParams<{ from?: string }>()
  const leave = () =>
    from === 'sports' ? router.back() : router.dismissTo('/configuracoes')
  const back = editing ? (
    <>
      <Stack.Screen options={{ gestureEnabled: from === 'sports' }} />
      <BackButton onPress={leave} />
    </>
  ) : null
  return {
    editing,
    back,
    ready: !editing || filled,
    save,
    saving: savePrefs.isPending || saveTeams.isPending,
    failed: savePrefs.isError || saveTeams.isError
  }
}

// --- Entorno (fora do celular, ver `onboarding-frame.tsx`) -----------------

/** O passo vê o entorno: na mesa, a pergunta e o progresso já estão em cima. */
export const FrameKind = createContext<Frame['kind']>('phone')
export const useFrameKind = () => useContext(FrameKind)

/**
 * A área do passo: o tamanho (o mapa da localização se encaixa nela) e o
 * respiro de cada lado que leva o passo para a coluna.
 */
export const Pane = createContext<{
  width: number
  height: number
  side: number
  /** Fora do celular (Duo fechado incluso): o título pode correr mais largo. */
  wide: boolean
} | null>(null)
export const usePane = () => useContext(Pane)

/** "FUT", "BAS", "F1", "MMA": a sigla do esporte (tiles e carteirinha). */
export function sportMark(name: string) {
  const acronym = name.match(/\b[A-Z]{2,}\b/)
  if (acronym) return acronym[0]
  const digit = name.match(/^(\p{L})\S*\s+(\d)/u)
  if (digit) return `${digit[1]}${digit[2]}`.toUpperCase()
  const words = name.split(/\s+/)
  if (words.length > 1)
    return words
      .map((w) => w[0])
      .join('')
      .toUpperCase()
  return name.slice(0, 3).toUpperCase()
}

/**
 * A carteirinha do onboarding B (rodada 2): preenche-se com as escolhas, e o
 * campo do passo acende. O raio entra no passo dele; a base é o bairro com a
 * localização, senão a cidade escolhida, a partir do passo do onde.
 */
export function OnboardingCard({
  lit,
  radius = false,
  base = false,
  baseName
}: {
  lit: CardField
  radius?: boolean
  base?: boolean
  /** A cidade em destaque na lista, antes de confirmada. */
  baseName?: string
}) {
  const { choices } = useOnboarding()
  const name = authClient.useSession().data?.user.name ?? ''
  const sports = useQuery(trpc.pubs.getSports.queryOptions())
  const { device, district } = useExploreState()
  return (
    <FanCard
      name={name || 'Torcedor'}
      // O GP vale para o aviso, não para "Torce para" (WEB-520).
      teams={choices.teams
        .filter((team) => team.kind !== 'race')
        .map((team) => team.name)}
      // Na ordem em que a pessoa escolheu.
      sports={choices.sportIds.flatMap((id) => {
        const sport = sports.data?.find((item) => item.id === id)
        return sport ? [sportMark(sport.name)] : []
      })}
      radius={radius ? `${choices.radius} km` : null}
      base={
        base
          ? baseName || (device && district) || choices.city?.name || null
          : null
      }
      lit={lit}
    />
  )
}
