import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { HardShadow, initials, type Palette } from '@/components/explore'
import { haptic } from '@/components/motion'
import { ACID, HOT, Icon, INK, LIVE, PAPER, text } from '@/components/ui'
import { trpc } from '@/lib/trpc'

/*
 * Peças dos amigos (S1 do design: 11a–11d). As regras moram no servidor
 * (`packages/api/src/routers/friends.ts`).
 */

export type Relation = 'self' | 'friends' | 'sent' | 'received' | 'none'
export type Via = 'search' | 'code' | 'link' | 'contacts' | 'suggestion'

// As cores do quadrinho com iniciais, como as pessoas do design: algumas em
// acid, algumas em vermelho, a maioria em pedra. Sempre a mesma para a mesma
// pessoa.
const TONES = ['acid', 'stone', 'live', 'stone', 'stone'] as const
const toneOf = (id: string) =>
  TONES[[...id].reduce((sum, c) => sum + c.charCodeAt(0), 0) % TONES.length]

/** O quadrinho com as iniciais (`ava` do design). */
export function Avatar({
  id,
  name,
  size,
  palette,
  me
}: {
  id: string
  name: string
  size: number
  palette: Palette
  /** Você: tinta com acid em Anton, como no design. */
  me?: boolean
}) {
  const tone = me ? 'me' : toneOf(id)
  const bg =
    tone === 'me'
      ? palette.dark
        ? palette.card
        : INK
      : tone === 'acid'
        ? ACID
        : tone === 'live'
          ? LIVE
          : palette.dark
            ? '#34342e'
            : '#e7e3db'
  const fg =
    tone === 'me'
      ? ACID
      : tone === 'acid'
        ? INK
        : tone === 'live'
          ? PAPER
          : palette.ink
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size > 50 ? 9 : 8,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Text
        style={
          me
            ? { fontFamily: 'Anton', fontSize: size * 0.4, color: fg }
            : [text(Math.round(size * 0.34), 'Bold', 1.1), { color: fg }]
        }
      >
        {initials(name)}
      </Text>
    </View>
  )
}

/**
 * O botão da relação (`addBtn` do design): "Adicionar", "Pedido enviado" ou
 * "Amigos". Pedido recebido vira "Aceitar".
 */
export function AddButton({
  relation,
  palette,
  busy,
  onPress
}: {
  relation: Relation
  palette: Palette
  busy?: boolean
  onPress: () => void
}) {
  if (relation === 'self') return null
  if (relation === 'friends')
    return (
      <View style={styles.friends}>
        <Icon
          name="check"
          size={14}
          color={palette.dark ? ACID : '#4d7a00'}
          accent={palette.dark ? ACID : '#4d7a00'}
        />
        <Text
          style={[text(13, 'Bold'), { color: palette.dark ? ACID : '#4d7a00' }]}
        >
          Amigos
        </Text>
      </View>
    )
  if (relation === 'sent')
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Cancela o pedido"
        disabled={busy}
        onPress={onPress}
        style={[
          styles.sent,
          {
            borderColor: palette.dark ? 'rgba(241,238,230,.22)' : palette.line
          }
        ]}
      >
        <Text style={[text(13, 'Bold'), { color: palette.muted }]}>
          Pedido enviado
        </Text>
      </Pressable>
    )
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [pressed && { transform: [{ scale: 0.97 }] }]}
    >
      <HardShadow color={palette.dark ? '#000' : INK} offset={3} />
      <View style={[styles.add, busy && { opacity: 0.6 }]}>
        <Icon name="userplus" size={15} color={INK} accent={INK} />
        <Text style={[text(13, 'Bold'), { color: INK }]}>
          {relation === 'received' ? 'Aceitar' : 'Adicionar'}
        </Text>
      </View>
    </Pressable>
  )
}

/** Uma pessoa numa lista: quadrinho, nome, linha de baixo e o que vai à direita. */
export function PersonRow({
  id,
  name,
  sub,
  palette,
  first,
  size = 40,
  right,
  highlight,
  onPress
}: {
  id: string
  name: string
  sub: string | null
  /** O trecho digitado na busca, em destaque no nome (11b). */
  highlight?: string
  palette: Palette
  first?: boolean
  size?: number
  right?: ReactNode
  onPress?: () => void
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !first && { borderTopWidth: 1, borderTopColor: palette.line },
        pressed && { opacity: 0.7 }
      ]}
    >
      <Avatar id={id} name={name} size={size} palette={palette} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[text(14.5, 'Bold', 1.25), { color: palette.ink }]}
          numberOfLines={1}
        >
          <Marked name={name} part={highlight} />
        </Text>
        {sub ? (
          <Text
            style={[text(12, 'Regular', 1.3), { color: palette.muted }]}
            numberOfLines={1}
          >
            {sub}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  )
}

/** O nome com `part` em destaque, sem olhar caixa nem acento. */
function Marked({ name, part }: { name: string; part?: string }) {
  const fold = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
  const at = part ? fold(name).indexOf(fold(part)) : -1
  if (!part || at < 0) return name
  return (
    <>
      {name.slice(0, at)}
      <Text style={{ color: HOT }}>{name.slice(at, at + part.length)}</Text>
      {name.slice(at + part.length)}
    </>
  )
}

/** "@marinac · Pinheiros", "2 amigos em comum": o que der. */
export function personLine(person: {
  username: string | null
  city: string | null
  mutual?: number
}) {
  return [
    person.username ? `@${person.username}` : null,
    person.mutual
      ? `${person.mutual} ${person.mutual === 1 ? 'amigo' : 'amigos'} em comum`
      : person.city
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Pedir, aceitar, recusar e desfazer, com as listas atualizadas depois. O
 * erro do servidor (quem não recebe pedidos) vai num alerta.
 */
export function useFriendActions() {
  const queryClient = useQueryClient()
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: trpc.friends.pathKey() })
  const onError = (error: { message: string }) => {
    haptic.error()
    Alert.alert('Não deu certo', error.message)
  }
  const request = useMutation(
    trpc.friends.request.mutationOptions({
      onSuccess: () => {
        haptic.success()
        refresh()
      },
      onError
    })
  )
  const respond = useMutation(
    trpc.friends.respond.mutationOptions({
      onSuccess: (_, input) => {
        if (input.accept) haptic.success()
        else haptic.select()
        refresh()
      },
      onError
    })
  )
  const remove = useMutation(
    trpc.friends.remove.mutationOptions({
      onSuccess: () => {
        haptic.select()
        refresh()
      },
      onError
    })
  )
  /**
   * O toque no botão de relação, para cada estado. `onDone` recebe a relação
   * nova, para a lista que não vem de consulta (contatos).
   */
  const act = (
    userId: string,
    relation: Relation,
    via: Via,
    onDone?: (next: Relation) => void
  ) => {
    const done = {
      onSuccess: (r: { relation: Relation }) => onDone?.(r.relation)
    }
    if (relation === 'none') request.mutate({ userId, via }, done)
    else if (relation === 'received')
      respond.mutate({ userId, accept: true }, done)
    else if (relation === 'sent') remove.mutate({ userId }, done)
  }
  return {
    request,
    respond,
    remove,
    act,
    busy: request.isPending || respond.isPending || remove.isPending
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11
  },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: ACID
  },
  sent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1
  },
  friends: { flexDirection: 'row', alignItems: 'center', gap: 5 }
})
