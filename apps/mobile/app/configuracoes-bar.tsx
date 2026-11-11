import { useMutation, useQuery } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  Switch as NativeSwitch,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  alertFailure,
  OwnerCard,
  OwnerLabel,
  OwnerRow,
  PlanNudge
} from '@/components/bar-owner'
import { haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import {
  ACID,
  BackButton,
  Icon,
  INK,
  Text,
  text,
  useStatusBar
} from '@/components/ui'
import { authClient } from '@/lib/auth-client'
import { useOwnerBar } from '@/lib/owner'
import { queryClient, trpc } from '@/lib/trpc'

/*
 * Configurações do bar (rodada 10, tela 8; item "Configurações" do menu do
 * Bar): três abas. Bar: como o código é conferido (na hora ou pela comanda,
 * WEB-412, só Elite), atalhos para horário, oferta e fotos (que moram em Meu
 * espaço) e a conta do dono. Avisos: no celular (em breve, sem push ainda,
 * WEB-416) e os três e-mails (WEB-441), com os padrões do painel. Conta: a do
 * torcedor (nome, senha, duas etapas, aparelhos, sair, excluir), sem repetir
 * aqui. Excluir encerra a assinatura do site antes (WEB-336).
 *
 * Interruptores e abas são os do sistema: abas trocam seco, com o háptico.
 */

type Tab = 'bar' | 'avisos' | 'conta'

export default function ConfiguracoesBar() {
  const router = useRouter()
  const palette = usePalette()
  const insets = useSafeAreaInsets()
  useStatusBar(palette.dark ? 'light' : 'dark')
  const params = useLocalSearchParams<{ aba?: Tab }>()
  const [tab, setTab] = useState<Tab>(params.aba ?? 'bar')
  const owner = useOwnerBar()
  const bar = owner.bar
  const session = authClient.useSession()
  const photos = useQuery(trpc.pub.photos.queryOptions())
  const inReview = (photos.data ?? []).filter(
    (p) => p.status === 'pending'
  ).length
  const refresh = () => queryClient.invalidateQueries()
  const confirm = useMutation(
    trpc.pub.updateCodeConfirmation.mutationOptions({
      onSuccess: refresh,
      onError: alertFailure('Não deu para trocar como o código é conferido')
    })
  )
  const notices = useMutation(
    trpc.pub.updateNotices.mutationOptions({
      onSuccess: refresh,
      onError: (error) => {
        refresh()
        alertFailure('Não deu para salvar o aviso')(error)
      }
    })
  )
  const user = session.data?.user
  const hours = (bar?.openingHours ?? null) as
    | ({ opens: string; closes: string } | null)[]
    | null

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 16,
          gap: 14
        }}
      >
        <View style={styles.top}>
          <BackButton />
          <Text style={[styles.kicker, { color: palette.ink }]}>
            CONFIGURAÇÕES
          </Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.tabs}>
          {(
            [
              ['bar', 'Bar'],
              ['avisos', 'Avisos'],
              ['conta', 'Conta']
            ] as const
          ).map(([key, label]) => {
            const on = tab === key
            return (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  haptic.select()
                  if (key === 'conta')
                    return router.push({
                      pathname: '/configuracoes',
                      params: { aba: 'conta' }
                    })
                  setTab(key)
                }}
                style={[
                  styles.tab,
                  { backgroundColor: on ? palette.ink : palette.card }
                ]}
              >
                <Text
                  style={[
                    text(16, 'SemiBold', 1.2),
                    { color: on ? palette.bg : palette.ink }
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {tab === 'bar' ? (
          <>
            <View style={styles.labelRow}>
              <OwnerLabel>Código do balcão</OwnerLabel>
              <View style={styles.eliteTag}>
                <Text style={styles.eliteText}>ELITE</Text>
              </View>
            </View>
            <View
              style={[
                styles.segment,
                {
                  backgroundColor: palette.mark,
                  opacity: owner.elite ? 1 : 0.5
                }
              ]}
            >
              {(
                [
                  [false, 'Na hora'],
                  [true, 'Depois, pela comanda']
                ] as const
              ).map(([later, label]) => {
                const on = (bar?.confirmsCodesLater ?? false) === later
                return (
                  <Pressable
                    key={label}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on, disabled: !owner.elite }}
                    disabled={!owner.elite || confirm.isPending}
                    onPress={() => {
                      if (on) return
                      haptic.select()
                      confirm.mutate({ later })
                    }}
                    style={[
                      styles.segmentItem,
                      on && { backgroundColor: palette.ink }
                    ]}
                  >
                    <Text
                      style={[
                        text(15, 'SemiBold', 1.2),
                        { color: on ? palette.bg : palette.muted }
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
            {owner.elite ? (
              <Text
                style={[text(14, 'Regular', 1.45), { color: palette.muted }]}
              >
                {
                  'Na hora, o garçom valida na porta. Pela comanda, você lança os códigos até 48 h depois do jogo.'
                }
              </Text>
            ) : (
              <PlanNudge
                to="elite"
                title="O código do balcão"
                body="Quem marca “Vou assistir aqui” recebe um código; no balcão você valida, libera a oferta da casa e sabe quem veio pela Onside."
              />
            )}

            <OwnerCard>
              <Link
                first
                icon="calendar"
                title="Horário de funcionamento"
                sub={
                  hours?.some(Boolean)
                    ? hoursLine(hours)
                    : 'sem horário informado'
                }
                onPress={() => router.push('/meu-espaco')}
              />
              <Link
                icon="ticket"
                title="Oferta da casa"
                sub={
                  bar?.houseOffer ??
                  (owner.elite ? 'sem oferta' : 'do plano Elite')
                }
                onPress={() => router.push('/meu-espaco')}
              />
              <Link
                icon="camera"
                title="Fotos e descrição"
                sub={inReview ? `${inReview} em revisão` : 'no ar'}
                onPress={() => router.push('/fotos-do-bar')}
              />
            </OwnerCard>

            <OwnerLabel>Conta do dono</OwnerLabel>
            <OwnerCard>
              <Link
                first
                icon="person"
                title={user?.name ?? 'Sua conta'}
                sub={user?.email ?? ''}
                onPress={() =>
                  router.push({
                    pathname: '/configuracoes',
                    params: { aba: 'conta' }
                  })
                }
              />
              <Link
                icon="lock"
                title="Senha e duas etapas"
                sub={
                  user?.twoFactorEnabled
                    ? 'duas etapas ligada'
                    : 'duas etapas desligada'
                }
                onPress={() => router.push('/duas-etapas')}
              />
              <Link
                icon="close"
                title="Excluir a conta e o bar"
                sub="a assinatura do site é encerrada antes"
                onPress={() =>
                  router.push({
                    pathname: '/configuracoes',
                    params: { aba: 'conta' }
                  })
                }
              />
            </OwnerCard>
          </>
        ) : (
          <>
            <OwnerLabel>No celular</OwnerLabel>
            <OwnerCard>
              <Toggle
                first
                title="Chegou alguém com código"
                sub="na hora, com o nome e a oferta liberada"
              />
              <Toggle
                title="Avaliação nova"
                sub="quando um torcedor avaliar o bar"
              />
              <Toggle
                title="Foto ou descrição revisada"
                sub="aprovada ou recusada pela Onside"
              />
            </OwnerCard>
            <Text
              style={[
                text(13.5, 'Regular', 1.4),
                { color: palette.muted, marginTop: -4 }
              ]}
            >
              Os avisos no celular chegam em breve.
            </Text>
            <OwnerLabel>Por e-mail</OwnerLabel>
            <OwnerCard>
              <Toggle
                first
                title="Resumo da semana"
                sub="toda segunda, com os jogos e quem foi"
                on={bar?.noticeWeeklySummary ?? true}
                onChange={(next) =>
                  notices.mutateAsync({ weeklySummary: next })
                }
              />
              <Toggle
                title="Jogo lotando"
                sub="quando um jogo passa de 20 pessoas"
                on={bar?.noticeGameFilling ?? true}
                onChange={(next) => notices.mutateAsync({ gameFilling: next })}
              />
              <Toggle
                title="Grade vazia"
                sub="segunda sem nenhum jogo na semana"
                on={bar?.noticeEmptySchedule ?? false}
                onChange={(next) =>
                  notices.mutateAsync({ emptySchedule: next })
                }
              />
            </OwnerCard>
            <View style={[styles.note, { backgroundColor: palette.mark }]}>
              <Icon name="mail" size={18} color={palette.muted} />
              <Text
                style={[
                  text(14, 'Regular', 1.45),
                  { color: palette.ink, flex: 1 }
                ]}
              >
                {'Os e-mails vão para '}
                <Text style={text(14, 'Bold', 1.45)}>
                  {user?.email ?? 'o e-mail da conta'}
                </Text>
                . Presenças e códigos no resumo só no Elite.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  )
}

/** "ter a qui 17–00 · sex 16–02": os dois primeiros horários diferentes. */
function hoursLine(hours: ({ opens: string; closes: string } | null)[]) {
  const names = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
  const parts: string[] = []
  for (const day of [1, 2, 3, 4, 5, 6, 0]) {
    const slot = hours[day]
    if (!slot) continue
    const label = `${slot.opens.slice(0, 2)}–${slot.closes.slice(0, 2)}`
    const last = parts.at(-1)
    if (last?.endsWith(label)) continue
    parts.push(`${names[day]} ${label}`)
    if (parts.length === 2) break
  }
  return parts.join(' · ')
}

function Link({
  icon,
  title,
  sub,
  onPress,
  first
}: {
  icon: 'calendar' | 'ticket' | 'camera' | 'person' | 'lock' | 'close'
  title: string
  sub: string
  onPress: () => void
  first?: boolean
}) {
  const palette = usePalette()
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <OwnerRow first={first}>
        <Icon name={icon} size={20} color={palette.ink} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={[text(16.5, 'SemiBold', 1.3), { color: palette.ink }]}
          >
            {title}
          </Text>
          {sub ? (
            <Text
              numberOfLines={1}
              style={[text(14, 'Regular', 1.3), { color: palette.muted }]}
            >
              {sub}
            </Text>
          ) : null}
        </View>
        <Icon name="next" size={18} color={palette.muted} />
      </OwnerRow>
    </Pressable>
  )
}

function Toggle({
  title,
  sub,
  on,
  onChange,
  first
}: {
  title: string
  sub: string
  on?: boolean
  /** Sem ele, desenha desligado e travado (o que ainda não existe). */
  onChange?: (next: boolean) => Promise<unknown> | undefined
  first?: boolean
}) {
  const palette = usePalette()
  const [value, setValue] = useState(on ?? false)
  // Acompanha o valor salvo (o bar chega depois da tela).
  useEffect(() => setValue(on ?? false), [on])
  return (
    <OwnerRow first={first}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[
            text(16.5, 'SemiBold', 1.3),
            { color: onChange ? palette.ink : palette.muted }
          ]}
        >
          {title}
        </Text>
        <Text style={[text(14, 'Regular', 1.3), { color: palette.muted }]}>
          {sub}
        </Text>
      </View>
      {/* Caixa fixa: o interruptor do iOS 26 não informa a altura. */}
      <View style={styles.switchBox}>
        <NativeSwitch
          accessibilityLabel={title}
          value={onChange ? value : false}
          disabled={!onChange}
          onValueChange={(next) => {
            haptic.select()
            setValue(next)
            // Falhou: volta ao que estava (o aviso sai pelo onError).
            onChange?.(next)?.catch(() => setValue(!next))
          }}
          trackColor={{ false: palette.mark, true: ACID }}
          thumbColor={onChange && value ? INK : '#ffffff'}
          ios_backgroundColor={palette.mark}
        />
      </View>
    </OwnerRow>
  )
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  kicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 13,
    letterSpacing: 1.6
  },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    justifyContent: 'center'
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eliteTag: {
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 5,
    backgroundColor: ACID,
    justifyContent: 'center'
  },
  eliteText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    color: INK,
    letterSpacing: 0.8
  },
  segment: { flexDirection: 'row', padding: 4, borderRadius: 999 },
  segmentItem: {
    flex: 1,
    height: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  note: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 18 },
  switchBox: {
    width: 64,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
