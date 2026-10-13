import type { ReactNode } from 'react'

type BaseProps = {
  name: string
  label: string
  error?: string
  help?: string
  required?: boolean
  className?: string
}

export function Field({ name, label, error, help, required, className, children }: BaseProps & { children: ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={name} className="label">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {children}
      {error ? <p className="error" id={`${name}-error`}>{error}</p> : help ? <p className="help">{help}</p> : null}
    </div>
  )
}

type InputProps = BaseProps & {
  type?: string
  defaultValue?: string
  placeholder?: string
  autoComplete?: string
  min?: string
  inputMode?: 'text' | 'tel' | 'email' | 'numeric' | 'decimal'
}

export function TextField({ type = 'text', defaultValue, placeholder, autoComplete, min, inputMode, ...rest }: InputProps) {
  const { name, error, required } = rest
  return (
    <Field {...rest}>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete={autoComplete}
        min={min}
        inputMode={inputMode}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        className={`input ${error ? 'input-error' : ''}`}
      />
    </Field>
  )
}

export function TextArea({ defaultValue, placeholder, rows = 4, ...rest }: BaseProps & { defaultValue?: string; placeholder?: string; rows?: number }) {
  const { name, error, required } = rest
  return (
    <Field {...rest}>
      <textarea
        id={name}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        aria-invalid={Boolean(error)}
        className={`input ${error ? 'input-error' : ''}`}
      />
    </Field>
  )
}

export function Select({
  options,
  defaultValue,
  placeholder,
  ...rest
}: BaseProps & { options: ReadonlyArray<{ value: string; label: string }>; defaultValue?: string; placeholder?: string }) {
  const { name, error, required } = rest
  return (
    <Field {...rest}>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue ?? ''}
        required={required}
        aria-invalid={Boolean(error)}
        className={`input ${error ? 'input-error' : ''}`}
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  )
}
