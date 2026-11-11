/**
 * Pedido de confirmação no lugar, com o que muda escrito por extenso. Dos
 * interruptores do Houdini: a IA e a manutenção do app.
 */
export function Confirm({
  text,
  confirmLabel,
  busy,
  onConfirm,
  onCancel
}: {
  text: string
  confirmLabel: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="hd-alert" role="alertdialog" aria-label={confirmLabel}>
      <p style={{ margin: 0, fontSize: 13 }}>{text}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="hd-btn hd-btn-primary"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? 'Gravando…' : confirmLabel}
        </button>
        <button type="button" className="hd-btn" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
