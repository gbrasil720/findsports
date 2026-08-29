'use client'

import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import { cn } from '@findsports_oficial/ui/lib/utils'

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverPortal({ ...props }: PopoverPrimitive.Portal.Props) {
  return <PopoverPrimitive.Portal data-slot="popover-portal" {...props} />
}

function PopoverPositioner({
  sideOffset = 8,
  ...props
}: PopoverPrimitive.Positioner.Props) {
  return (
    <PopoverPrimitive.Positioner
      data-slot="popover-positioner"
      sideOffset={sideOffset}
      {...props}
    />
  )
}

function PopoverContent({
  className,
  children,
  side = 'top',
  align = 'center',
  sideOffset = 8,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, 'side' | 'align' | 'sideOffset'>) {
  return (
    <PopoverPortal>
      <PopoverPositioner side={side} align={align} sideOffset={sideOffset}>
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            'z-50 w-72 max-w-[calc(100vw-2rem)] bg-white p-4 text-sm shadow-lg outline-none',
            'data-open:animate-in data-closed:animate-out data-open:fade-in-0 data-closed:fade-out-0 duration-150',
            className
          )}
          {...props}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPositioner>
    </PopoverPortal>
  )
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn('font-heading font-bold', className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn('text-sm', className)}
      {...props}
    />
  )
}

function PopoverClose({ ...props }: PopoverPrimitive.Close.Props) {
  return <PopoverPrimitive.Close data-slot="popover-close" {...props} />
}

export {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverPortal,
  PopoverPositioner,
  PopoverTitle,
  PopoverTrigger
}
