import {
  type Href,
  Redirect,
  useLocalSearchParams,
  useRouter
} from 'expo-router'
import { DevSettings, Pressable, StyleSheet, Text, View } from 'react-native'
import { BackButton, INK, MUTED, Screen, Title, text } from '@/components/ui'

/*
 * Navegador de desenvolvimento: ir direto a qualquer tela pelo código do
 * design e recarregar só a tela em que se estava (ela monta de novo e a
 * entrada toca outra vez). Abre pela aba "DEV" na borda direita
 * (`components/dev-tab.tsx`). Não existe fora de desenvolvimento.
 */

const EMAIL = 'gabriel@onside.sh'

type Item = { code: string; label: string; href?: Href; reload?: true }

const BAR_DO_ZE = 'b0b0b0b0-0000-4000-8000-000000000e01'

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: '02 Splash',
    items: [
      // A splash é do layout e segue o tema do sistema: só um recarregamento
      // do app a mostra de novo.
      { code: '8a/8b', label: 'Splash (recarrega o app)', reload: true }
    ]
  },
  {
    title: '03 Apresentação',
    items: [1, 2, 3, 4].map((page) => ({
      code: `4${'bcde'[page - 1]}`,
      label: ['O jogo é aqui', 'Quem vai', 'Mesa garantida', 'Busca com IA'][
        page - 1
      ],
      href: { pathname: '/intro', params: { page } }
    }))
  },
  {
    title: '04 Conta',
    items: [
      { code: '4f', label: 'Como vai usar', href: '/profile' },
      {
        code: '4g',
        label: 'Criar conta (torcedor)',
        href: { pathname: '/sign-up', params: { role: 'fan' } }
      },
      {
        code: '4g',
        label: 'Criar conta (bar)',
        href: { pathname: '/sign-up', params: { role: 'pub' } }
      },
      {
        code: '4h',
        label: 'Confirmar e-mail',
        href: { pathname: '/verify-email', params: { email: EMAIL } }
      },
      { code: '2p', label: 'Login', href: '/sign-in' },
      {
        code: '11p',
        label: 'Esqueci a senha',
        href: { pathname: '/forgot-password', params: { email: EMAIL } }
      },
      {
        code: '11q',
        label: 'Link enviado',
        href: { pathname: '/reset-sent', params: { email: EMAIL } }
      },
      {
        // Token de mentira: a tela abre, salvar dá erro de link vencido.
        code: '11r',
        label: 'Nova senha',
        href: { pathname: '/reset-password', params: { token: 'dev' } }
      },
      { code: '11s', label: 'Duas etapas', href: '/two-factor' }
    ]
  },
  {
    title: '05 Onboarding do torcedor',
    // Precisa de sessão de torcedor (os esportes e times vêm da API).
    items: [
      { code: '4i', label: 'Boas-vindas', href: '/onboarding' },
      { code: '4j', label: 'Esportes', href: '/onboarding/sports' },
      { code: '4k', label: 'Times', href: '/onboarding/teams' },
      { code: '4l', label: 'Distância', href: '/onboarding/distance' },
      { code: '4m', label: 'Localização', href: '/onboarding/location' },
      { code: '4n', label: 'Revisão', href: '/onboarding/review' }
    ]
  },
  {
    title: '06 Avulsas',
    items: [
      { code: '11w', label: '404', href: '/pagina-que-nao-existe' as Href },
      { code: '11x', label: 'Termos de Uso', href: '/legal' },
      {
        code: '11x',
        label: 'Privacidade',
        href: { pathname: '/legal', params: { doc: 'privacidade' } }
      }
    ]
  },
  {
    title: '07 Explorar',
    items: [
      // Claro ou escuro pelo tema do sistema; a página do bar (2g) abre
      // tocando num card ou num pino.
      { code: '2d/2e', label: 'Explorar', href: '/explore' }
    ]
  },
  {
    title: '08 Vou assistir',
    items: [
      // O Bar do Zé de `scripts/bar-do-ze.sql`. O código (3f) e o pós-jogo
      // (3g) abrem de Meus jogos, com jogo marcado e jogo encerrado.
      {
        code: '3d',
        label: 'Vou assistir aqui',
        href: { pathname: '/vou/[barId]', params: { barId: BAR_DO_ZE } }
      },
      { code: '3e', label: 'Meus jogos', href: '/meus-jogos' }
    ]
  }
]

/** Monta a tela de novo: o parâmetro `_r` muda, a pilha cria outra. */
const fresh = (href: Href): Href => {
  const stamp = String(Date.now())
  return typeof href === 'string'
    ? { pathname: href as never, params: { _r: stamp } }
    : ({ ...href, params: { ...href.params, _r: stamp } } as Href)
}

function Row({ item, onPress }: { item: Item; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <Text style={[styles.code, text(13, 'Bold')]}>{item.code}</Text>
      <Text style={[text(15, 'SemiBold'), { flex: 1 }]}>{item.label}</Text>
    </Pressable>
  )
}

export default function Dev() {
  const router = useRouter()
  const { from, fromParams } = useLocalSearchParams<{
    from?: string
    fromParams?: string
  }>()
  if (!__DEV__) return <Redirect href="/" />

  const open = (href: Href) => router.replace(fresh(href))
  const current =
    from && from !== '/dev'
      ? ({
          pathname: from,
          params: fromParams ? JSON.parse(fromParams) : {}
        } as Href)
      : null

  return (
    <Screen gap={18}>
      <BackButton />
      <Title lines={[['Telas']]} size={38} />
      {current ? (
        <Row
          item={{ code: '↻', label: `Recarregar esta tela (${from})` }}
          onPress={() => open(current)}
        />
      ) : null}
      {SECTIONS.map((section) => (
        <View key={section.title} style={{ gap: 8 }}>
          <Text style={[text(12, 'Bold'), { color: MUTED }]}>
            {section.title.toUpperCase()}
          </Text>
          {section.items.map((item) => (
            <Row
              key={item.code + item.label}
              item={item}
              onPress={() =>
                item.reload
                  ? DevSettings.reload()
                  : item.href && open(item.href)
              }
            />
          ))}
        </View>
      ))}
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: 'rgba(18,18,15,.1)'
  },
  code: {
    minWidth: 44,
    color: INK,
    fontFamily: 'GeistMono-SemiBold'
  }
})
