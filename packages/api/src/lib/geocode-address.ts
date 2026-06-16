import { TRPCError } from '@trpc/server'

export async function geocodeAddress(
  address: string,
  apiKey: string
): Promise<{ latitude: string; longitude: string }> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
  const res = await fetch(url)
  const data = (await res.json()) as {
    status: string
    results: Array<{
      geometry: { location: { lat: number; lng: number } }
    }>
  }

  if (data.status !== 'OK' || !data.results[0]) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Endereço não encontrado. Verifique e tente novamente.'
    })
  }

  const { lat, lng } = data.results[0].geometry.location
  return { latitude: lat.toString(), longitude: lng.toString() }
}
