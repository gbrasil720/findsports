import { brasiliaDay } from '@findsports_oficial/db/event-window'
import {
  PROFILE_ALERT_DISMISS_DAYS,
  type ProfileAlert
} from '@findsports_oficial/db/profile-alerts'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, { FadeOut, useReducedMotion } from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { haptic } from '@/components/motion'
import { useSoon } from '@/components/soon'
import { usePalette } from '@/components/theme'
import { Text, text } from '@/components/ui'
import { trpc } from '@/lib/trpc'

/*
 * O alerta de perfil do bar (o `.wa` do painel web): um assunto por vez, no
 * topo das telas do dono, menos Meu espaço. A fila e o "Agora não" de 3 dias
 * são do servidor (`pub.getProfileAlert`, `pub.dismissProfileAlert`); erro ao
 * ler não mostra nada. O app pede a fila sem WhatsApp e cardápio (`SKIP`,
 * resolvidos no painel do site): horário, oferta e descrição abrem o passo
 * de completar-perfil; os times, Meu espaço na seção deles.
 */

const SKIP: ProfileAlert[] = ['whatsapp', 'cardapio']

type Copy = {
  title: string
  body: string
  cta: string
  href:
    | { pathname: '/completar-perfil'; params: { passo: '2' | '3' } }
    | { pathname: '/meu-espaco'; params: { aba: 'dados'; secao?: 'times' } }
}

// WhatsApp e cardápio ficam de fora: o servidor não os manda ao app.
const COPY: Partial<Record<ProfileAlert, Copy>> = {
  horario: {
    title: 'Seu bar está sem horário de funcionamento',
    body: 'Sem ele, o app não mostra se vocês estão abertos agora.',
    cta: 'Informar horário',
    href: { pathname: '/completar-perfil', params: { passo: '3' } }
  },
  oferta: {
    title: 'Seu bar está sem oferta da casa',
    body: 'Quem filtra por “Oferta da casa” na busca não encontra o seu bar.',
    cta: 'Escrever a oferta',
    href: { pathname: '/completar-perfil', params: { passo: '3' } }
  },
  descricao: {
    title: 'Seu perfil está sem descrição',
    body: 'Duas linhas sobre a casa em dia de jogo ajudam quem não conhece a escolher.',
    cta: 'Escrever descrição',
    href: { pathname: '/completar-perfil', params: { passo: '2' } }
  },
  times: {
    title: 'Você ainda não marcou os times da casa',
    body: 'Os jogos deles passam a vir primeiro nas sugestões da semana.',
    cta: 'Escolher os times',
    href: { pathname: '/meu-espaco', params: { aba: 'dados', secao: 'times' } }
  }
}

const WEEKDAYS = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado'
]

/** "Tudo bem. Lembramos de novo em quinta." (dia de Brasília). */
export function dismissNotice(now = Date.now()) {
  const day = brasiliaDay(now, PROFILE_ALERT_DISMISS_DAYS)
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
  return `Tudo bem. Lembramos de novo em ${WEEKDAYS[weekday]}.`
}

/**
 * `view` vai no topo do conteúdo da tela; `toast`, na raiz dela (o aviso
 * curto do "Agora não" fica por cima de tudo, como os outros do app).
 */
export function useProfileAlert() {
  const palette = usePalette()
  const router = useRouter()
  const reduced = useReducedMotion()
  const soon = useSoon()
  const query = useQuery(trpc.pub.getProfileAlert.queryOptions({ skip: SKIP }))
  // Some na hora do "Agora não"; falha no servidor traz de volta.
  const [hidden, setHidden] = useState<ProfileAlert | null>(null)
  const dismiss = useMutation(
    trpc.pub.dismissProfileAlert.mutationOptions({
      onError: () => {
        haptic.error()
        setHidden(null)
      }
    })
  )
  const alert = query.data?.alert ?? null
  const copy = alert && alert !== hidden ? COPY[alert] : null

  const view = copy ? (
    <Animated.View
      exiting={reduced ? undefined : FadeOut.duration(160)}
      accessibilityRole="summary"
      style={[
        styles.box,
        { backgroundColor: palette.warnBg, borderColor: palette.warnLine }
      ]}
    >
      <Svg
        width={20}
        height={20}
        viewBox="0 0 24 24"
        fill="none"
        stroke={palette.warnIcon}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={styles.icon}
      >
        <Path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        <Path d="M12 9v4" />
        <Path d="M12 17h.01" />
      </Svg>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[text(14.5, 'SemiBold', 1.35), { color: palette.warnFg }]}>
          {copy.title}
        </Text>
        <Text
          style={[
            text(13.5, 'Regular', 1.4),
            { color: palette.warnSub, marginTop: 1 }
          ]}
        >
          {`${copy.body} `}
          <Text
            accessibilityRole="link"
            onPress={() => {
              haptic.light()
              router.push(copy.href)
            }}
            style={[
              text(13.5, 'SemiBold', 1.4),
              { color: palette.warnFg, textDecorationLine: 'underline' }
            ]}
          >
            {`${copy.cta} →`}
          </Text>
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Agora não (volta em ${PROFILE_ALERT_DISMISS_DAYS} dias)`}
        hitSlop={8}
        onPress={() => {
          if (!alert) return
          haptic.light()
          setHidden(alert)
          soon.show(dismissNotice())
          dismiss.mutate({ alert })
        }}
        style={styles.close}
      >
        <Svg width={16} height={16} viewBox="0 0 24 24">
          <Path
            d="M6.3 4.6 12 10.3l5.7-5.7 1.7 1.7-5.7 5.7 5.7 5.7-1.7 1.7-5.7-5.7-5.7 5.7-1.7-1.7 5.7-5.7-5.7-5.7z"
            fill={palette.warnSub}
          />
        </Svg>
      </Pressable>
    </Animated.View>
  ) : null

  return { view, toast: soon.toast }
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 6,
    borderRadius: 14,
    borderWidth: 1
  },
  icon: { marginTop: 1 },
  close: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -6
  }
})
