import * as Location from 'expo-location'
import * as SecureStore from 'expo-secure-store'
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react'
import type { View } from 'react-native'
import { captureRef } from 'react-native-view-shot'
import type { Coordinates } from '@/lib/explore'
import { type Filters, NO_FILTERS, type Shortcut } from '@/lib/filters'

/*
 * O estado do Explorar que as abas do torcedor dividem: a aba "Você" mostra o
 * mesmo Explorar por baixo do menu (2c), então filtros, posição da folha e
 * localização precisam ser os mesmos nas duas, senão trocar de aba mudaria
 * a tela de baixo. A tela de baixo da "Você" é uma foto do Explorar (`shot`).
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
   * "Ver no mapa" da busca (19b): o Explorar leva o mapa até lá e limpa.
   * `km` é o tamanho da área a mostrar.
   */
  focus: (Coordinates & { km: number }) | null
  setFocus: (focus: (Coordinates & { km: number }) | null) => void
  /** Onde a folha parou (distância do topo); `null` até a primeira vez. */
  resting: number | null
  setResting: (top: number) => void
  /** A tela do Explorar, para a foto que a aba "Você" mostra. */
  screen: React.RefObject<View | null>
  /** A última foto do Explorar; `null` antes da primeira. */
  shot: string | null
  /** Tira a foto do Explorar como está agora. Falhou, fica a anterior. */
  takeShot: () => Promise<void>
}

const SHORTCUTS_KEY = 'onside.atalhos-do-mapa'

const Context = createContext<ExploreState | null>(null)

export function ExploreStateProvider({ children }: { children: ReactNode }) {
  const [device, setDevice] = useState<Coordinates | null>(null)
  const [district, setDistrict] = useState<string | null>(null)
  const [liveOnly, setLiveOnly] = useState(false)
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [shortcuts, saveShortcuts] = useState<Shortcut[] | null>(null)
  const [focus, setFocus] = useState<ExploreState['focus']>(null)
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
  // A aba "Você" mostra o Explorar parado sob o menu. Uma segunda cópia viva
  // montava outro mapa, que recarregava os tiles na primeira vez que aparecia.
  const screen = useRef<View>(null)
  const [shot, setShot] = useState<string | null>(null)
  // ~70 ms no simulador: abaixo do que se percebe entre o toque e o menu.
  const takeShot = () =>
    captureRef(screen, { format: 'jpg', quality: 0.9, result: 'tmpfile' })
      .then(setShot)
      .catch(() => {})

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
        resting,
        setResting,
        screen,
        shot,
        takeShot
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
