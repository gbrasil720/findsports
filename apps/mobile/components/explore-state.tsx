import * as Location from 'expo-location'
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
  todayOnly: boolean
  setTodayOnly: (on: boolean) => void
  amenities: number[]
  setAmenities: (ids: number[]) => void
  /** O raio ampliado no fim da lista; `null` usa o do perfil. */
  radius: number | null
  setRadius: (km: number) => void
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

const Context = createContext<ExploreState | null>(null)

export function ExploreStateProvider({ children }: { children: ReactNode }) {
  const [device, setDevice] = useState<Coordinates | null>(null)
  const [district, setDistrict] = useState<string | null>(null)
  const [liveOnly, setLiveOnly] = useState(false)
  const [todayOnly, setTodayOnly] = useState(false)
  const [amenities, setAmenities] = useState<number[]>([])
  const [radius, setRadius] = useState<number | null>(null)
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
        todayOnly,
        setTodayOnly,
        amenities,
        setAmenities,
        radius,
        setRadius,
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
