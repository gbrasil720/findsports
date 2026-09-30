import AlertCircle from 'reicon-react/icons/AlertCircle'

export function QueryError({
  message,
  onRetry,
  retryable
}: {
  message: string
  onRetry: () => void
  retryable: boolean
}) {
  return (
    <div className="onside-callout onside-callout-danger" role="alert">
      <AlertCircle
        size={20}
        color="currentColor"
        className="mt-0.5 shrink-0"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 font-semibold text-sm">{message}</p>
        <p className="text-sm opacity-90">
          {retryable
            ? 'Tente novamente. Se o problema continuar, volte mais tarde.'
            : 'Verifique o acesso à sua conta ou volte mais tarde.'}
        </p>
      </div>
      {retryable ? (
        <button
          type="button"
          onClick={onRetry}
          className="onside-btn onside-btn-ink shrink-0 min-h-11 px-4 text-xs"
        >
          Tentar de novo
        </button>
      ) : null}
    </div>
  )
}
