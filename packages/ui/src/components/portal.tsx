'use client'

import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext
} from 'react'

export type PortalContainer =
  | HTMLElement
  | ShadowRoot
  | null
  | RefObject<HTMLElement | ShadowRoot | null>
  | undefined

const PortalContainerContext = createContext<PortalContainer>(undefined)

export function PortalProvider({
  container,
  children
}: {
  container: PortalContainer
  children: ReactNode
}) {
  return (
    <PortalContainerContext.Provider value={container}>
      {children}
    </PortalContainerContext.Provider>
  )
}

export function usePortalContainer() {
  return useContext(PortalContainerContext)
}
