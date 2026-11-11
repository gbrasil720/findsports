const { getDefaultConfig } = require('expo/metro-config')
const { withUniwindConfig } = require('uniwind/metro')
const {
  wrapWithReanimatedMetroConfig
} = require('react-native-reanimated/metro-config')

// O `getDefaultConfig` do Expo já entende o monorepo (workspaces do bun): acha
// os pacotes de `packages/*` e o `node_modules` da raiz sem configuração extra.
/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)
// O visualizador da medalha 3D (`assets/medal/viewer.html`) vai como arquivo.
config.resolver.assetExts.push('html')

module.exports = withUniwindConfig(wrapWithReanimatedMetroConfig(config), {
  cssEntryFile: './global.css',
  dtsFile: './uniwind-types.d.ts'
})
