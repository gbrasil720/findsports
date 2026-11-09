import type {
  LegalBlock,
  LegalDocument,
  LegalInline,
  LegalRich
} from '@findsports_oficial/legal/legal-types'
import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react'
import { startNavTone } from '@/components/landing/v3/effects'
import { Arrow } from '@/components/landing/v3/icons'
import { SiteFooter, SiteNav } from '@/components/landing/v3/site-chrome'

const CONTACT_EMAIL = 'contato@onside.sh'

/**
 * Trechos do texto longo do site: os dos documentos legais e, no guia, link
 * para outra página do site.
 */
export type PageInline = LegalInline | { link: string; to: string }
type PageRich = LegalRich<PageInline>
export type PageDocument = LegalDocument<PageInline, string>

function Inline({ part }: { part: PageInline }) {
  if (typeof part === 'string') return part
  if ('b' in part) return <strong>{part.b}</strong>
  if ('link' in part) {
    return (
      <a className="lg-link" href={part.to}>
        {part.link}
      </a>
    )
  }
  if ('email' in part) {
    return (
      <a className="lg-link" href={`mailto:${part.email}`}>
        {part.email}
      </a>
    )
  }
  return <span className="lg-link">{part.mark}</span>
}

function Rich({ content }: { content: PageRich }) {
  if (typeof content === 'string') return content
  return content.map((part, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: texto estático, nunca reordenado
    <Fragment key={index}>
      <Inline part={part} />
    </Fragment>
  ))
}

function Block({ block }: { block: LegalBlock<PageInline> }) {
  switch (block.type) {
    case 'h3':
      return (
        <h3 className="lg-h3">
          {block.num ? <span aria-hidden="true">{block.num}</span> : null}
          {block.text}
        </h3>
      )
    case 'p':
      return (
        <p className="lg-p">
          <Rich content={block.content} />
        </p>
      )
    case 'ul':
      return (
        <ul className="lg-list">
          {block.items.map((item, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: texto estático, nunca reordenado
            <li key={index}>
              <span>
                <Rich content={item} />
              </span>
            </li>
          ))}
        </ul>
      )
    case 'attention':
      return (
        <div className="lg-attention">
          <p className="lg-attention-label">
            <span className="lg-leds" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            {block.label}
          </p>
          <p>
            <Rich content={block.content} />
          </p>
        </div>
      )
    case 'table': {
      const total = block.columnWeights?.reduce((sum, w) => sum + w, 0)
      return (
        <div className="lg-table">
          <table>
            {block.columnWeights && total ? (
              <colgroup>
                {block.columnWeights.map((weight, index) => (
                  <col
                    // biome-ignore lint/suspicious/noArrayIndexKey: colunas fixas
                    key={index}
                    style={{ width: `${(weight / total) * 100}%` }}
                  />
                ))}
              </colgroup>
            ) : null}
            <thead>
              <tr>
                {block.head.map((cell) => (
                  <th key={cell} scope="col">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: texto estático, nunca reordenado
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: colunas fixas
                    <td key={cellIndex}>
                      <Rich content={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
  }
}

/**
 * Índice que acompanha a leitura: a seção ativa é a que cruza a linha a 45%
 * da altura da janela, e a barra enche conforme essa linha percorre o texto.
 */
function useReadingProgress(firstSectionId: string | undefined) {
  const [activeId, setActiveId] = useState(firstSectionId)
  const contentRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const content = contentRef.current
    if (!content) return

    const spy = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id)
        }
      },
      { rootMargin: '-45% 0px -55% 0px' }
    )
    const sections = content.querySelectorAll('section[id]')
    for (const section of sections) spy.observe(section)

    const onScroll = () => {
      const box = content.getBoundingClientRect()
      const line = window.innerHeight * 0.45
      const done = Math.min(1, Math.max(0, (line - box.top) / box.height))
      if (progressRef.current) {
        progressRef.current.style.width = `${(done * 100).toFixed(2)}%`
      }
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    // Entrada das seções. Só esconde o que ainda está abaixo da dobra, e só
    // depois de o JavaScript estar de pé: sem ele, o texto fica visível.
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let reveal: IntersectionObserver | undefined
    if (!reduce) {
      reveal = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue
            entry.target.setAttribute('data-reveal', 'in')
            reveal?.unobserve(entry.target)
          }
        },
        { rootMargin: '0px 0px -12% 0px' }
      )
      for (const section of sections) {
        if (section.getBoundingClientRect().top < window.innerHeight * 0.88) {
          continue
        }
        section.setAttribute('data-reveal', 'pending')
        reveal.observe(section)
      }
    }

    return () => {
      spy.disconnect()
      reveal?.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return { activeId, contentRef, progressRef }
}

/** Fecho da página: por padrão, o contato; no guia, o convite para a conta. */
export type PageClosing = {
  kicker: string
  title: string
  href: string
  label: ReactNode
}

const CONTACT_CLOSING: PageClosing = {
  kicker: 'Ficou alguma dúvida?',
  title: 'A gente responde em até 15 dias.',
  href: `mailto:${CONTACT_EMAIL}`,
  label: CONTACT_EMAIL
}

/**
 * Texto longo no visual das páginas legais: termos, privacidade e os artigos
 * do guia. É o redesign da landing (WEB-501; design no artifact
 * E5cnrZGSh5V2DDHnYVTjzX): cabeçalho e rodapé dela, topo no telão, índice
 * com a leitura e o texto em colunas de leitura. CSS em `legal-v3.css`.
 */
export function LegalPage({
  document: doc,
  closing = CONTACT_CLOSING,
  current
}: {
  document: PageDocument
  closing?: PageClosing
  current?: '/termos' | '/privacidade'
}) {
  const { activeId, contentRef, progressRef } = useReadingProgress(
    doc.sections[0]?.id
  )
  const rootRef = useRef<HTMLDivElement>(null)
  const [indexOpen, setIndexOpen] = useState(false)
  const activeIndex = Math.max(
    0,
    doc.sections.findIndex((section) => section.id === activeId)
  )
  const active = doc.sections[activeIndex]
  const total = String(doc.sections.length).padStart(2, '0')
  const position = String(activeIndex + 1).padStart(2, '0')

  useEffect(() => {
    const root = rootRef.current
    if (root) return startNavTone(root)
  }, [])

  return (
    <div className="lp3 lg" ref={rootRef}>
      <a className="lg-skip" href="#main">
        Pular para o conteúdo
      </a>

      <SiteNav home="/" />

      <main id="main">
        <section className="lg-hero" id="top" data-ink>
          <div className="wrap lg-hero-grid">
            <div>
              <p className="kick">{doc.kicker}</p>
              <h1 className="disp">
                {doc.title}
                <span aria-hidden="true">.</span>
              </h1>
              <div className="lg-intro">
                {doc.intro.map((paragraph, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: texto estático, nunca reordenado
                  <p key={index}>
                    <Rich content={paragraph} />
                  </p>
                ))}
              </div>
            </div>

            <div className="lg-side">
              <dl className="lg-meta">
                <div>
                  <dt>Última atualização</dt>
                  <dd>{doc.updated}</dd>
                </div>
                <div>
                  <dt>Leitura</dt>
                  <dd>{doc.reading}</dd>
                </div>
                <div>
                  <dt>Contato</dt>
                  <dd>
                    <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
                  </dd>
                </div>
              </dl>

              <a className="lg-other" href={doc.other.to}>
                <span>
                  <span>Leia também</span>
                  <b>{doc.other.label}</b>
                  <span>{doc.other.blurb}</span>
                </span>
                <Arrow size={22} />
              </a>
            </div>
          </div>
        </section>

        {doc.company.length > 0 ? (
          <div className="lg-company" data-ink>
            <div className="wrap">
              {doc.company.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="wrap lg-body">
          <aside className="lg-index" data-open={indexOpen || undefined}>
            <button
              className="lg-index-toggle"
              type="button"
              aria-expanded={indexOpen}
              aria-controls="lg-sections"
              onClick={() => setIndexOpen((open) => !open)}
            >
              <span className="n">{active?.num}</span>
              <span className="t">{active?.title}</span>
              <span className="c">
                Índice · {position}/{total}
              </span>
            </button>
            <p className="lg-index-head">
              <span>Índice</span>
              <span>
                {position} de {total}
              </span>
            </p>
            <div className="lg-progress" aria-hidden="true">
              <span ref={progressRef} />
            </div>
            <nav id="lg-sections" aria-label="Seções">
              {doc.sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  aria-current={activeId === section.id ? 'true' : undefined}
                  onClick={() => setIndexOpen(false)}
                >
                  <span>{section.num}</span>
                  <span>{section.title}</span>
                </a>
              ))}
            </nav>
          </aside>

          <div ref={contentRef} className="lg-content">
            {doc.sections.map((section) => (
              <section key={section.id} id={section.id}>
                <div className="lg-section-head">
                  <span aria-hidden="true">{section.num}</span>
                  <h2>{section.title}</h2>
                </div>
                <div className="lg-section-body">
                  {section.blocks.map((block, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: texto estático, nunca reordenado
                    <Block key={index} block={block} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <section className="lg-closing" data-ink>
          <div className="wrap">
            <div>
              <p className="kick">{closing.kicker}</p>
              <h2 className="disp">{closing.title}</h2>
            </div>
            <a className="btn btn-acid" href={closing.href}>
              {closing.label}
              <Arrow />
            </a>
          </div>
        </section>
      </main>

      <SiteFooter home="/" current={current} />
    </div>
  )
}
