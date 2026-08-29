import type { ReactNode } from 'react'

type Props = {
  header: ReactNode
  children: ReactNode
  rootClassName?: string
  headerInnerClassName?: string
}

export function ProductFrame({
  header,
  children,
  rootClassName = 'onside-app',
  headerInnerClassName = 'onside-app-shell onside-app-header-inner'
}: Props) {
  return (
    <div className={rootClassName}>
      <a className="onside-skip-link" href="#main-content">
        Ir para o conteúdo
      </a>
      <header className="onside-app-header">
        <div className={headerInnerClassName}>{header}</div>
      </header>
      <main id="main-content" className="onside-app-shell onside-app-main">
        {children}
      </main>
    </div>
  )
}
