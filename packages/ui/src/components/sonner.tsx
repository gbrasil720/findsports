'use client'

import AlertTriangle from 'reicon-react/icons/AlertTriangle'
import Check from 'reicon-react/icons/Check'
import CircleInfo from 'reicon-react/icons/CircleInfo'
import Loader from 'reicon-react/icons/Loader'
import Xmark from 'reicon-react/icons/Xmark'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

const Toaster = ({ theme = 'light', ...props }: ToasterProps) => {
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <Check size={16} color="currentColor" className="size-4" />,
        info: <CircleInfo size={16} color="currentColor" className="size-4" />,
        warning: (
          <AlertTriangle size={16} color="currentColor" className="size-4" />
        ),
        error: <Xmark size={16} color="currentColor" className="size-4" />,
        loading: (
          <Loader
            size={16}
            color="currentColor"
            className="size-4 animate-spin"
          />
        )
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)'
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'cn-toast'
        }
      }}
      {...props}
    />
  )
}

export { Toaster }
