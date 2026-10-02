import { readFile } from 'node:fs/promises'
import { expect } from '@playwright/test'
import { OUTBOX_FILE } from '../env'

export type OutboxEmail = {
  to: string
  subject: string
  text: string
  html: string
  sentAt: string
  /** Primeiro link do corpo em texto: o botão de ação de todos os templates. */
  link: string
}

async function readOutbox(): Promise<OutboxEmail[]> {
  const raw = await readFile(OUTBOX_FILE, 'utf8').catch(() => '')
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const email = JSON.parse(line) as Omit<OutboxEmail, 'link'>
      return { ...email, link: email.text.match(/https?:\/\/\S+/)?.[0] ?? '' }
    })
}

/**
 * Último e-mail para `to`, esperando ele chegar (o envio pode sair depois da
 * resposta). `subject` filtra quando o mesmo endereço recebe mais de um tipo.
 * Use um e-mail único por teste e não haverá mistura entre testes paralelos.
 */
export async function lastEmailTo(
  to: string,
  {
    subject,
    timeout = 10_000
  }: { subject?: string | RegExp; timeout?: number } = {}
): Promise<OutboxEmail> {
  let found: OutboxEmail | undefined
  await expect
    .poll(
      async () => {
        found = (await readOutbox())
          .filter(
            (email) =>
              email.to === to &&
              (subject === undefined ||
                (typeof subject === 'string'
                  ? email.subject === subject
                  : subject.test(email.subject)))
          )
          .at(-1)
        return found
      },
      { message: `e-mail para ${to} no outbox`, timeout }
    )
    .toBeDefined()
  return found as OutboxEmail
}
