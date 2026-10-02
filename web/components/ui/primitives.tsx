import * as React from 'react'
import { Diamond } from '@/components/brand/glyphs'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-[4px] border border-line bg-raised', className)} {...props} />
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 sm:p-6', className)} {...props} />
}

export function Badge({ className, tone = 'neutral', ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: 'neutral' | 'accent' | 'danger' | 'solid' }) {
  const tones = {
    neutral: 'border-line-strong text-ink-2',
    accent: 'border-accent text-accent',
    danger: 'border-danger text-danger',
    solid: 'border-ink bg-ink text-bg',
  }
  return <span className={cn('inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-px text-[11px] font-medium tracking-wide', tones[tone], className)} {...props} />
}

export function Eyebrow({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('eyebrow', className)} {...props} />
}

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          {eyebrow ? (
            <Eyebrow className="mb-3 flex items-center gap-2">
              <Diamond /> {eyebrow}
            </Eyebrow>
          ) : null}
          <h1 className="display text-[40px] sm:text-[52px]">{title}</h1>
          {children ? <div className="mt-3 text-[15px] text-ink-2">{children}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="mt-6 flex items-center gap-2 text-brass" aria-hidden>
        <span className="h-1.5 w-1.5 rounded-full bg-brass" />
        <span className="h-px w-24 bg-brass/70" />
        <span className="h-px flex-1 bg-line" />
      </div>
    </header>
  )
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-[12px] font-medium text-ink-2', className)} {...props} />
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn('h-10 w-full rounded-[3px] border border-line-strong bg-raised px-3 text-[14px] text-ink placeholder:text-muted focus-visible:border-accent', className)} {...props} />
))
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn('min-h-32 w-full resize-y rounded-[3px] border border-line-strong bg-raised px-3 py-2.5 text-ink placeholder:text-muted focus-visible:border-accent', className)} {...props} />
))
Textarea.displayName = 'Textarea'

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn('h-10 w-full rounded-[3px] border border-line-strong bg-raised px-2.5 text-[14px] text-ink', className)} {...props} />
))
Select.displayName = 'Select'

export function Switch({ checked, onChange, label, description, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: React.ReactNode; id: string }) {
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <div>
        <label htmlFor={id} className="text-[14px] font-medium text-ink">
          {label}
        </label>
        {description ? <div className="mt-0.5 text-[13px] text-muted">{description}</div> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors', checked ? 'border-accent bg-accent' : 'border-line-strong bg-surface-2')}
      >
        <span className={cn('absolute left-0 top-0.5 h-4 w-4 rounded-full transition-transform', checked ? 'translate-x-[22px] bg-bg' : 'translate-x-0.5 bg-muted')} />
      </button>
    </div>
  )
}

export function Notice({ tone = 'neutral', title, children, className }: { tone?: 'neutral' | 'accent' | 'danger'; title?: string; children: React.ReactNode; className?: string }) {
  const tones = { neutral: 'border-line-strong', accent: 'border-accent', danger: 'border-danger' }
  return (
    <div role={tone === 'danger' ? 'alert' : undefined} className={cn('border-l-2 bg-surface px-4 py-3 text-[14px]', tones[tone], className)}>
      {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
      <div className="text-ink-2">{children}</div>
    </div>
  )
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-[4px] border border-dashed border-line-strong px-6 py-12 text-center">
      <p className="display text-2xl">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-md text-[14px] text-muted">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          type="button"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            '-mb-px shrink-0 cursor-pointer border-b-2 px-3 py-2 text-[13px] font-medium transition-colors',
            value === it.value ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {it.label}
          {it.count !== undefined ? <span className="ml-1.5 text-muted">{it.count}</span> : null}
        </button>
      ))}
    </div>
  )
}

export function Spinner({ label = 'Working' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-[13px] text-muted">
      <span className="h-3 w-3 animate-spin rounded-full border border-line-strong border-t-ink" aria-hidden />
      {label}…
    </span>
  )
}

export function Section({ title, eyebrow, children, className, id }: { title?: React.ReactNode; eyebrow?: string; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn('mb-10', className)}>
      {eyebrow ? <Eyebrow className="mb-1">{eyebrow}</Eyebrow> : null}
      {title ? <h2 className="display mb-4 text-[28px]">{title}</h2> : null}
      {children}
    </section>
  )
}
