'use client'

import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion'
import { cn } from '@findsports_oficial/ui/lib/utils'
import ChevronDown from 'reicon-react/icons/ChevronDown'

function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={cn('flex w-full flex-col', className)}
      {...props}
    />
  )
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn('not-last:border-b', className)}
      {...props}
    />
  )
}

/**
 * O `headingLevel` existe porque o cabeçalho do Base UI é um `h3` fixo, e um
 * accordion dentro de um cartão que já tem `h3` de título precisa descer um
 * nível para não achatar a hierarquia da página.
 *
 * Um único chevron que gira, em vez de dois ícones que se alternam: o registry
 * usa `ChevronDown` + `ChevronUp` escondendo um dos dois, o que troca o glifo
 * de golpe no meio da transição do painel.
 */
function AccordionTrigger({
  className,
  children,
  headingLevel = 3,
  headerClassName,
  ...props
}: AccordionPrimitive.Trigger.Props & {
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6
  headerClassName?: string
}) {
  const Heading = `h${headingLevel}` as const

  return (
    <AccordionPrimitive.Header
      render={<Heading />}
      className={cn('flex', headerClassName)}
    >
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          'group/accordion-trigger relative flex flex-1 items-start justify-between rounded-none border border-transparent py-2.5 text-left font-medium text-xs outline-none transition-colors hover:underline focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
          className
        )}
        {...props}
      >
        {children}
        <ChevronDown
          size={16}
          color="currentColor"
          data-slot="accordion-trigger-icon"
          aria-hidden="true"
          className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-aria-expanded/accordion-trigger:rotate-180"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

/**
 * A altura anima pela variável do próprio Base UI (`--accordion-panel-height`)
 * com `transition`, não pelos utilitários `animate-accordion-*`: aqueles leem
 * `--radix-accordion-content-height`, que não existe aqui, e caem em `auto` —
 * altura que o CSS não interpola, então o painel abria em salto.
 */
function AccordionContent({
  className,
  children,
  ...props
}: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className="h-(--accordion-panel-height) overflow-hidden text-xs transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none"
      {...props}
    >
      <div
        className={cn(
          'pt-0 pb-2.5 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4',
          className
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Panel>
  )
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger }
