import { existsSync } from 'node:fs'
import type { ConfigContext, ExpoConfig } from 'expo/config'
import { withEntitlementsPlist } from 'expo/config-plugins'

/*
 * Push (WEB-416) por cima do `app.json`, que continua sendo a configuração.
 *
 * Android: o FCM precisa do `google-services.json` do projeto do Firebase do
 * dono. Ele fica fora do git; sem ele o build sai igual, sem push.
 *
 * iOS: o `expo-notifications` liga sozinho o `aps-environment`, e a equipe
 * pessoal (conta grátis da Apple) não assina app com push: o build no
 * aparelho quebraria. Ele só fica com `IOS_PUSH=1`, depois da conta paga.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ??
    (existsSync('./google-services.json')
      ? './google-services.json'
      : undefined)
  const withPush = {
    ...config,
    android: { ...config.android, googleServicesFile }
  } as ExpoConfig
  if (process.env.IOS_PUSH === '1') return withPush
  return withEntitlementsPlist(withPush, (entitlements) => {
    delete entitlements.modResults['aps-environment']
    return entitlements
  })
}
