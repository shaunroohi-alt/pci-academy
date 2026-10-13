export function FormError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
      {message}
    </div>
  )
}
