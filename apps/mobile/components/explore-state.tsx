import * as Location from 'expo-location'
import { useIsFocused } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'
import type { View } from 'react-native'
import { captureRef, releaseCapture } from 'react-native-view-shot'
import type { ChatBar } from '@/lib/ai-events'
import type { Coordinates } from '@/lib/explore'
import { type Filters, NO_FILTERS, type Shortcut } from '@/lib/filters'
import type { MapFrame } from '@/lib/map-layers'

/*
 * O estado do Explorar que as abas do torcedor dividem: a aba "Você" mostra o
 * mesmo Explorar por baixo do menu (2c), então filtros, posição da folha e
 * localização precisam ser os mesmos nas duas, senão trocar de aba mudaria
 * a tela de baixo. A tela de baixo da "Você" é uma foto da aba de onde a
 * pessoa veio (`useShot`, mais abaixo).
 */

type ExploreState = {
  /** Localização do aparelho, se já deu permissão (o onboarding pede). */
  device: Coordinates | null
  /** O bairro de onde a pessoa está ("Vila Madalena"), ou a cidade. */
  district: string | null
  liveOnly: boolean
  setLiveOnly: (on: boolean) => void
  /** Dia, esporte, características e raio (19d); o raio vale só na visita. */
  filters: Filters
  setFilters: (filters: Filters) => void
  /**
   * Os atalhos fixados no topo do mapa (19e), guardados no aparelho. `null`:
   * a pessoa nunca mexeu, e a fileira é a padrão (`defaultShortcuts`).
   */
  shortcuts: Shortcut[] | null
  setShortcuts: (list: Shortcut[]) => void
  /**
   * "Ver no mapa" da busca (19b) e da busca com IA: o Explorar leva o mapa
   * até o quadro e limpa. Um quadro novo troca os bares da resposta pelos de
   * `answer` (só a busca com IA manda; a outra busca os tira).
   */
  focus: MapFrame | null
  setFocus: (focus: MapFrame | null, answer?: ChatBar[]) => void
  /**
   * Os bares da resposta da busca com IA que o "Ver no mapa" levou: o
   * Explorar os desenha como gotas junto com os da busca dele, até a pessoa
   * mexer na busca (filtros, atalhos, "Ao vivo", "Ampliar"), pedir outro
   * "Ver no mapa" ou voltar ao raio (`clearAnswer`).
   */
  answer: ChatBar[] | null
  clearAnswer: () => void
  /** Onde a folha parou (distância do topo); `null` até a primeira vez. */
  resting: number | null
  setResting: (top: number) => void
}

const SHORTCUTS_KEY = 'onside.atalhos-do-mapa'

const Context = createContext<ExploreState | null>(null)

export function ExploreStateProvider({ children }: { children: ReactNode }) {
  const [device, setDevice] = useState<Coordinates | null>(null)
  const [district, setDistrict] = useState<string | null>(null)
  const [liveOnly, saveLiveOnly] = useState(false)
  const [filters, saveFilters] = useState<Filters>(NO_FILTERS)
  const [shortcuts, saveShortcuts] = useState<Shortcut[] | null>(null)
  const [focus, saveFocus] = useState<ExploreState['focus']>(null)
  const [answer, setAnswer] = useState<ChatBar[] | null>(null)
  const clearAnswer = () => setAnswer(null)
  // Mexer na busca solta os bares da resposta: os pinos voltam a ser só os
  // da busca à vista.
  const setLiveOnly = (on: boolean) => {
    saveLiveOnly(on)
    clearAnswer()
  }
  const setFilters = (next: Filters) => {
    saveFilters(next)
    clearAnswer()
  }
  const setFocus: ExploreState['setFocus'] = (next, bars) => {
    saveFocus(next)
    if (next) setAnswer(bars ?? null)
  }
  useEffect(() => {
    SecureStore.getItemAsync(SHORTCUTS_KEY)
      .then((raw) => {
        if (raw) saveShortcuts(JSON.parse(raw))
      })
      .catch(() => {})
  }, [])
  const setShortcuts = (list: Shortcut[]) => {
    saveShortcuts(list)
    SecureStore.setItemAsync(SHORTCUTS_KEY, JSON.stringify(list)).catch(
      () => {}
    )
  }
  const [resting, setResting] = useState<number | null>(null)

  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then(({ granted }) =>
        granted
          ? Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced
            })
          : null
      )
      .then(async (position) => {
        if (!position) return
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        }
        setDevice(coords)
        const [place] = await Location.reverseGeocodeAsync({
          latitude: coords.lat,
          longitude: coords.lng
        })
        setDistrict(place?.district ?? place?.subregion ?? place?.city ?? null)
      })
      .catch(() => {})
  }, [])

  return (
    <Context.Provider
      value={{
        device,
        district,
        liveOnly,
        setLiveOnly,
        filters,
        setFilters,
        shortcuts,
        setShortcuts,
        focus,
        setFocus,
        answer,
        clearAnswer,
        resting,
        setResting
      }}
    >
      {children}
    </Context.Provider>
  )
}

export function useExploreState() {
  const value = useContext(Context)
  if (!value) throw new Error('useExploreState fora de app/(fan)')
  return value
}

/*
 * A foto que a aba "Você" põe sob o menu: a da última aba vista (Explorar ou
 * Seus bares). Uma segunda cópia viva do Explorar montava outro mapa, que
 * recarregava os tiles. A aba troca no nativo, sem esperar o JS (esperar
 * fazia a lente da barra ir, voltar e ir de novo), então a foto já tem de
 * estar pronta: a tela em foco se fotografa meio segundo depois de cada
 * mudança. Fica fora do contexto para a foto nova não renderizar as telas.
 */
type ShotSource = 'explore' | 'bars'
const shots: Partial<Record<ShotSource, string>> = {}
// A aba que a pessoa viu por último: é ela que vai sob o menu.
let lastSource: ShotSource = 'explore'
const shotListeners = new Set<() => void>()
const notify = () => {
  for (const listener of shotListeners) listener()
}

/** A foto da última aba vista; `undefined` antes da primeira. */
export function useShot() {
  return useSyncExternalStore(
    (listener) => {
      shotListeners.add(listener)
      return () => shotListeners.delete(listener)
    },
    () => shots[lastSource]
  )
}

/**
 * A tela a fotografar (`ref`). `again` pede outra foto onde a mudança não
 * renderiza nada (rolagem).
 */
export function useShotSource(source: ShotSource, enabled = true) {
  const ref = useRef<View>(null)
  const focused = useIsFocused()
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!enabled || !focused) return
    if (lastSource !== source) {
      lastSource = source
      notify()
    }
    // ~70 ms no simulador: parado há meio segundo, não pesa num gesto.
    const timer = setTimeout(() => {
      captureRef(ref, { format: 'jpg', quality: 0.9, result: 'tmpfile' })
        .then((uri) => {
          const old = shots[source]
          if (old) releaseCapture(old)
          shots[source] = uri
          notify()
        })
        .catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  })
  return { ref, again: () => setTick((t) => t + 1) }
}
