import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Configuração da aplicação em tempo de execução (ESC-19).
 *
 * Existe para que decisões operacionais — desligar um caminho de código que
 * regrediu, afrouxar um limite durante um pico, liberar cobrança — deixem de
 * exigir deploy. Antes disso, cada uma dessas alavancas era constante de
 * módulo: mudar significava editar código, esperar build e torcer, no exato
 * momento em que ninguém quer editar código.
 *
 * A tabela é intencionalmente burra: uma chave, um valor JSON, quem mexeu por
 * último. Toda a semântica — qual chave existe, que formato aceita e qual é o
 * padrão seguro — vive no registro tipado em
 * `@findsports_oficial/api/lib/app-config/registry`, não aqui. O banco é
 * armazenamento; o código é a fonte da verdade sobre o que é válido.
 *
 * Linha ausente não é erro: significa "usa o padrão". Isso é o que garante
 * que uma base recém-criada, ou uma leitura que falhou, se comporte como a
 * versão sem configuração nenhuma.
 *
 * Nada aqui pode conter dado de pessoa: o valor é lido por instância, ficam
 * em cache compartilhado e chegam ao cliente quando marcados como públicos.
 */
export const appConfig = pgTable('app_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  /**
   * Id do usuário que gravou. Texto solto de propósito: sem chave estrangeira
   * para `user`, porque apagar um administrador não pode apagar — nem travar
   * — a configuração que ele deixou ligada.
   */
  updatedBy: text('updated_by')
})
