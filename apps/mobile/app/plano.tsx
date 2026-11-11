import {
  readRoutine,
  recommendPlan
} from '@findsports_oficial/api/lib/pub-routine'
import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  alertFailure,
  OwnerCard,
  OwnerLabel,
  OwnerRow
} from '@/components/bar-owner'
import { HardShadow } from '@/components/explore'
import { DotField } from '@/components/fan-card'
import { haptic } from '@/components/motion'
import { PlanMedal } from '@/components/plan-medal'
import { useSoon } from '@/components/soon'
import { usePalette } from '@/components/theme'
import {
  ACID,
  BackButton,
  ErrorState,
  Icon,
  INK,
  PAPER,
  Text,
  text,
  useStatusBar
} from '@/components/ui'
import { dayMonth } from '@/lib/bar-owner'
import { PLAN_NAMES, PLAN_PRICES, type Plan, useOwnerBar } from '@/lib/owner'
import { queryClient, trpc } from '@/lib/trpc'

/*
 * Plano e cobrança (rodada 10, telas 7, 7b e 7c; item "Plano" do menu do
 * Bar). O que o plano fez no mês com os números do próprio bar vem antes do
 * pedido. Os estados: no teste (dias que faltam, trocar o plano do teste sem
 * cartão, WEB-358), assinatura pelo site (gerencia no painel do site; o
 * endereço é texto, sem link, pela regra da Apple), pagamento pendente (o bar
 * segue com o Starter) e teste vencido (o bar fora do ar, WEB-357).
 *
 * A compra pela App Store (Qonversion) fica desligada até a conta Apple paga
 * (dono, 11/11/2026): o botão diz que chega em breve.
 */

const PLANS: Plan[] = ['elite', 'pro', 'starter']
const DAY = 86_400_000

export default function Plano() {
  const palette = usePalette()
  const insets = useSafeAreaInsets()
  const soon = useSoon()
  useStatusBar(palette.dark ? 'light' : 'dark')
  const owner = useOwnerBar()
  const sub = useQuery(trpc.pub.getMySubscription.queryOptions())
  const proof = useQuery(trpc.pub.getMonthProof.queryOptions())
  const month = useQuery(
    trpc.commercialAnalytics.getMyAnalyticsOverview.queryOptions({
      from: `${brasiliaDay(Date.now()).slice(0, 8)}01`,
      to: brasiliaDay(Date.now())
    })
  )
  const change = useMutation(
    trpc.pub.changeTrialPlan.mutationOptions({
      onError: alertFailure('Não deu para trocar o plano do teste'),
      onSuccess: () => {
        haptic.success()
        queryClient.invalidateQueries()
      }
    })
  )
  const s = sub.data
  const site = Boolean(s?.externalSubscriptionId)
  const standing = s?.standing ?? null
  const trial = s?.status === 'trialing' && !site && standing === 'current'
  const ended = !s || standing === 'trial_ended' || standing === 'ended'
  const pastDue = standing === 'past_due'
  const plan = (s?.plan ?? 'starter') as Plan
  // Teste vencido: o fluxo normal de escolher o plano (decisão do dono,
  // 11/11/2026). Vem marcado o que a rotina indica, senão o do teste.
  const routine = readRoutine(owner.bar?.routine)
  const indicated: Plan = routine ? recommendPlan(routine).plan : plan
  const [picked, setPicked] = useState<Plan | null>(null)
  const choice = picked ?? indicated
  const end = s?.currentPeriodEnd ? new Date(s.currentPeriodEnd) : null
  const left = end
    ? Math.max(0, Math.ceil((end.getTime() - Date.now()) / DAY))
    : 0
  const start = s?.createdAt ? new Date(s.createdAt) : null
  const share =
    end && start
      ? Math.min(
          1,
          Math.max(
            0.03,
            (Date.now() - start.getTime()) / (end.getTime() - start.getTime())
          )
        )
      : 0
  const buy = (label: string) =>
    soon.show(`${label}: a compra pela App Store chega em breve.`)

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingBottom: insets.bottom + (trial || ended ? 150 : 40),
          paddingHorizontal: 16,
          gap: 14
        }}
      >
        <View style={styles.top}>
          <BackButton />
          <Text style={[styles.kicker, { color: palette.ink }]}>
            PLANO E COBRANÇA
          </Text>
          <View style={{ width: 44 }} />
        </View>

        {sub.isError ? (
          <ErrorState
            title="Não deu para abrir o plano."
            error={sub.error}
            onRetry={() => sub.refetch()}
            retrying={sub.isFetching}
          />
        ) : sub.isPending ? (
          <Text style={[text(15, 'Regular', 1.45), { color: palette.muted }]}>
            Carregando o plano…
          </Text>
        ) : ended ? (
          <Ended
            barName={owner.bar?.name ?? ''}
            address={owner.bar?.address ?? ''}
            people={proof.data?.people ?? 0}
            trialEnded={standing !== 'ended'}
            choice={choice}
            indicated={indicated}
            onPick={(id) => {
              haptic.select()
              setPicked(id)
            }}
          />
        ) : (
          <>
            {pastDue ? (
              <View style={[styles.alert, { borderColor: ACID }]}>
                <Icon name="bell" size={22} color={PAPER} accent={ACID} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[text(17, 'Bold', 1.25), { color: PAPER }]}>
                    {`A cobrança do ${PLAN_NAMES[plan]} não passou`}
                  </Text>
                  <Text
                    style={[text(14.5, 'Regular', 1.45), { color: '#c9c7c0' }]}
                  >
                    O bar continua no ar, com os recursos do Starter, até o
                    pagamento passar. Atualize o cartão no painel do bar, no
                    computador.
                  </Text>
                </View>
              </View>
            ) : (
              <View>
                <HardShadow color="#000" offset={5} radius={28} />
                <View style={styles.hero}>
                  <DotField id="plano" radius={28} />
                  <View style={styles.heroRow}>
                    <PlanMedal plan={plan} size={64} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.heroKicker}>
                        {trial
                          ? 'TESTE GRÁTIS · SEM CARTÃO'
                          : site
                            ? 'ASSINATURA PELO SITE'
                            : 'ASSINATURA ATIVA'}
                      </Text>
                      <Text style={styles.heroPlan}>{PLAN_NAMES[plan]}</Text>
                      <Text
                        style={[text(15, 'Regular', 1.4), { color: '#c9c7c0' }]}
                      >
                        {trial
                          ? `faltam ${left} ${left === 1 ? 'dia' : 'dias'}${end ? ` · até ${dayMonth(end)}` : ''}`
                          : `R$ ${PLAN_PRICES[plan].founder}/mês${end ? ` · renova em ${dayMonth(end)}` : ''}`}
                      </Text>
                    </View>
                  </View>
                  {trial ? (
                    <>
                      <View style={styles.track}>
                        <View
                          style={[styles.fill, { width: `${share * 100}%` }]}
                        />
                      </View>
                      <View style={styles.trackLabels}>
                        <Text style={styles.trackText}>
                          {start
                            ? `COMEÇOU ${dayMonth(start).toUpperCase()}`
                            : ''}
                        </Text>
                        <Text style={styles.trackText}>
                          {end ? dayMonth(end).toUpperCase() : ''}
                        </Text>
                      </View>
                    </>
                  ) : null}
                </View>
              </View>
            )}

            {site && !pastDue ? (
              <OwnerCard>
                <View style={{ paddingVertical: 16, gap: 10 }}>
                  <Text
                    style={[text(17, 'Bold', 1.25), { color: palette.ink }]}
                  >
                    Você assinou pelo site
                  </Text>
                  <Text
                    style={[
                      text(14.5, 'Regular', 1.45),
                      { color: palette.muted }
                    ]}
                  >
                    Trocar de plano, atualizar o cartão, ver as notas e cancelar
                    continuam no painel do bar, no computador.
                  </Text>
                  <View
                    style={[styles.address, { backgroundColor: palette.mark }]}
                  >
                    <Text style={[styles.addressText, { color: palette.ink }]}>
                      onside.sh
                    </Text>
                  </View>
                </View>
              </OwnerCard>
            ) : null}

            {plan === 'elite' && !pastDue ? (
              <>
                <OwnerLabel>O Elite neste mês</OwnerLabel>
                <View style={styles.cells}>
                  <Cell
                    value={proof.data?.people}
                    label="pessoas na lista de quem vai"
                  />
                  <Cell
                    value={proof.data?.codes}
                    label="códigos validados no balcão"
                  />
                  <Cell
                    value={month.data?.classicExposures ?? undefined}
                    label="no topo da busca nos clássicos"
                  />
                </View>
              </>
            ) : (
              <View>
                <HardShadow color="#7f9a12" offset={5} radius={26} />
                <View style={styles.teaser}>
                  <Text style={styles.teaserKicker}>
                    NO ELITE, ESTE MÊS VOCÊ TERIA VISTO
                  </Text>
                  <Text style={styles.teaserTitle}>
                    {`${proof.data?.people ?? 0} ${(proof.data?.people ?? 0) === 1 ? 'pessoa marcou' : 'pessoas marcaram'} presença no seu bar`}
                  </Text>
                  <Text style={[text(15, 'Regular', 1.45), { color: INK }]}>
                    Com o nome de cada uma, jogo a jogo, e o código do balcão
                    com a sua oferta.
                  </Text>
                  {trial ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={change.isPending}
                      onPress={() => change.mutate({ plan: 'elite' })}
                      style={styles.teaserButton}
                    >
                      <Text style={[text(16, 'Bold', 1.2), { color: PAPER }]}>
                        {change.isPending ? 'Trocando…' : 'Testar o Elite'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            )}

            {pastDue ? (
              <>
                <OwnerLabel>Parado até regularizar</OwnerLabel>
                <OwnerCard>
                  {[
                    [
                      'Quem vai, jogo a jogo',
                      `${proof.data?.people ?? 0} ${(proof.data?.people ?? 0) === 1 ? 'pessoa marcou' : 'pessoas marcaram'} este mês`
                    ],
                    [
                      'Oferta da casa e código do balcão',
                      owner.bar?.houseOffer
                        ? `“${owner.bar.houseOffer}” não aparece`
                        : 'não aparece'
                    ],
                    [
                      'Topo da busca nos clássicos',
                      'volta quando o pagamento passar'
                    ]
                  ].map(([title, sub], index) => (
                    <OwnerRow key={title} first={index === 0}>
                      <Icon name="lock" size={18} color={palette.muted} />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            text(16, 'SemiBold', 1.3),
                            { color: palette.ink }
                          ]}
                        >
                          {title}
                        </Text>
                        <Text
                          style={[
                            text(13.5, 'Regular', 1.3),
                            { color: palette.muted }
                          ]}
                        >
                          {sub}
                        </Text>
                      </View>
                    </OwnerRow>
                  ))}
                </OwnerCard>
                <OwnerLabel>Continua funcionando</OwnerLabel>
                <OwnerCard>
                  {[
                    ['Perfil, mapa e contato', 'o torcedor ainda acha o bar'],
                    ['Até 5 jogos por mês', 'o limite do Starter']
                  ].map(([title, sub], index) => (
                    <OwnerRow key={title} first={index === 0}>
                      <Icon name="check" size={18} color={palette.ink} />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            text(16, 'SemiBold', 1.3),
                            { color: palette.ink }
                          ]}
                        >
                          {title}
                        </Text>
                        <Text
                          style={[
                            text(13.5, 'Regular', 1.3),
                            { color: palette.muted }
                          ]}
                        >
                          {sub}
                        </Text>
                      </View>
                    </OwnerRow>
                  ))}
                </OwnerCard>
              </>
            ) : null}

            {trial ? (
              <>
                <OwnerLabel>
                  Testar outro plano · o fim do teste não muda
                </OwnerLabel>
                <OwnerCard>
                  {PLANS.map((id, index) => (
                    <OwnerRow key={id} first={index === 0}>
                      <PlanMedal plan={id} size={38} />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            text(17, 'Bold', 1.25),
                            { color: palette.ink }
                          ]}
                        >
                          {PLAN_NAMES[id]}
                        </Text>
                        <Text
                          style={[
                            text(14, 'Regular', 1.3),
                            { color: palette.muted }
                          ]}
                        >
                          {`R$ ${PLAN_PRICES[id].founder}/mês depois do teste`}
                        </Text>
                      </View>
                      {id === plan ? (
                        <View
                          style={[
                            styles.current,
                            { borderColor: palette.line }
                          ]}
                        >
                          <Text
                            style={[
                              text(13.5, 'SemiBold', 1.2),
                              { color: palette.ink }
                            ]}
                          >
                            Atual
                          </Text>
                        </View>
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Testar o ${PLAN_NAMES[id]}`}
                          disabled={change.isPending}
                          onPress={() => {
                            haptic.select()
                            change.mutate({ plan: id })
                          }}
                          style={[styles.try, { backgroundColor: palette.ink }]}
                        >
                          <Text
                            style={[
                              text(14, 'Bold', 1.2),
                              { color: palette.bg }
                            ]}
                          >
                            Testar
                          </Text>
                        </Pressable>
                      )}
                    </OwnerRow>
                  ))}
                </OwnerCard>
              </>
            ) : null}

            <View style={[styles.note, { backgroundColor: palette.mark }]}>
              <Icon name="shield" size={18} color={palette.muted} />
              <Text
                style={[
                  text(14, 'Regular', 1.45),
                  { color: palette.ink, flex: 1 }
                ]}
              >
                {trial
                  ? 'Trocar o plano do teste não pede cartão, e pode trocar quantas vezes quiser.'
                  : 'Uma assinatura por bar, gerenciada onde foi feita.'}
              </Text>
            </View>
          </>
        )}
      </ScrollView>
      {trial || ended ? (
        <View
          style={[
            styles.foot,
            { paddingBottom: insets.bottom + 10, backgroundColor: palette.bg }
          ]}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              buy(
                ended ? `Assinar o ${PLAN_NAMES[choice]}` : 'Garantir o Elite'
              )
            }
          >
            <HardShadow color="#7f9a12" offset={4} radius={999} />
            <View style={styles.buy}>
              <Text style={[text(17, 'Bold', 1.2), { color: INK }]}>
                {ended
                  ? `Voltar ao ar com o ${PLAN_NAMES[choice]}`
                  : 'Garantir o Elite · R$ 0 hoje'}
              </Text>
            </View>
          </Pressable>
          <Text
            style={[
              text(12.5, 'Regular', 1.4),
              { color: palette.muted, textAlign: 'center' }
            ]}
          >
            {`App Store · R$ ${PLAN_PRICES[ended ? choice : 'elite'].founder}/mês${trial && end ? ` a partir de ${dayMonth(end)}` : ''} · a compra pelo app chega em breve`}
          </Text>
        </View>
      ) : null}
      {soon.toast}
    </View>
  )
}

function Cell({ value, label }: { value: number | undefined; label: string }) {
  const palette = usePalette()
  return (
    <View
      style={{ flex: 1 }}
      accessible
      accessibilityLabel={`${value ?? 'sem dado'} ${label}`}
    >
      <HardShadow color={palette.drop} offset={4} radius={18} />
      <View style={[styles.cell, { backgroundColor: palette.card }]}>
        <Text style={[styles.cellValue, { color: palette.ink }]}>
          {value === undefined ? '—' : String(value)}
        </Text>
        <Text style={[text(13, 'Regular', 1.3), { color: palette.muted }]}>
          {label}
        </Text>
      </View>
    </View>
  )
}

/** Teste vencido (WEB-357): a placa do bar fora do ar e os planos. */
function Ended({
  barName,
  address,
  people,
  trialEnded,
  choice,
  indicated,
  onPick
}: {
  barName: string
  address: string
  people: number
  /** O teste do cadastro acabou; `false` é assinatura que terminou. */
  trialEnded: boolean
  choice: Plan
  indicated: Plan
  onPick: (plan: Plan) => void
}) {
  const palette = usePalette()
  return (
    <>
      <View>
        <HardShadow color="#000" offset={5} radius={28} />
        <View style={styles.hero}>
          <DotField id="fora" radius={28} />
          <Text style={styles.brand}>ONSIDE</Text>
          <Text
            numberOfLines={1}
            style={[styles.heroPlan, { color: '#8a8984' }]}
          >
            {barName}
          </Text>
          <Text
            numberOfLines={1}
            style={[text(14.5, 'Regular', 1.3), { color: '#8a8984' }]}
          >
            {address}
          </Text>
          <View style={styles.stamp}>
            <Text style={styles.stampText}>FORA DO AR</Text>
          </View>
        </View>
      </View>
      <Text
        accessibilityRole="header"
        style={[styles.endedTitle, { color: palette.ink }]}
      >
        {trialEnded ? 'O TESTE ' : 'A ASSINATURA '}
        <Text style={{ color: palette.dark ? ACID : palette.live }}>
          {trialEnded ? 'ACABOU' : 'TERMINOU'}
        </Text>
      </Text>
      <Text style={[text(15.5, 'Regular', 1.45), { color: palette.muted }]}>
        O bar saiu do mapa. Jogos, fotos e avaliações continuam guardados e
        voltam junto com ele.
      </Text>
      <View style={styles.plansRow}>
        {(['starter', 'pro', 'elite'] as Plan[]).map((id) => (
          <Pressable
            key={id}
            accessibilityRole="radio"
            accessibilityState={{ checked: id === choice }}
            accessibilityLabel={`${PLAN_NAMES[id]}, R$ ${PLAN_PRICES[id].founder} por mês${id === indicated ? ', indicado pela sua rotina' : ''}`}
            onPress={() => onPick(id)}
            style={[
              styles.planCard,
              {
                backgroundColor: id === choice ? palette.card : palette.mark,
                borderColor: id === choice ? ACID : 'transparent'
              }
            ]}
          >
            <PlanMedal plan={id} size={34} />
            <Text style={[styles.planName, { color: palette.ink }]}>
              {PLAN_NAMES[id]}
            </Text>
            <Text
              style={[styles.planPrice, { color: palette.ink }]}
            >{`R$ ${PLAN_PRICES[id].founder}`}</Text>
            <Text
              style={[styles.planOld, { color: palette.muted }]}
            >{`R$ ${PLAN_PRICES[id].table}`}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[styles.endedNote, { color: palette.muted }]}>
        {[
          people
            ? `${people} ${people === 1 ? 'PESSOA MARCOU' : 'PESSOAS MARCARAM'} PRESENÇA ESTE MÊS`
            : 'OS DADOS DO BAR CONTINUAM GUARDADOS',
          `${PLAN_NAMES[indicated].toUpperCase()} INDICADO PELA SUA ROTINA`
        ].join(' · ')}
      </Text>
    </>
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
  hero: {
    backgroundColor: INK,
    borderRadius: 28,
    padding: 18,
    gap: 14,
    overflow: 'hidden'
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroKicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    letterSpacing: 1.2,
    color: ACID
  },
  heroPlan: {
    fontFamily: 'Anton',
    fontSize: 40,
    color: PAPER,
    textTransform: 'uppercase',
    marginVertical: -9.7
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(241,238,230,.12)',
    overflow: 'hidden'
  },
  fill: { height: 8, borderRadius: 4, backgroundColor: ACID },
  trackLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  trackText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    color: '#aaa9a4'
  },
  alert: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: 24,
    backgroundColor: INK,
    borderWidth: 2
  },
  address: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  addressText: { fontFamily: 'GeistMono-SemiBold', fontSize: 17 },
  cells: { flexDirection: 'row', gap: 10 },
  cell: { borderRadius: 18, padding: 12, gap: 4, minHeight: 110 },
  cellValue: {
    fontFamily: 'Anton',
    fontSize: 34,
    marginVertical: -8.2,
    marginBottom: 2
  },
  teaser: { backgroundColor: ACID, borderRadius: 26, padding: 18, gap: 10 },
  teaserKicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    letterSpacing: 1.2,
    color: '#3d4a06'
  },
  teaserTitle: {
    fontFamily: 'Anton',
    fontSize: 30,
    color: INK,
    textTransform: 'uppercase',
    marginVertical: -4
  },
  teaserButton: {
    alignSelf: 'flex-end',
    height: 46,
    paddingHorizontal: 18,
    borderRadius: 23,
    backgroundColor: INK,
    justifyContent: 'center'
  },
  current: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    justifyContent: 'center'
  },
  try: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    justifyContent: 'center'
  },
  note: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 18 },
  foot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8
  },
  buy: {
    height: 58,
    borderRadius: 999,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  },
  brand: { fontFamily: 'Anton', fontSize: 20, color: '#8a8984' },
  stamp: {
    position: 'absolute',
    right: 18,
    top: 40,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 2.5,
    borderColor: PAPER,
    transform: [{ rotate: '-8deg' }]
  },
  stampText: { fontFamily: 'Anton', fontSize: 22, color: PAPER },
  endedTitle: { fontFamily: 'Anton', fontSize: 40, marginVertical: -8 },
  plansRow: { flexDirection: 'row', gap: 8 },
  planCard: {
    flex: 1,
    borderRadius: 20,
    padding: 12,
    gap: 4,
    borderWidth: 2.5
  },
  planName: {
    fontFamily: 'Anton',
    fontSize: 24,
    textTransform: 'uppercase',
    marginVertical: -4
  },
  planPrice: { fontFamily: 'GeistMono-SemiBold', fontSize: 14 },
  planOld: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    textDecorationLine: 'line-through'
  },
  endedNote: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    letterSpacing: 1,
    textAlign: 'center'
  }
})
