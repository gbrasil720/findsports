# Product

<!-- impeccable:product-schema 1 -->

Herda tudo de `/PRODUCT.md` (raiz). Aqui só o que muda no app do torcedor.

## Platform

ios

iOS 26 é a linguagem de referência: liquid glass (`Glass`, `GlassView`), `NativeTabs`,
`formSheet` nativo, Apple Maps `mutedStandard`. Android não tem linguagem própria: herda
as cores (Google Maps com `customMapStyle`, cor translúcida no lugar do vidro).
iPad e dobráveis são adaptação de layout (`useLayout`), não outro design.

## Stack

Expo SDK 57 + expo-router + Uniwind (Tailwind v4 no React Native), Reanimated 4,
`react-native-maps`. Roda no Expo Go; módulos nativos (postura do dobrável) só no build
de desenvolvimento. Sem backend próprio: fala com a API do web.

## Users

Torcedor, no celular, decidindo onde assistir o jogo de hoje ou dos próximos dias, ou já
no bar (código no balcão, "Estou aqui"). Bar não usa o app para gerir a casa: isso é o
painel web.

## Capabilities and Constraints

- Desenho de referência: projeto do Claude Design
  `5185ab40-42b3-4469-a0a7-9e96448d9e24`. O design desenha várias telas só no claro (ou
  só no escuro); o outro tema troca tinta e papel e põe acid no lugar do vermelho.
- Uma tabela de cores só (`PALETTE` em `components/theme.tsx`).
- `Text`/`TextInput` sempre de `@/components/ui` (teto do Texto maior).
- Toda tela nova é conferida no simulador iOS 390 × 844 contra o design e passa pelas
  skills de animação antes da entrega.
- Sem push ainda (WEB-416): avisos vivem na tela Avisos.
