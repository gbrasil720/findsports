import * as Linking from 'expo-linking'

/*
 * O último link que abriu o app, com ele fechado ou aberto. `useURL` e
 * `useLinkingURL` devolvem o link da abertura a frio para uma tela montada
 * depois, e o roteador estraga o `+` dos parâmetros (ver `raw-param.ts`).
 * Importado no layout raiz, para ouvir antes de a tela de destino montar.
 */
let latest: string | null = null
Linking.addEventListener('url', ({ url }) => {
  latest = url
})

export async function latestURL() {
  return latest ?? (await Linking.getInitialURL())
}
