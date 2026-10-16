import * as Location from 'expo-location'
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState
} from 'react'
import type { Coordinates } from '@/lib/explore'

/*
 * O estado do Explorar que as abas do torcedor dividem: a aba "Você" mostra o
 * mesmo Explorar por baixo do menu (2c), então filtros, posição da folha e
 * localização precisam ser os mesmos nas duas, senão trocar de aba mudaria
 * a tela de baixo.
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
  /** Onde a folha parou (distância do topo); `null` até a primeira vez. */
  resting: number | null
  setResting: (top: number) => void
}

const Context = createContext<ExploreState | null>(null)

export function ExploreStateProvider({ children }: { children: ReactNode }) {
  const [device, setDevice] = useState<Coordinates | null>(null)
  const [district, setDistrict] = useState<string | null>(null)
  const [liveOnly, setLiveOnly] = useState(false)
  const [todayOnly, setTodayOnly] = useState(false)
  const [amenities, setAmenities] = useState<number[]>([])
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
        todayOnly,
        setTodayOnly,
        amenities,
        setAmenities,
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
