import { useEffect, useRef, type ReactNode } from 'react'
import { IconClose } from './Icons'

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  className = '',
  hideClose,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  wide?: boolean
  className?: string
  hideClose?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>('input, button, select, textarea, a[href]')?.focus(), 30)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey, true)
      prev?.focus?.()
    }
  }, [open])
  if (!open) return null
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal glass ${wide ? 'wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        {(title || !hideClose) && (
          <div className="modal-head">
            {title && <h2 className="modal-title">{title}</h2>}
            {!hideClose && (
              <button className="icon-btn" onClick={onClose} aria-label="Close">
                <IconClose />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
