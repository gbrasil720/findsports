import Add from 'reicon-react/icons/Add'

import { FAQ_ITEMS } from './onside-landing-content'

/**
 * Lista da seção "Dúvidas". O JSON-LD `FAQPage` da home sai do mesmo
 * `FAQ_ITEMS` (`lib/structured-data.ts`), e `seo.test.ts` confere que o texto
 * renderizado aqui e o do JSON-LD são idênticos.
 */
export function OnsideFaqList() {
  return (
    <div className="onside-faq-list" data-motion="reveal">
      {FAQ_ITEMS.map((item, index) => (
        <details key={item.id} open={index === 0 || undefined}>
          <summary>
            {item.question}
            <span className="onside-faq-icon" aria-hidden="true">
              <Add size={18} aria-hidden="true" focusable="false" />
            </span>
          </summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </div>
  )
}
