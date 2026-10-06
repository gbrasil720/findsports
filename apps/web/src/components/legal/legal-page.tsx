import { Link } from '@tanstack/react-router'
import { Fragment, useEffect, useRef, useState } from 'react'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import { OnsideFooter, OnsideHeader } from '@/components/landing/onside-landing'
import type {
  LegalBlock,
  LegalDocument,
  LegalInline,
  LegalRich
} from './legal-types'

const CONTACT_EMAIL = 'contato@onside.sh'
const HERO_ID = 'top'

function Inline({ part }: { part: LegalInline }) {
  if (typeof part === 'string') return part
  if ('b' in part) return <strong>{part.b}</strong>
  if ('email' in part) {
    return (
      <a className="onside-legal-link" href={`mailto:${part.email}`}>
        {part.email}
      </a>
    )
  }
  return <span className="onside-legal-link">{part.mark}</span>
}

function Rich({ content }: { content: LegalRich }) {
  if (typeof content === 'string') return content
  return content.map((part, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: texto estático, nunca reordenado
    <Fragment key={index}>
      <Inline part={part} />
    </Fragment>
  ))
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.type) {
    case 'h3':
      return (
        <h3 className="onside-legal-h3">
          {block.num ? <span aria-hidden="true">{block.num}</span> : null}
          {block.text}
        </h3>
      )
    case 'p':
      return (
        <p className="onside-legal-p">
          <Rich content={block.content} />
        </p>
      )
    case 'ul':
      return (
        <ul className="onside-legal-list">
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
        <div className="onside-legal-attention">
          <p>{block.label}</p>
          <p>
            <Rich content={block.content} />
          </p>
        </div>
      )
    case 'table': {
      const total = block.columnWeights?.reduce((sum, w) => sum + w, 0)
      return (
        <div className="onside-legal-table">
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
        progressRef.current.style.height = `${(done * 100).toFixed(2)}%`
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

export function LegalPage({ document: doc }: { document: LegalDocument }) {
  const { activeId, contentRef, progressRef } = useReadingProgress(
    doc.sections[0]?.id
  )

  return (
    <div className="onside-page onside-legal">
      <a className="onside-skip-link" href="#main">
        Pular para o conteúdo
      </a>

      <OnsideHeader home="/" inkHeroId={HERO_ID} />

      <main id="main">
        <section className="onside-legal-hero" id={HERO_ID}>
          <div className="onside-shell onside-legal-hero-grid">
            <div>
              <p className="onside-legal-kicker">
                <span aria-hidden="true" />
                {doc.kicker}
              </p>
              <h1>
                {doc.title}
                <span aria-hidden="true">.</span>
              </h1>
              <div className="onside-legal-intro">
                {doc.intro.map((paragraph, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: texto estático, nunca reordenado
                  <p key={index}>
                    <Rich content={paragraph} />
                  </p>
                ))}
              </div>
            </div>

            <div className="onside-legal-side">
              <dl className="onside-legal-meta">
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

              <Link className="onside-legal-other" to={doc.other.to}>
                <span>
                  <span>Leia também</span>
                  <b>{doc.other.label}</b>
                  <span>{doc.other.blurb}</span>
                </span>
                <ArrowRight size={16} aria-hidden="true" focusable="false" />
              </Link>
            </div>
          </div>
        </section>

        <div className="onside-legal-company">
          <div className="onside-shell">
            {doc.company.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>

        <div className="onside-shell onside-legal-body">
          <aside>
            <p>Índice</p>
            <nav aria-label="Seções">
              <span ref={progressRef} aria-hidden="true" />
              {doc.sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  aria-current={activeId === section.id ? 'true' : undefined}
                >
                  <span>{section.num}</span>
                  <span>{section.title}</span>
                </a>
              ))}
            </nav>
          </aside>

          <div ref={contentRef} className="onside-legal-content">
            {doc.sections.map((section) => (
              <section key={section.id} id={section.id}>
                <div className="onside-legal-section-head">
                  <span aria-hidden="true">{section.num}</span>
                  <h2>{section.title}</h2>
                </div>
                <div className="onside-legal-section-body">
                  {section.blocks.map((block, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: texto estático, nunca reordenado
                    <Block key={index} block={block} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <section className="onside-legal-contact">
          <div className="onside-shell">
            <div>
              <p>Ficou alguma dúvida?</p>
              <h2>A gente responde em até 15 dias.</h2>
            </div>
            <a href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
              <ArrowRight size={16} aria-hidden="true" focusable="false" />
            </a>
          </div>
        </section>
      </main>

      <OnsideFooter home="/" />
    </div>
  )
}
